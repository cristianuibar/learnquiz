import { GUEST_DAILY_MODEL_CALL_CAP } from '@/lib/limits'
import { DatabaseSync } from 'node:sqlite'
import { readFileSync, readdirSync } from 'node:fs'
import { drizzle } from 'drizzle-orm/sqlite-proxy'
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it, onTestFinished, vi } from 'vitest'
import type { z } from 'zod'
import { todayView } from '@learnquiz/api/today'
import { chatJson, LlmError } from '@/lib/llm/client'
import { requireLearnerId } from '@/server/session'

// Only external boundaries are faked: the server-fn transport, auth, model HTTP
// (the client for older placement/generation tests) and Cloudflare bindings. Handlers run for real
// against an in-memory SQLite database speaking the drizzle proxy protocol.
const holder = vi.hoisted(() => ({ db: null as unknown }))

vi.mock('@tanstack/react-start', () => ({
  createServerFn: () => ({
    handler: (fn: unknown) => fn,
    validator: (schema: z.ZodType | ((data: unknown) => unknown)) => ({
      handler: (fn: (input: { data: unknown }) => unknown) => ({ data }: { data: unknown }) => fn({ data: typeof schema === 'function' ? schema(data) : schema.parse(data) }),
    }),
  }),
}))

vi.mock('@/db', () => ({ getDb: () => holder.db }))

vi.mock('@/server/session', () => ({ getLearnerId: vi.fn(async () => 'u1'), requireLearnerId: vi.fn(async () => 'u1'), getSessionUser: async () => ({ id: 'u1', isAnonymous: false }) }))

vi.mock('@/lib/llm/client', async (importOriginal) => {
  const client = await importOriginal<typeof import('@/lib/llm/client')>()
  return {
    ...client,
    chatJson: vi.fn(async (opts) => opts.purpose === 'plan'
      ? client.chatJson(opts) : { line: 'You know the basics and will grow from here.' }),
    chatJsonWithModel: vi.fn(async () => ({ data: { line: 'You know the basics and will grow from here.' }, model: 'muse-spark-1.3' })),
  }
})


vi.mock('cloudflare:workers', () => ({ env: { LLM_PROFILE: 'ollama', LLM_MODEL: 'muse-spark-1.3', LLM_BASE_URL: 'https://llm.example/v1' } }))

import { answerItem, endSession, getSession, getSessionReadiness, nextItem, prepareNextSession, reportItem, startMiniSession, startPlacement, startSession } from './play'
import { getEnv } from '@/server/env'
import { getConceptItems, getTopicPath } from './curriculum'
import { getModelTrace } from './model-trace'
import { getPushSettings } from './push'
import { getToday } from './today'

type Method = 'run' | 'all' | 'values' | 'get'

function makeDb() {
  const raw = new DatabaseSync(':memory:')
  for (const file of readdirSync('drizzle').filter((f) => f.endsWith('.sql')).sort()) {
    raw.exec(readFileSync(`drizzle/${file}`, 'utf8').replaceAll('--> statement-breakpoint', ''))
  }

  const runOne = (sqlText: string, params: unknown[], method: Method): { rows: unknown[] } => {
    if (params.length > 100) throw new Error('D1 supports at most 100 bound parameters per statement')
    const stmt = raw.prepare(sqlText)
    ;(stmt as unknown as { setReturnArrays: (v: boolean) => void }).setReturnArrays(true)
    const args = params as (string | number | bigint | null)[]
    if (method === 'run') {
      stmt.run(...args)
      return { rows: [] }
    }
    if (method === 'get') {
      const row = stmt.get(...args) as unknown[] | undefined
      // drizzle's proxy expects `rows` to be the single row itself for `get`.
      return { rows: row as unknown as unknown[] }
    }
    return { rows: stmt.all(...args) as unknown[] }
  }

  const db = drizzle(
    async (sqlText, params, method) => runOne(sqlText, params, method),
    async (batch) => {
      raw.exec('SAVEPOINT d1_batch')
      try {
        const out = batch.map((q) => runOne(q.sql, q.params, q.method))
        raw.exec('RELEASE d1_batch')
        return out
      } catch (e) {
        raw.exec('ROLLBACK TO d1_batch')
        raw.exec('RELEASE d1_batch')
        throw e
      }
    },
  )
  holder.db = db
  return raw
}

let raw: DatabaseSync
beforeAll(() => { raw = makeDb() })
beforeEach(() => { raw.exec('BEGIN') })
afterEach(() => { raw.exec('ROLLBACK'); vi.restoreAllMocks() })
afterAll(() => { raw.close() })

function seedTopicAndLearner(raw: DatabaseSync, xp: number) {
  raw
    .prepare('INSERT INTO topics (id, learner_id, title, goal, status, created_at) VALUES (?, ?, ?, ?, ?, ?)')
    .run('t1', 'u1', 'Algebra', null, 'ready', 1)
  raw
    .prepare(
      'INSERT INTO learner_topic (learner_id, topic_id, level, rating, last_session_at, streak_count, streak_freeze_available, xp) VALUES (?, ?, ?, ?, ?, ?, ?, ?)',
    )
    .run('u1', 't1', 1, 1500, null, 0, 1, xp)
}

const flag = (raw: DatabaseSync, itemId: string, userId = 'u1') =>
  raw.prepare('INSERT INTO item_flags (id, item_id, user_id, reason, created_at) VALUES (?, ?, ?, ?, ?)').run(`f-${userId}-${itemId}`, itemId, userId, 'other', 1)

const scalar = (raw: DatabaseSync, sqlText: string, ...params: (string | number)[]) =>
  (raw.prepare(sqlText).get(...params) as unknown as Record<string, unknown> | undefined) ?? {}

describe('Wonder session planning', () => {
  const fetchModel = vi.fn()
  const steps = [
    { itemId: 'i2', reason: 'Start with the review most at risk of being forgotten.' },
    { itemId: 'i1', reason: 'Reinforce variables with a second spaced review.' },
    { itemId: 'i3', reason: 'Finish with a familiar concept.' },
  ]
  const response = (output: unknown) => Response.json({
    choices: [{ message: { content: JSON.stringify(output) }, finish_reason: 'stop' }],
    usage: { prompt_tokens: 100, completion_tokens: 50 },
  })
  beforeEach(() => {
    vi.useFakeTimers()
    vi.setSystemTime(new Date('2026-11-02T12:00:00Z'))
    Object.assign(getEnv(), { LLM_PROFILE: 'meta', LLM_BASE_URL: 'https://llm.example/v1', LLM_MODEL: 'muse-spark-1.3', JOB_MODELS: { plan: { provider: 'meta', model: 'muse-wonder-1.0' } } })
    seedTopicAndLearner(raw, 0)
    seedFrontier(raw, 3, true)
    raw.exec(`
      DELETE FROM learner_unit;
      UPDATE learner_item SET due = 1 WHERE item_id = 'i2';
      INSERT INTO learner_concept (learner_id, concept_id, p_known, updated_at) VALUES ('u1', 'c1', 0.8, 1);
    `)
    fetchModel.mockReset().mockImplementation(async () => response({ steps }))
    vi.stubGlobal('fetch', fetchModel)
  })
  afterEach(() => {
    getEnv().LLM_PROFILE = 'ollama'
    getEnv().JOB_MODELS = undefined
    vi.unstubAllGlobals()
    vi.restoreAllMocks()
    vi.useRealTimers()
  })

  it('starts with Wonder’s validated order and exposes its logged call and reasons in the owned trace', async () => {
    const { sessionId } = await startSession({ data: { topicId: 't1' } })
    const stored = scalar(raw, 'SELECT item_ids_json, plan_json FROM sessions WHERE id = ?', sessionId)
    expect(JSON.parse(stored.item_ids_json as string)).toEqual(['i2', 'i1', 'i3'])
    expect(JSON.parse(stored.plan_json as string)).toMatchObject({ planning: { planner: 'muse-wonder-1.0', steps } })
    expect(fetchModel).toHaveBeenCalledTimes(1)
    const [url, request] = fetchModel.mock.calls[0] as [string, RequestInit]
    expect(url).toBe('https://llm.example/v1/chat/completions')
    expect(JSON.parse(request.body as string).model).toBe('muse-wonder-1.0')
    expect(scalar(raw, 'SELECT learner_id, session_id, topic_id, purpose, model, ok FROM model_calls')).toEqual({
      learner_id: 'u1', session_id: sessionId, topic_id: 't1', purpose: 'plan', model: 'muse-wonder-1.0', ok: 1,
    })
    expect((await getSession({ data: { sessionId } })).item?.id).toBe('i2')
    const trace = await getModelTrace({ data: { scope: 'session', sessionId } })
    expect(trace.planning).toEqual({ planner: 'muse-wonder-1.0', steps: steps.map(({ reason }) => ({ reason })) })
    expect(trace.calls).toEqual([expect.objectContaining({ purpose: 'plan', model: 'muse-wonder-1.0', ok: true })])
    vi.mocked(requireLearnerId).mockResolvedValueOnce('u2')
    await expect(getModelTrace({ data: { scope: 'session', sessionId } })).rejects.toMatchObject({ status: 404 })
  })

  it.each([
    { profile: 'ollama', provider: 'meta', model: 'muse-wonder-1.0', url: 'https://api.meta.ai/v1/chat/completions' },
    { profile: 'meta', provider: 'baseten', model: 'muse-spark-open', url: 'https://inference.baseten.co/v1/chat/completions' },
  ] as const)('uses the configured $provider planner when the global profile is $profile', async ({ profile, provider, model, url }) => {
    getEnv().LLM_PROFILE = profile
    getEnv().JOB_MODELS = { plan: { provider, model } }

    const { sessionId } = await startSession({ data: { topicId: 't1' } })

    expect(JSON.parse(scalar(raw, 'SELECT item_ids_json FROM sessions').item_ids_json as string)).toEqual(['i2', 'i1', 'i3'])
    expect(fetchModel).toHaveBeenCalledTimes(1)
    const [calledUrl, request] = fetchModel.mock.calls[0] as [string, RequestInit]
    expect(calledUrl).toBe(url)
    expect(JSON.parse(request.body as string).model).toBe(model)
    const trace = await getModelTrace({ data: { scope: 'session', sessionId } })
    expect(trace.planning?.planner).toBe(model)
    expect(trace.calls).toEqual([expect.objectContaining({ purpose: 'plan', model, ok: true, costUsd: null })])
  })

  it.each([
    { name: 'unreachable model', reply: () => Promise.reject(new Error('connection refused')) },
    { name: 'HTTP failure', reply: () => Promise.resolve(new Response('Unavailable', { status: 503 })) },
    { name: 'malformed JSON', reply: () => Promise.resolve(Response.json({ choices: [{ message: { content: '{' } }] })) },
    { name: 'unknown id', reply: () => Promise.resolve(response({ steps: [{ ...steps[0], itemId: 'foreign' }, ...steps.slice(1)] })) },
    { name: 'duplicate id', reply: () => Promise.resolve(response({ steps: [steps[0], steps[0], steps[2]] })) },
    { name: 'missing item', reply: () => Promise.resolve(response({ steps: steps.slice(1) })) },
    { name: 'extra item', reply: () => Promise.resolve(response({ steps: [...steps, steps[0]] })) },
    { name: 'empty reason', reply: () => Promise.resolve(response({ steps: [{ ...steps[0], reason: ' ' }, ...steps.slice(1)] })) },
    { name: 'multiline reason', reply: () => Promise.resolve(response({ steps: [{ ...steps[0], reason: 'One\nTwo' }, ...steps.slice(1)] })) },
    { name: 'misplaced closer', reply: () => Promise.resolve(response({ steps: [steps[2], steps[0], steps[1]] })) },
  ])('starts the unchanged rules plan on $name, without retrying', async ({ reply }) => {
    fetchModel.mockImplementation(reply)
    const { sessionId } = await startSession({ data: { topicId: 't1' } })
    expect(JSON.parse(scalar(raw, 'SELECT item_ids_json FROM sessions').item_ids_json as string)).toEqual(['i1', 'i2', 'i3'])
    const trace = await getModelTrace({ data: { scope: 'session', sessionId } })
    expect(trace.planning?.planner).toBe('planned by rules')
    expect(trace.planning?.steps).toHaveLength(3)
    expect(trace.calls).toEqual([expect.objectContaining({ purpose: 'plan', model: 'muse-wonder-1.0', ok: false })])
    expect(fetchModel).toHaveBeenCalledTimes(1)
    expect((await getSession({ data: { sessionId } })).item?.id).toBe('i1')
  })

  it('aborts Wonder at four seconds and starts the rules plan', async () => {
    vi.spyOn(AbortSignal, 'timeout').mockImplementation((ms) => {
      const controller = new AbortController()
      setTimeout(() => controller.abort(new DOMException('Timed out', 'TimeoutError')), ms)
      return controller.signal
    })
    let signal: AbortSignal | undefined
    fetchModel.mockImplementation((_url: string, request: RequestInit) => new Promise((_resolve, reject) => {
      signal = request.signal as AbortSignal
      signal.addEventListener('abort', () => reject(signal!.reason), { once: true })
    }))
    const starting = startSession({ data: { topicId: 't1' } })
    await vi.advanceTimersByTimeAsync(0)
    await vi.advanceTimersByTimeAsync(3999)
    expect(scalar(raw, 'SELECT COUNT(*) AS n FROM sessions').n).toBe(0)
    await vi.advanceTimersByTimeAsync(1)
    const { sessionId } = await starting
    expect(signal?.aborted).toBe(true)
    expect(await getModelTrace({ data: { scope: 'session', sessionId } })).toMatchObject({ planning: { planner: 'planned by rules' }, calls: [{ ok: false, latencyMs: 4000 }] })
    expect((await getSession({ data: { sessionId } })).item?.id).toBe('i1')
  })

  it.each([
    { name: 'guest at 150 calls', account: false, calls: 150, local: false, requests: 0 },
    { name: 'account at 150 calls', account: true, calls: 150, local: false, requests: 1 },
    { name: 'account at 500 calls', account: true, calls: 500, local: false, requests: 0 },
    { name: 'local profile', account: false, calls: 0, local: true, requests: 0 },
  ])('respects the daily cap and model routing for $name', async ({ account, calls, local, requests }) => {
    if (account) raw.prepare('INSERT INTO user (id, name, email, is_anonymous) VALUES (?, ?, ?, ?)').run('u1', 'Learner', 'u1@example.test', 0)
    const log = raw.prepare('INSERT INTO model_calls (id, learner_id, purpose, model, latency_ms, ok, created_at) VALUES (?, ?, ?, ?, ?, ?, ?)')
    for (let i = 0; i < calls; i++) log.run(`cap-${i}`, 'u1', 'items', 'muse-spark-1.3', 0, 1, Date.now())
    if (local) { getEnv().LLM_PROFILE = 'ollama'; getEnv().JOB_MODELS = undefined }
    const { sessionId } = await startSession({ data: { topicId: 't1' } })
    const trace = await getModelTrace({ data: { scope: 'session', sessionId } })
    expect(trace.planning?.planner).toBe(requests ? 'muse-wonder-1.0' : 'planned by rules')
    expect(trace.calls).toEqual(requests ? [expect.objectContaining({ purpose: 'plan', model: 'muse-wonder-1.0', ok: true })] : [])
    expect(fetchModel).toHaveBeenCalledTimes(requests)
    expect(scalar(raw, 'SELECT COUNT(*) AS n FROM model_calls').n).toBe(calls + requests)
  })
})

it('opens a notification once, records its open, and finishes after one wrong answer', async () => {
  const now = 1793620800000
  const clock = vi.spyOn(Date, 'now').mockReturnValue(now)
  seedTopicAndLearner(raw, 0)
  raw.prepare('INSERT INTO user (id, name, email) VALUES (?, ?, ?)').run('u1', 'Learner', 'learner@example.test')
  seedFrontier(raw, 1, true)
  raw.prepare('INSERT INTO push_log (id, user_id, subscription_id, item_id, outcome, created_at) VALUES (?, ?, ?, ?, ?, ?)')
    .run('push-1', 'u1', 'device-1', 'i1', 'accepted', 1)
  expect((await getPushSettings()).canPrompt).toBe(false)
  const { sessionId } = await startMiniSession({ data: { itemId: 'i1', pushId: 'push-1' } })
  const openedAt = scalar(raw, 'SELECT opened_at FROM push_log WHERE id = ?', 'push-1').opened_at
  expect(openedAt).toBe(now)
  clock.mockReturnValue(now + 1000)
  expect(await startMiniSession({ data: { itemId: 'i1', pushId: 'push-1' } })).toEqual({ sessionId })
  expect(scalar(raw, 'SELECT opened_at, session_id FROM push_log WHERE id = ?', 'push-1')).toEqual({ opened_at: openedAt, session_id: sessionId })
  expect(scalar(raw, 'SELECT COUNT(*) AS n FROM sessions').n).toBe(1)
  expect(await getSession({ data: { sessionId } })).toMatchObject({ kind: 'mini', item: { id: 'i1' }, progress: { position: 1, total: 1 } })
  const reveal = await answerItem({ data: { sessionId, itemId: 'i1', answer: { text: '2' }, confidence: 'sure', responseMs: 1000 } })
  expect(reveal).toMatchObject({ correct: false, returnsThisSession: false })
  expect(await nextItem({ data: { sessionId } })).toMatchObject({ ended: true, item: null, progress: { total: 1 } })
  expect(await endSession({ data: { sessionId } })).toMatchObject({ kind: 'mini', total: 1, correct: 0 })
  expect(scalar(raw, 'SELECT COUNT(*) AS n FROM attempts WHERE session_id = ?', sessionId).n).toBe(1)
  expect((await getPushSettings()).canPrompt).toBe(true)
  const second = await startMiniSession({ data: { itemId: 'i1' } })
  await answerItem({ data: { sessionId: second.sessionId, itemId: 'i1', answer: { text: '1' }, confidence: 'sure', responseMs: 1000 } })
  await nextItem({ data: { sessionId: second.sessionId } })
  expect((await getPushSettings()).canPrompt).toBe(false)
})

it('refuses another learner’s question or notification and inactive questions without recording an open', async () => {
  seedTopicAndLearner(raw, 0)
  for (const id of ['u1', 'u2']) raw.prepare('INSERT INTO user (id, name, email) VALUES (?, ?, ?)').run(id, id, `${id}@example.test`)
  seedFrontier(raw, 1, true)
  const log = raw.prepare('INSERT INTO push_log (id, user_id, subscription_id, item_id, outcome, created_at) VALUES (?, ?, ?, ?, ?, ?)')
  log.run('other-user', 'u2', 'device-1', 'i1', 'accepted', 1)
  log.run('other-item', 'u1', 'device-1', 'i2', 'accepted', 1)
  log.run('failed-push', 'u1', 'device-1', 'i1', 'failed', 1)
  for (const pushId of ['other-user', 'other-item', 'failed-push', 'missing']) {
    await expect(startMiniSession({ data: { itemId: 'i1', pushId } })).rejects.toMatchObject({ status: 404 })
  }
  vi.mocked(requireLearnerId).mockResolvedValueOnce('u2')
  await expect(startMiniSession({ data: { itemId: 'i1' } })).rejects.toMatchObject({ status: 404 })
  flag(raw, 'i1')
  await expect(startMiniSession({ data: { itemId: 'i1' } })).rejects.toMatchObject({ status: 404 })
  expect(scalar(raw, 'SELECT COUNT(*) AS n FROM sessions').n).toBe(0)
  expect(scalar(raw, 'SELECT COUNT(*) AS n FROM push_log WHERE opened_at IS NOT NULL').n).toBe(0)
})

it.each(['session', 'placement'])('skips retired questions in a queued %s, including reloads', async (kind) => {
  seedTopicAndLearner(raw, 0)
  seedFrontier(raw, 3, false)
  raw.prepare("UPDATE items SET status = 'retired' WHERE id IN ('i1', 'i2')").run()
  const plan = {
    position: 0, answered: false,
    ...(kind === 'placement'
      ? { workingLevel: 1, log: [], pool: ['i1', 'i2', 'i3'].map((id) => ({ id, conceptId: 'c1', difficulty: 1 })) }
      : { queue: ['i1', 'i2', 'i3'], reinserted: [], reasons: { due: 3, frontier: 0, closers: 0 }, unitStart: {} }),
  }
  raw.prepare('INSERT INTO sessions (id, learner_id, topic_id, kind, item_ids_json, plan_json, started_at) VALUES (?, ?, ?, ?, ?, ?, ?)')
    .run('queued', 'u1', 't1', kind, JSON.stringify(kind === 'placement' ? ['i1'] : ['i1', 'i2', 'i3']), JSON.stringify(plan), 1)
  expect((await getSession({ data: { sessionId: 'queued' } })).item?.id).toBe('i3')
  expect(scalar(raw, 'SELECT COUNT(*) AS n FROM attempts').n).toBe(0)
  raw.prepare("UPDATE items SET status = 'retired' WHERE id = 'i3'").run()
  await expect(answerItem({ data: { sessionId: 'queued', itemId: 'i3', answer: { text: '1' }, confidence: 'sure', responseMs: 100 } }))
    .rejects.toMatchObject({ status: 409, message: 'This question has been retired' })
  expect(scalar(raw, 'SELECT COUNT(*) AS n FROM attempts').n).toBe(0)
  expect((await getSession({ data: { sessionId: 'queued' } })).ended).toBe(true)
  expect((await nextItem({ data: { sessionId: 'queued' } })).item).toBeNull()
})

it.each([[1, 2], [10, 12]])('credits the session bonus when the questions after answer %i of %i are retired', async (answered, count) => {
  seedTopicAndLearner(raw, 0)
  seedFrontier(raw, count, false)
  const queue = Array.from({ length: count }, (_, i) => `i${i + 1}`)
  const plan = { queue, position: answered - 1, answered: false, reinserted: [], reasons: { due: count, frontier: 0, closers: 0 }, unitStart: {} }
  raw.prepare('INSERT INTO sessions (id, learner_id, topic_id, kind, item_ids_json, plan_json, started_at) VALUES (?, ?, ?, ?, ?, ?, ?)')
    .run('queued', 'u1', 't1', 'session', JSON.stringify(queue), JSON.stringify(plan), 1)
  const asked = queue[answered - 1]
  await answerItem({ data: { sessionId: 'queued', itemId: asked, answer: { text: '1' }, confidence: 'sure', responseMs: 100 } })
  const xp = scalar(raw, 'SELECT xp FROM sessions WHERE id = ?', 'queued').xp as number
  // Retire the remaining questions while the learner reads the reveal.
  for (const id of queue.slice(answered)) raw.prepare('UPDATE items SET status = ? WHERE id = ?').run('retired', id)
  expect((await nextItem({ data: { sessionId: 'queued' } })).ended).toBe(true)
  expect((await endSession({ data: { sessionId: 'queued' } })).xp).toBe(xp + 20)
  expect(scalar(raw, 'SELECT xp FROM learner_topic WHERE learner_id = ? AND topic_id = ?', 'u1', 't1').xp).toBe(xp + 20)
})

it.each(['session', 'placement'])('excludes retired questions from a new %s', async (kind) => {
  // Items are ordered by creation time; a frozen clock keeps their seeded order.
  vi.useFakeTimers({ toFake: ['Date'] })
  onTestFinished(() => { vi.useRealTimers() })
  seedTopicAndLearner(raw, 0)
  seedFrontier(raw, 7, true)
  raw.prepare("UPDATE items SET status = 'retired' WHERE id = 'i1'").run()
  raw.prepare("DELETE FROM learner_item WHERE item_id <> 'i1'").run()
  const result = await (kind === 'placement' ? startPlacement : startSession)({ data: { topicId: 't1' } })
  const stored = scalar(raw, 'SELECT item_ids_json, plan_json FROM sessions WHERE id = ?', result.sessionId)
  const plan = JSON.parse(stored.plan_json as string)
  expect(JSON.parse(stored.item_ids_json as string)).toEqual(kind === 'placement' ? ['i2'] : ['i2', 'i3', 'i4', 'i5', 'i6', 'i7'])
  if (kind === 'placement') expect(plan.pool.map((i: { id: string }) => i.id)).toEqual(['i2', 'i3', 'i4', 'i5', 'i6', 'i7'])
  expect((await getSession({ data: result })).item?.id).toBe('i2')

})

it('stamps proficient_at once when a role topic meets its benchmark and never clears it', async () => {
  const now = 1793620800000
  const clock = vi.spyOn(Date, 'now').mockReturnValue(now)
  seedTopicAndLearner(raw, 0)
  raw.prepare('INSERT INTO user (id, name, email) VALUES (?, ?, ?)').run('u1', 'Learner', 'learner@example.test')
  raw.prepare('INSERT INTO organization (id, name, slug, created_at) VALUES (?, ?, ?, ?)').run('org-a', 'Alpha', 'alpha', 1)
  raw.prepare('INSERT INTO member (id, organization_id, user_id, role, created_at) VALUES (?, ?, ?, ?, ?)').run('m1', 'org-a', 'u1', 'member', 1)
  raw.prepare('INSERT INTO job_roles (id, org_id, name, benchmark, created_at) VALUES (?, ?, ?, ?, ?)').run('role', 'org-a', 'Analyst', 0.5, 1)
  raw.prepare('INSERT INTO member_role_assignments (user_id, org_id, job_role_id, assigned_at) VALUES (?, ?, ?, ?)').run('u1', 'org-a', 'role', 1)
  raw.prepare('UPDATE topics SET learner_id = NULL, job_role_id = ? WHERE id = ?').run('role', 't1')
  raw.prepare('DELETE FROM learner_topic WHERE topic_id = ?').run('t1')
  seedFrontier(raw, 7, true)
  raw.prepare("DELETE FROM learner_item WHERE item_id <> 'i1'").run()
  raw.prepare('UPDATE concepts SET critical = 1 WHERE id = ?').run('c1')
  raw.prepare('INSERT INTO units (id, topic_id, "order", name) VALUES (?, ?, ?, ?)').run('un2', 't1', 1, 'Later')
  raw.prepare('INSERT INTO concepts (id, topic_id, unit_id, "order", name, summary) VALUES (?, ?, ?, ?, ?, ?)').run('c2', 't1', 'un2', 0, 'Other', '')
  // A critical concept of a retired document has no questions left, so it cannot hold the benchmark back.
  raw.prepare('INSERT INTO sources (id, topic_id, kind, title, body_text, retired_at, created_at) VALUES (?, ?, ?, ?, ?, ?, ?)').run('src-old', 't1', 'text', 'Old', 'Old.', 1, 1)
  raw.prepare('INSERT INTO concepts (id, topic_id, unit_id, "order", name, summary, critical, source_id) VALUES (?, ?, ?, ?, ?, ?, ?, ?)').run('c3', 't1', 'un2', 1, 'Retired', '', 1, 'src-old')
  const learned = raw.prepare('INSERT INTO learner_concept (learner_id, concept_id, p_known, n_attempts, updated_at) VALUES (?, ?, ?, ?, ?)')
  learned.run('u1', 'c1', 0.3, 1, 1)
  learned.run('u1', 'c2', 0.9, 1, 1)
  const proficientAt = () => scalar(raw, 'SELECT proficient_at FROM member_role_assignments WHERE user_id = ?', 'u1').proficient_at
  const { sessionId } = await startSession({ data: { topicId: 't1' } })
  const answer = async (text: string) => {
    const { item } = await getSession({ data: { sessionId } })
    await answerItem({ data: { sessionId, itemId: item!.id, answer: { text }, confidence: 'sure', responseMs: 1000 } })
  }

  // c1: 0.3 -> 0.1870 (below 0.5) -> 0.8343 (met) -> 0.4441 (below again, still stamped).
  await answer('0')
  expect(proficientAt()).toBeNull()
  clock.mockReturnValue(now + 1000)
  await nextItem({ data: { sessionId } })
  await answer('1')
  expect(proficientAt()).toBe(now + 1000)
  clock.mockReturnValue(now + 2000)
  await nextItem({ data: { sessionId } })
  await answer('0')
  expect(scalar(raw, 'SELECT p_known < 0.5 AS low FROM learner_concept WHERE concept_id = ?', 'c1').low).toBe(1)
  expect(proficientAt()).toBe(now + 1000)
})

it('keeps the proficiency stamp when a concurrent answer drops the benchmark right after it is met', async () => {
  seedTopicAndLearner(raw, 0)
  raw.prepare('INSERT INTO user (id, name, email) VALUES (?, ?, ?)').run('u1', 'Learner', 'learner@example.test')
  raw.prepare('INSERT INTO organization (id, name, slug, created_at) VALUES (?, ?, ?, ?)').run('org-a', 'Alpha', 'alpha', 1)
  raw.prepare('INSERT INTO member (id, organization_id, user_id, role, created_at) VALUES (?, ?, ?, ?, ?)').run('m1', 'org-a', 'u1', 'member', 1)
  raw.prepare('INSERT INTO job_roles (id, org_id, name, benchmark, created_at) VALUES (?, ?, ?, ?, ?)').run('role', 'org-a', 'Analyst', 0.5, 1)
  raw.prepare('INSERT INTO member_role_assignments (user_id, org_id, job_role_id, assigned_at) VALUES (?, ?, ?, ?)').run('u1', 'org-a', 'role', 1)
  raw.prepare('UPDATE topics SET learner_id = NULL, job_role_id = ? WHERE id = ?').run('role', 't1')
  raw.prepare('DELETE FROM learner_topic WHERE topic_id = ?').run('t1')
  seedFrontier(raw, 7, true)
  raw.prepare("DELETE FROM learner_item WHERE item_id <> 'i1'").run()
  raw.prepare('INSERT INTO learner_concept (learner_id, concept_id, p_known, n_attempts, updated_at) VALUES (?, ?, ?, ?, ?)').run('u1', 'c1', 0.3, 1, 1)
  const now = 1793620800000
  vi.spyOn(Date, 'now').mockReturnValue(now)
  const sessionIds = [(await startSession({ data: { topicId: 't1' } })).sessionId, (await startSession({ data: { topicId: 't1' } })).sessionId]
  // Both answers are in flight at once: the right one lifts c1 over the benchmark, the wrong one lands after it and drops c1 below.
  await Promise.all(sessionIds.map((sessionId, i) => answerItem({ data: { sessionId, itemId: 'i1', answer: { text: i === 0 ? '1' : '0' }, confidence: 'sure', responseMs: 1000 } })))
  expect((raw.prepare('SELECT correct, p_known_after >= 0.5 AS met FROM attempts ORDER BY rowid').all() as { correct: number; met: number }[]).map((a) => [a.correct, a.met])).toEqual([[1, 1], [0, 0]])
  expect(scalar(raw, 'SELECT p_known < 0.5 AS low FROM learner_concept WHERE concept_id = ?', 'c1').low).toBe(1)
  expect(scalar(raw, 'SELECT proficient_at FROM member_role_assignments WHERE user_id = ?', 'u1').proficient_at).toBe(now)
})

it('hides a reported question from the reporter only, and keeps one open flag per learner with the latest details', async () => {
  seedTopicAndLearner(raw, 0)
  raw.prepare('INSERT INTO user (id, name, email) VALUES (?, ?, ?)').run('u1', 'Learner', 'learner@example.test')
  seedFrontier(raw, 2, true)
  raw.prepare('DELETE FROM learner_item WHERE item_id = ?').run('i2')
  const { sessionId } = await startMiniSession({ data: { itemId: 'i1' } })
  await answerItem({ data: { sessionId, itemId: 'i1', answer: { text: '1' }, confidence: 'sure', responseMs: 1000 } })
  const attemptId = scalar(raw, 'SELECT id FROM attempts WHERE item_id = ?', 'i1').id as string
  raw.prepare('UPDATE items SET source_version = 3 WHERE id = ?').run('i1')
  await expect(reportItem({ data: { itemId: 'i1', attemptId: 'nope' } })).rejects.toMatchObject({ status: 404 })

  await reportItem({ data: { itemId: 'i1', reason: 'unclear', note: 'Which x?', attemptId } })
  expect(raw.prepare('SELECT user_id, reason, note, attempt_id, source_version FROM item_flags').all()).toEqual([
    { user_id: 'u1', reason: 'unclear', note: 'Which x?', attempt_id: attemptId, source_version: 3 },
  ])
  // Reporting again updates the open flag rather than dropping the new details; the attempt stays linked.
  raw.prepare('UPDATE items SET source_version = 4 WHERE id = ?').run('i1')
  await reportItem({ data: { itemId: 'i1', reason: 'incorrect', note: 'The answer is 2', attemptId: null } })
  expect(raw.prepare('SELECT user_id, reason, note, attempt_id, source_version FROM item_flags').all()).toEqual([
    { user_id: 'u1', reason: 'incorrect', note: 'The answer is 2', attempt_id: attemptId, source_version: 4 },
  ])
  expect(scalar(raw, 'SELECT status FROM items WHERE id = ?', 'i1').status).toBe('active')
  expect(await getConceptItems({ data: { conceptId: 'c1' } })).toEqual({ items: [] })
  await expect(startMiniSession({ data: { itemId: 'i1' } })).rejects.toMatchObject({ status: 404 })
  expect(await getSession({ data: { sessionId: (await startSession({ data: { topicId: 't1' } })).sessionId } })).toMatchObject({ item: { id: 'i2' } })

  // Another learner who owns the topic still gets the question.
  raw.prepare('UPDATE topics SET learner_id = ? WHERE id = ?').run('u2', 't1')
  raw.prepare('INSERT INTO learner_item (learner_id, item_id, due, stability, difficulty, state) VALUES (?, ?, ?, ?, ?, ?)').run('u2', 'i1', 1, 1, 5, 2)
  vi.mocked(requireLearnerId).mockResolvedValueOnce('u2')
  expect((await getConceptItems({ data: { conceptId: 'c1' } })).items.map((i) => i.id)).toEqual(['i1'])

  // A resolved flag (Approve in question review) brings the question back for the reporter.
  raw.prepare('UPDATE topics SET learner_id = ? WHERE id = ?').run('u1', 't1')
  raw.prepare('UPDATE item_flags SET resolved_at = 1').run()
  expect((await getConceptItems({ data: { conceptId: 'c1' } })).items.map((i) => i.id)).toEqual(['i1'])
})

it('names the concept behind a sure-and-wrong answer and counts the active reviews still due', async () => {
  const now = 1793620800000
  vi.spyOn(Date, 'now').mockReturnValue(now)
  seedTopicAndLearner(raw, 0)
  seedFrontier(raw, 4, true)
  raw.exec(`UPDATE learner_item SET due = ${now - 1} WHERE item_id IN ('i2', 'i3', 'i4')`)
  flag(raw, 'i4')
  const { sessionId } = await startSession({ data: { topicId: 't1' } })
  const { item } = await getSession({ data: { sessionId } })
  await answerItem({ data: { sessionId, itemId: item!.id, answer: { text: '0' }, confidence: 'sure', responseMs: 1000 } })
  const summary = await endSession({ data: { sessionId } })
  const dueActive = scalar(raw, "SELECT COUNT(*) AS n FROM learner_item li JOIN items i ON i.id = li.item_id WHERE i.topic_id = 't1' AND i.status = 'active' AND li.due <= ? AND i.id NOT IN (SELECT item_id FROM item_flags)", now).n
  expect(summary.benchmark).toBeNull()
  expect(summary.mistakes).toEqual([expect.objectContaining({ conceptName: 'Variables' })])
  expect(summary.nextLine).toMatch(/ Variables comes back first\.$/)
  expect(summary.reviewsLeft).toBe(dueActive)
  expect(summary.reviewsLeft).toBe(2)
})

it('reports the role benchmark, and a mini session earns no session bonus', async () => {
  const now = 1793620800000
  vi.spyOn(Date, 'now').mockReturnValue(now)
  seedTopicAndLearner(raw, 0)
  raw.prepare('INSERT INTO user (id, name, email) VALUES (?, ?, ?)').run('u1', 'Learner', 'learner@example.test')
  seedFrontier(raw, 1, true)
  const first = await startMiniSession({ data: { itemId: 'i1' } })
  await answerItem({ data: { sessionId: first.sessionId, itemId: 'i1', answer: { text: '1' }, confidence: 'sure', responseMs: 1000 } })
  await nextItem({ data: { sessionId: first.sessionId } })
  const summary = await endSession({ data: { sessionId: first.sessionId } })
  expect(summary).toMatchObject({ kind: 'mini', correct: 1, xp: 10, benchmark: null })
  expect(scalar(raw, 'SELECT xp, streak_count, last_session_at FROM learner_topic WHERE topic_id = ?', 't1')).toEqual({ xp: 10, streak_count: 0, last_session_at: null }) // streaks need 10 answers

  raw.prepare('INSERT INTO organization (id, name, slug, created_at) VALUES (?, ?, ?, ?)').run('org-a', 'Alpha', 'alpha', 1)
  raw.prepare('INSERT INTO member (id, organization_id, user_id, role, created_at) VALUES (?, ?, ?, ?, ?)').run('m1', 'org-a', 'u1', 'member', 1)
  raw.prepare('INSERT INTO job_roles (id, org_id, name, benchmark, created_at) VALUES (?, ?, ?, ?, ?)').run('role', 'org-a', 'Analyst', 0.5, 1)
  raw.prepare('INSERT INTO member_role_assignments (user_id, org_id, job_role_id, assigned_at) VALUES (?, ?, ?, ?)').run('u1', 'org-a', 'role', 1)
  raw.prepare('UPDATE topics SET learner_id = NULL, job_role_id = ? WHERE id = ?').run('role', 't1')
  const second = await startMiniSession({ data: { itemId: 'i1' } })
  await answerItem({ data: { sessionId: second.sessionId, itemId: 'i1', answer: { text: '1' }, confidence: 'sure', responseMs: 1000 } })
  await nextItem({ data: { sessionId: second.sessionId } })
  // A role session never serves short answers, so a due one is not a review left.
  raw.prepare('INSERT INTO items (id, concept_id, topic_id, format, payload_json, difficulty_prior, created_at) VALUES (?, ?, ?, ?, ?, ?, ?)').run('s1', 'c1', 't1', 'short', '{}', 1, 1)
  raw.prepare('INSERT INTO learner_item (learner_id, item_id, due, stability, difficulty, state) VALUES (?, ?, ?, ?, ?, ?)').run('u1', 's1', now - 1, 1, 5, 2)
  expect(await endSession({ data: { sessionId: second.sessionId } })).toMatchObject({ kind: 'mini', xp: 10, benchmark: 0.5, reviewsLeft: 0 })
  expect(scalar(raw, 'SELECT xp FROM learner_topic WHERE topic_id = ?', 't1').xp).toBe(20)
})

it.each([
  ['no assignment', "DELETE FROM member_role_assignments"],
  ['an archived role', "UPDATE job_roles SET status = 'archived'"],
  ['no member row', 'DELETE FROM member'],
])('refuses a role topic to a learner with %s', async (_name, breakIt) => {
  seedTopicAndLearner(raw, 0)
  raw.prepare('INSERT INTO user (id, name, email) VALUES (?, ?, ?)').run('u1', 'Learner', 'learner@example.test')
  raw.prepare('INSERT INTO organization (id, name, slug, created_at) VALUES (?, ?, ?, ?)').run('org-a', 'Alpha', 'alpha', 1)
  raw.prepare('INSERT INTO member (id, organization_id, user_id, role, created_at) VALUES (?, ?, ?, ?, ?)').run('m1', 'org-a', 'u1', 'member', 1)
  raw.prepare('INSERT INTO job_roles (id, org_id, name, benchmark, created_at) VALUES (?, ?, ?, ?, ?)').run('role', 'org-a', 'Analyst', 0.5, 1)
  raw.prepare('INSERT INTO member_role_assignments (user_id, org_id, job_role_id, assigned_at) VALUES (?, ?, ?, ?)').run('u1', 'org-a', 'role', 1)
  raw.prepare('UPDATE topics SET learner_id = NULL, job_role_id = ? WHERE id = ?').run('role', 't1')
  raw.prepare('DELETE FROM learner_topic WHERE topic_id = ?').run('t1')
  raw.prepare(breakIt).run()
  await expect(startSession({ data: { topicId: 't1' } })).rejects.toMatchObject({ status: 404, message: 'Topic not found' })
})

function seedFrontier(raw: DatabaseSync, itemCount: number, hasDue: boolean) {
  raw.prepare('INSERT INTO units (id, topic_id, "order", name) VALUES (?, ?, ?, ?)').run('un1', 't1', 0, 'Basics')
  raw.prepare('INSERT INTO learner_unit (learner_id, unit_id, unlocked_at) VALUES (?, ?, ?)').run('u1', 'un1', 1)
  raw.prepare('INSERT INTO concepts (id, topic_id, unit_id, "order", name, summary) VALUES (?, ?, ?, ?, ?, ?)').run('c1', 't1', 'un1', 0, 'Variables', '')
  const payload = JSON.stringify({
    format: 'cloze', stem: 'Solve x + 1 = 2: x = ____.', options: [], accepted_answers: ['1'], model_answer: '1',
    explanation: 'Subtract 1 from both sides.', difficulty: 1, source_quote: null, grounded: false, bloom: 'apply',
  })
  const item = raw.prepare('INSERT INTO items (id, concept_id, topic_id, format, payload_json, difficulty_prior, created_at) VALUES (?, ?, ?, ?, ?, ?, ?)')
  const schedule = raw.prepare('INSERT INTO learner_item (learner_id, item_id, due, stability, difficulty, state) VALUES (?, ?, ?, ?, ?, ?)')
  for (let i = 1; i <= itemCount; i++) {
    item.run(`i${i}`, 'c1', 't1', 'cloze', payload, 1, Date.now())
    schedule.run('u1', `i${i}`, Date.now() + (hasDue && i === 1 ? -1 : 86_400_000), 1, 5, 2)
  }
}

describe('learner practice and unit unlocks', () => {
  beforeEach(() => {
    vi.useFakeTimers({ toFake: ['Date'] })
    vi.setSystemTime(new Date('2026-10-29T12:00:00Z'))
    vi.mocked(chatJson).mockClear()
    seedTopicAndLearner(raw, 0)
  })
  afterEach(() => {
    vi.useRealTimers()
  })

  it.each([
    { format: 'mcq', kind: 'session', answer: { optionId: 'b' }, correct: true, xp: 10, critical: true, sourceVersion: 3, correctOptionIds: ['b'] },
    { format: 'mcq', kind: 'session', answer: { optionId: 'a' }, correct: false, xp: 0, critical: false, sourceVersion: null, correctOptionIds: ['b'] },
    { format: 'mcq', kind: 'placement', answer: { optionId: 'b' }, correct: true, xp: 0, critical: true, sourceVersion: 3, correctOptionIds: ['b'] },
    { format: 'cloze', kind: 'session', answer: { text: '1' }, correct: true, xp: 10, critical: false, sourceVersion: null, correctOptionIds: null },
  ] as const)('reveals $format grading and $xp XP for a $kind answer $answer', async ({ format, kind, answer, correct, xp, critical, sourceVersion, correctOptionIds }) => {
    seedFrontier(raw, 6, true)
    raw.prepare("DELETE FROM learner_item WHERE item_id <> 'i1'").run()
    const payload = JSON.parse(scalar(raw, 'SELECT payload_json FROM items WHERE id = ?', 'i1').payload_json as string)
    const options = format === 'mcq'
      ? ['a', 'b', 'c', 'd'].map((id) => ({ id, text: id === 'b' ? '1' : id, is_correct: id === 'b', feedback: '' }))
      : []
    raw.prepare('UPDATE items SET format = ?, payload_json = ?, source_version = ? WHERE id = ?')
      .run(format, JSON.stringify({ ...payload, format, options }), sourceVersion, 'i1')
    raw.prepare('UPDATE concepts SET critical = ? WHERE id = ?').run(Number(critical), 'c1')
    const { sessionId } = await (kind === 'placement' ? startPlacement : startSession)({ data: { topicId: 't1' } })

    expect((await getSession({ data: { sessionId } })).item).toMatchObject({
      format, blank: format === 'cloze' ? { numeric: true } : null, image: null,
    })
    const reveal = await answerItem({ data: { sessionId, itemId: 'i1', answer, confidence: 'sure', responseMs: 1000 } })

    expect(reveal).toMatchObject({ correct, xp, critical, correctOptionIds, sourceVersion, detail: null })
    expect(scalar(raw, 'SELECT xp, correct_count FROM sessions WHERE id = ?', sessionId)).toEqual({ xp, correct_count: Number(correct) })
    expect(scalar(raw, 'SELECT xp FROM learner_topic').xp).toBe(xp)
    expect(scalar(raw, 'SELECT correct FROM attempts').correct).toBe(Number(correct))
    expect(await nextItem({ data: { sessionId } })).toMatchObject({ ended: false, item: { id: 'i2' } })
  })

  it('continues a large placement pool within the D1 parameter limit and skips retired questions', async () => {
    seedFrontier(raw, 205, false)
    const { sessionId } = await startPlacement({ data: { topicId: 't1' } })
    expect((await getSession({ data: { sessionId } })).item?.id).toBe('i1')
    await answerItem({ data: { sessionId, itemId: 'i1', answer: { text: '1' }, confidence: 'sure', responseMs: 1000 } })
    // The original pool spans several statements; only its last question remains available.
    raw.prepare("UPDATE items SET status = 'retired' WHERE id NOT IN ('i1', 'i205')").run()

    await expect(nextItem({ data: { sessionId } })).resolves.toMatchObject({ ended: false, item: { id: 'i205' } })
    expect(scalar(raw, 'SELECT item_ids_json, correct_count FROM sessions WHERE id = ?', sessionId))
      .toEqual({ item_ids_json: JSON.stringify(['i1', 'i205']), correct_count: 1 })
    expect(scalar(raw, 'SELECT COUNT(*) AS n FROM attempts').n).toBe(1)
  })

  it.each([
    { name: 'a quote with its source', quote: 'Subtract 1 from both sides.', deleted: null, title: 'Algebra Handbook' },
    { name: 'a quote whose source was deleted', quote: 'Subtract 1 from both sides.', deleted: 5, title: null },
    { name: 'no quote', quote: null, deleted: null, title: null },
  ])('reveals the source title for $name', async ({ quote, deleted, title }) => {
    seedFrontier(raw, 1, true)
    raw.prepare('INSERT INTO sources (id, topic_id, kind, title, body_text, deleted_at, created_at) VALUES (?, ?, ?, ?, ?, ?, ?)')
      .run('s1', 't1', 'text', 'Algebra Handbook', 'Subtract 1 from both sides.', deleted, 1)
    const payload = JSON.parse(scalar(raw, 'SELECT payload_json FROM items WHERE id = ?', 'i1').payload_json as string)
    raw.prepare('UPDATE items SET payload_json = ?, source_id = ? WHERE id = ?').run(JSON.stringify({ ...payload, source_quote: quote }), 's1', 'i1')
    const { sessionId } = await startMiniSession({ data: { itemId: 'i1' } })
    const reveal = await answerItem({ data: { sessionId, itemId: 'i1', answer: { text: '1' }, confidence: 'sure', responseMs: 1000 } })
    expect(reveal).toMatchObject({ sourceQuote: quote, sourceTitle: title })
  })

  it('only exposes the learner\'s answered active questions in Path after placement', async () => {
    seedFrontier(raw, 8, false)
    flag(raw, 'i7')
    raw.prepare('UPDATE items SET status = ? WHERE id = ?').run('rejected', 'i8')
    raw.prepare('DELETE FROM learner_item WHERE item_id NOT IN (?, ?)').run('i7', 'i8')
    raw.prepare('INSERT INTO learner_item (learner_id, item_id, due, stability, difficulty, state) VALUES (?, ?, ?, ?, ?, ?)')
      .run('u2', 'i6', Date.now(), 1, 5, 2)

    const { sessionId } = await startPlacement({ data: { topicId: 't1' } })
    const served = await getSession({ data: { sessionId } })
    const { item } = served
    // Being served a question must not reveal its answers before submission.
    expect(JSON.stringify(served)).not.toMatch(/is_correct|accepted_answers|model_answer/)
    expect(JSON.stringify(await nextItem({ data: { sessionId } }))).not.toMatch(/is_correct|accepted_answers|model_answer/)
    expect(await getConceptItems({ data: { conceptId: 'c1' } })).toEqual({ items: [] })
    await answerItem({ data: { sessionId, itemId: item!.id, answer: { text: '1' }, confidence: 'sure', responseMs: 1000 } })
    await endSession({ data: { sessionId } })

    expect((await getTopicPath({ data: { topicId: 't1' } })).learner.placed).toBe(true)
    expect(await getConceptItems({ data: { conceptId: 'c1' } })).toEqual({
      items: [{
        id: item!.id, format: 'cloze', difficultyPrior: 1, generatedBy: null,
        payload: {
          format: 'cloze', stem: 'Solve x + 1 = 2: x = ____.', options: [], accepted_answers: ['1'], model_answer: '1',
          explanation: 'Subtract 1 from both sides.', difficulty: 1, source_quote: null, grounded: false, bloom: 'apply',
        },
      }],
    })
    vi.mocked(requireLearnerId).mockResolvedValueOnce('u2')
    expect(await getConceptItems({ data: { conceptId: 'c1' } })).toEqual({ items: [] })
  })

  it('counts only the learner\'s answered active questions per concept in Path', async () => {
    seedFrontier(raw, 6, false)
    raw.prepare('UPDATE items SET status = ? WHERE id = ?').run('reported', 'i6')
    raw.prepare('DELETE FROM learner_item WHERE item_id IN (?, ?)').run('i4', 'i5')
    const conceptCount = async () => (await getTopicPath({ data: { topicId: 't1' } })).units.flatMap((u) => u.concepts).find((c) => c.id === 'c1')!.answeredCount

    // c1 has 5 active questions; u1 has a schedule for 3 of them (plus a reported one that must not count).
    expect(await conceptCount()).toBe(3)
    expect((await getConceptItems({ data: { conceptId: 'c1' } })).items).toHaveLength(3)

    raw.prepare('UPDATE topics SET learner_id = ? WHERE id = ?').run('u2', 't1')
    raw.prepare('INSERT INTO learner_topic (learner_id, topic_id) VALUES (?, ?)').run('u2', 't1')
    vi.mocked(requireLearnerId).mockResolvedValueOnce('u2')
    expect(await conceptCount()).toBe(0)
  })

  it('marks only units with answered concepts as measured in Path after placement', async () => {
    seedFrontier(raw, 6, false)
    // Placement asks the first, middle and last unit's first concept; unit 2 has no questions and is never asked.
    const payload = JSON.stringify({
      format: 'cloze', stem: 'Solve x + 1 = 2: x = ____.', options: [], accepted_answers: ['1'], model_answer: '1',
      explanation: 'Subtract 1 from both sides.', difficulty: 1, source_quote: null, grounded: false, bloom: 'apply',
    })
    for (const [order, withItems] of [[1, true], [2, false], [3, true]] as const) {
      raw.prepare('INSERT INTO units (id, topic_id, "order", name) VALUES (?, ?, ?, ?)').run(`ux${order}`, 't1', order, `Unit ${order}`)
      raw.prepare('INSERT INTO concepts (id, topic_id, unit_id, "order", name, summary) VALUES (?, ?, ?, ?, ?, ?)')
        .run(`cx${order}`, 't1', `ux${order}`, 0, `Concept ${order}`, '')
      if (withItems) for (let i = 0; i < 6; i++) {
        raw.prepare('INSERT INTO items (id, concept_id, topic_id, format, payload_json, difficulty_prior, created_at) VALUES (?, ?, ?, ?, ?, ?, ?)')
          .run(`cx${order}-i${i}`, `cx${order}`, 't1', 'cloze', payload, 1, Date.now())
      }
    }

    const { sessionId } = await startPlacement({ data: { topicId: 't1' } })
    const { item } = await getSession({ data: { sessionId } })
    await answerItem({ data: { sessionId, itemId: item!.id, answer: { text: '1' }, confidence: 'sure', responseMs: 1000 } })
    await endSession({ data: { sessionId } })

    const path = await getTopicPath({ data: { topicId: 't1' } })
    expect(path.learner.placed).toBe(true)
    const answered = scalar(raw, 'SELECT concept_id FROM learner_concept WHERE n_attempts > 0').concept_id as string
    expect(path.units.filter((u) => u.measured).map((u) => u.concepts[0].id)).toEqual([answered])
    expect(path.units.find((u) => u.id === 'ux2')!.measured).toBe(false)
  })

  it('keeps unit 2 locked in another learner\'s Path and practice after placement', async () => {
    const payload = JSON.stringify({
      format: 'cloze', stem: 'Solve x + 1 = 2: x = ____.', options: [], accepted_answers: ['1'], model_answer: '1',
      explanation: 'Subtract 1 from both sides.', difficulty: 1, source_quote: null, grounded: false, bloom: 'apply',
    })
    for (const order of [0, 1]) {
      const unitId = `un${order + 1}`
      const conceptId = `c${order + 1}`
      raw.prepare('INSERT INTO units (id, topic_id, "order", name) VALUES (?, ?, ?, ?)').run(unitId, 't1', order, `Unit ${order + 1}`)
      raw.prepare('INSERT INTO concepts (id, topic_id, unit_id, "order", name, summary) VALUES (?, ?, ?, ?, ?, ?)')
        .run(conceptId, 't1', unitId, 0, `Concept ${order + 1}`, '')
      for (let i = 0; i < 6; i++) {
        raw.prepare('INSERT INTO items (id, concept_id, topic_id, format, payload_json, difficulty_prior, created_at) VALUES (?, ?, ?, ?, ?, ?, ?)')
          .run(`${conceptId}-i${i}`, conceptId, 't1', 'cloze', payload, 1, Date.now())
      }
    }
    const plan = JSON.stringify({
      position: 7, answered: true, workingLevel: 1,
      log: Array.from({ length: 8 }, () => ({ itemId: 'c1-i0', correct: false, confidence: 'sure', level: 1 })),
      pool: [],
    })
    raw.prepare('INSERT INTO sessions (id, learner_id, topic_id, kind, plan_json, started_at) VALUES (?, ?, ?, ?, ?, ?)')
      .run('s1', 'u1', 't1', 'placement', plan, Date.now())

    await endSession({ data: { sessionId: 's1' } })
    expect((await getTopicPath({ data: { topicId: 't1' } })).units.map((u) => u.unlocked)).toEqual([true, true])
    expect(scalar(raw, 'SELECT COUNT(*) AS n FROM units WHERE unlocked_at IS NOT NULL').n).toBe(0)
    await expect(startSession({ data: { topicId: 't1' } })).resolves.toEqual({ sessionId: expect.any(String) })

    // Retained legacy timestamps must not grant the next learner access.
    raw.prepare('UPDATE units SET unlocked_at = ? WHERE topic_id = ?').run(1, 't1')
    // Transfer ownership so both learners exercise the same stored units through the existing authorization checks.
    raw.prepare('UPDATE topics SET learner_id = ? WHERE id = ?').run('u2', 't1')
    raw.prepare('INSERT INTO learner_topic (learner_id, topic_id) VALUES (?, ?)').run('u2', 't1')
    vi.mocked(requireLearnerId).mockResolvedValueOnce('u2')
    expect((await getTopicPath({ data: { topicId: 't1' } })).units.map((u) => u.unlocked)).toEqual([false, false])
    vi.mocked(requireLearnerId).mockResolvedValueOnce('u2')
    await expect(startSession({ data: { topicId: 't1' } })).rejects.toMatchObject({ status: 409, message: 'Nothing to practice yet' })
    expect(scalar(raw, 'SELECT COUNT(*) AS n FROM sessions WHERE learner_id = ?', 'u2').n).toBe(0)
  })

  it('reports how many questions a session could play now, read-only, null until the topic is ready', async () => {
    seedFrontier(raw, 5, false)
    // i1-i3 unseen, i4 seen and not due, i5 rejected.
    raw.prepare("DELETE FROM learner_item WHERE item_id <> 'i4'").run()
    raw.prepare("UPDATE items SET status = 'rejected' WHERE id = 'i5'").run()
    const learnerRows = () => scalar(raw, 'SELECT COUNT(*) AS n FROM learner_item').n

    expect(await getSessionReadiness({ data: { topicId: 't1' } })).toEqual({ ready: 3, total: 12 })
    expect(learnerRows()).toBe(1)
    raw.prepare("UPDATE learner_item SET due = ? WHERE item_id = 'i4'").run(Date.now() - 1)
    expect(await getSessionReadiness({ data: { topicId: 't1', unitId: 'un1' } })).toEqual({ ready: 4, total: 12 })
    expect(await getSessionReadiness({ data: { topicId: 't1', unitId: 'missing' } })).toEqual({ ready: 0, total: 12 })

    raw.prepare("UPDATE topics SET status = 'generating' WHERE id = 't1'").run()
    expect(await getSessionReadiness({ data: { topicId: 't1' } })).toBeNull()
    await expect(getSessionReadiness({ data: { topicId: 'nope' } })).rejects.toMatchObject({ status: 404 })
  })

  it('counts only unlocked-unit questions as ready, matching the session it starts', async () => {
    const payload = JSON.stringify({
      format: 'cloze', stem: 'Solve x + 1 = 2: x = ____.', options: [], accepted_answers: ['1'], model_answer: '1',
      explanation: 'Subtract 1 from both sides.', difficulty: 1, source_quote: null, grounded: false, bloom: 'apply',
    })
    for (const order of [0, 1]) {
      raw.prepare('INSERT INTO units (id, topic_id, "order", name) VALUES (?, ?, ?, ?)').run(`un${order + 1}`, 't1', order, `Unit ${order + 1}`)
      raw.prepare('INSERT INTO concepts (id, topic_id, unit_id, "order", name, summary) VALUES (?, ?, ?, ?, ?, ?)')
        .run(`c${order + 1}`, 't1', `un${order + 1}`, 0, `Concept ${order + 1}`, '')
      for (let i = 0; i < 6; i++) {
        raw.prepare('INSERT INTO items (id, concept_id, topic_id, format, payload_json, difficulty_prior, created_at) VALUES (?, ?, ?, ?, ?, ?, ?)')
          .run(`c${order + 1}-i${i}`, `c${order + 1}`, 't1', 'cloze', payload, 1, Date.now())
      }
    }
    // Only unit 1 is unlocked; unit 2 stays locked.
    raw.prepare('INSERT INTO learner_unit (learner_id, unit_id, unlocked_at) VALUES (?, ?, ?)').run('u1', 'un1', 1)

    expect(await getSessionReadiness({ data: { topicId: 't1' } })).toEqual({ ready: 6, total: 12 })
    const { sessionId } = await startSession({ data: { topicId: 't1' } })
    expect((JSON.parse(scalar(raw, 'SELECT item_ids_json FROM sessions WHERE id = ?', sessionId).item_ids_json as string) as string[]).length).toBe(6)
  })

  it('scopes a unit session to that unit and refuses locked or foreign units', async () => {
    const payload = JSON.stringify({
      format: 'cloze', stem: 'Solve x + 1 = 2: x = ____.', options: [], accepted_answers: ['1'], model_answer: '1',
      explanation: 'Subtract 1 from both sides.', difficulty: 1, source_quote: null, grounded: false, bloom: 'apply',
    })
    for (const order of [0, 1]) {
      raw.prepare('INSERT INTO units (id, topic_id, "order", name) VALUES (?, ?, ?, ?)').run(`un${order + 1}`, 't1', order, `Unit ${order + 1}`)
      raw.prepare('INSERT INTO learner_unit (learner_id, unit_id, unlocked_at) VALUES (?, ?, ?)').run('u1', `un${order + 1}`, 1)
      raw.prepare('INSERT INTO concepts (id, topic_id, unit_id, "order", name, summary) VALUES (?, ?, ?, ?, ?, ?)')
        .run(`c${order + 1}`, 't1', `un${order + 1}`, 0, `Concept ${order + 1}`, '')
      for (let i = 0; i < 6; i++) {
        raw.prepare('INSERT INTO items (id, concept_id, topic_id, format, payload_json, difficulty_prior, created_at) VALUES (?, ?, ?, ?, ?, ?, ?)')
          .run(`c${order + 1}-i${i}`, `c${order + 1}`, 't1', 'cloze', payload, 1, Date.now())
      }
    }
    // Unit 2 has due reviews and a known concept (closer-eligible), so an unscoped session would reach into it.
    for (let i = 0; i < 3; i++) {
      raw.prepare('INSERT INTO learner_item (learner_id, item_id, due, stability, difficulty, state) VALUES (?, ?, ?, ?, ?, ?)')
        .run('u1', `c2-i${i}`, Date.now() - 86_400_000, 1, 5, 2)
    }
    raw.prepare('INSERT INTO learner_concept (learner_id, concept_id, p_known, n_attempts, updated_at) VALUES (?, ?, ?, ?, ?)').run('u1', 'c2', 0.95, 5, 1)
    const queueConcepts = async (data: { topicId: string; unitId?: string }) => {
      const { sessionId } = await startSession({ data })
      const ids = JSON.parse(scalar(raw, 'SELECT item_ids_json FROM sessions WHERE id = ?', sessionId).item_ids_json as string) as string[]
      return ids.map((id) => scalar(raw, 'SELECT concept_id FROM items WHERE id = ?', id).concept_id as string)
    }

    expect(await queueConcepts({ topicId: 't1' })).toContain('c2')
    const scoped = await queueConcepts({ topicId: 't1', unitId: 'un1' })
    expect(scoped.length).toBeGreaterThan(0)
    expect(new Set(scoped)).toEqual(new Set(['c1']))

    // Refusals write no session.
    const before = scalar(raw, 'SELECT COUNT(*) AS n FROM sessions').n
    raw.prepare('INSERT INTO units (id, topic_id, "order", name) VALUES (?, ?, ?, ?)').run('un3', 't1', 2, 'Unit 3')
    await expect(startSession({ data: { topicId: 't1', unitId: 'un3' } })).rejects.toMatchObject({ status: 409, message: 'Unit is locked' })
    raw.prepare('INSERT INTO topics (id, learner_id, title, goal, status, created_at) VALUES (?, ?, ?, ?, ?, ?)').run('t2', 'u1', 'Geometry', null, 'ready', 1)
    raw.prepare('INSERT INTO units (id, topic_id, "order", name) VALUES (?, ?, ?, ?)').run('ux1', 't2', 0, 'Shapes')
    raw.prepare('INSERT INTO learner_unit (learner_id, unit_id, unlocked_at) VALUES (?, ?, ?)').run('u1', 'ux1', 1)
    await expect(startSession({ data: { topicId: 't1', unitId: 'ux1' } })).rejects.toMatchObject({ status: 404, message: 'Unit not found' })
    await expect(startSession({ data: { topicId: 't1', unitId: 'missing' } })).rejects.toMatchObject({ status: 404, message: 'Unit not found' })
    expect(scalar(raw, 'SELECT COUNT(*) AS n FROM sessions').n).toBe(before)
  })

  it.each([
    { bad: 3, firstConcept: 'c1', basics: true },
    { bad: 2, firstConcept: 'c2', basics: false },
  ])('goes back to basics after $bad weak ended sessions', async ({ bad, firstConcept, basics }) => {
    const payload = JSON.stringify({
      format: 'cloze', stem: 'Solve x + 1 = 2: x = ____.', options: [], accepted_answers: ['1'], model_answer: '1',
      explanation: 'Subtract 1 from both sides.', difficulty: 1, source_quote: null, grounded: false, bloom: 'apply',
    })
    for (const order of [0, 1]) {
      raw.prepare('INSERT INTO units (id, topic_id, "order", name) VALUES (?, ?, ?, ?)').run(`un${order + 1}`, 't1', order, `Unit ${order + 1}`)
      raw.prepare('INSERT INTO learner_unit (learner_id, unit_id, unlocked_at) VALUES (?, ?, ?)').run('u1', `un${order + 1}`, 1)
      raw.prepare('INSERT INTO concepts (id, topic_id, unit_id, "order", name, summary) VALUES (?, ?, ?, ?, ?, ?)')
        .run(`c${order + 1}`, 't1', `un${order + 1}`, 0, `Concept ${order + 1}`, '')
      for (let i = 0; i < 4; i++) {
        raw.prepare('INSERT INTO items (id, concept_id, topic_id, format, payload_json, difficulty_prior, created_at) VALUES (?, ?, ?, ?, ?, ?, ?)')
          .run(`c${order + 1}-i${i}`, `c${order + 1}`, 't1', 'cloze', payload, 1, Date.now())
      }
    }
    // Unit 2 has a due review, which normally opens the session.
    raw.prepare('INSERT INTO learner_item (learner_id, item_id, due, stability, difficulty, state) VALUES (?, ?, ?, ?, ?, ?)')
      .run('u1', 'c2-i0', Date.now() - 86_400_000, 1, 5, 2)
    for (let s = 0; s < bad; s++) {
      raw.prepare('INSERT INTO sessions (id, learner_id, topic_id, kind, item_ids_json, plan_json, started_at, ended_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?)')
        .run(`old${s}`, 'u1', 't1', 'session', '[]', '{}', 1000 + s, 2000 + s)
      for (let a = 0; a < 10; a++) {
        raw.prepare('INSERT INTO attempts (id, learner_id, session_id, item_id, concept_id, at, answer_json, correct, score, confidence, response_ms, rating, p_known_before, p_known_after) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)')
          .run(`old${s}-a${a}`, 'u1', `old${s}`, 'c1-i1', 'c1', 1000 + s, '{}', a < 3 ? 1 : 0, a < 3 ? 1 : 0, 3, 1000, 1, 0.1, 0.1)
      }
    }

    const { sessionId } = await startSession({ data: { topicId: 't1' } })
    const ids = JSON.parse(scalar(raw, 'SELECT item_ids_json FROM sessions WHERE id = ?', sessionId).item_ids_json as string) as string[]
    expect(scalar(raw, 'SELECT concept_id FROM items WHERE id = ?', ids[0]).concept_id).toBe(firstConcept)
    expect(ids.includes('c2-i0')).toBe(true)
    expect(ids[0] === 'c2-i0').toBe(!basics)
    expect((await getSession({ data: { sessionId } })).basics).toBe(basics)
  })

  it('opens back to basics with the earliest weak unit\'s due review when it has no fresh items', async () => {
    const payload = JSON.stringify({
      format: 'cloze', stem: 'Solve x + 1 = 2: x = ____.', options: [], accepted_answers: ['1'], model_answer: '1',
      explanation: 'Subtract 1 from both sides.', difficulty: 1, source_quote: null, grounded: false, bloom: 'apply',
    })
    for (const order of [0, 1]) {
      raw.prepare('INSERT INTO units (id, topic_id, "order", name) VALUES (?, ?, ?, ?)').run(`un${order + 1}`, 't1', order, `Unit ${order + 1}`)
      raw.prepare('INSERT INTO learner_unit (learner_id, unit_id, unlocked_at) VALUES (?, ?, ?)').run('u1', `un${order + 1}`, 1)
      raw.prepare('INSERT INTO concepts (id, topic_id, unit_id, "order", name, summary) VALUES (?, ?, ?, ?, ?, ?)')
        .run(`c${order + 1}`, 't1', `un${order + 1}`, 0, `Concept ${order + 1}`, '')
      for (let i = 0; i < 4; i++) {
        raw.prepare('INSERT INTO items (id, concept_id, topic_id, format, payload_json, difficulty_prior, created_at) VALUES (?, ?, ?, ?, ?, ?, ?)')
          .run(`c${order + 1}-i${i}`, `c${order + 1}`, 't1', 'cloze', payload, 1, Date.now())
      }
    }
    // Unit 1 is all seen: one item is due, the rest are scheduled ahead. Unit 2 is fresh.
    for (let i = 0; i < 4; i++) {
      raw.prepare('INSERT INTO learner_item (learner_id, item_id, due, stability, difficulty, state) VALUES (?, ?, ?, ?, ?, ?)')
        .run('u1', `c1-i${i}`, Date.now() + (i === 0 ? -86_400_000 : 30 * 86_400_000), 1, 5, 2)
    }
    for (let s = 0; s < 3; s++) {
      raw.prepare('INSERT INTO sessions (id, learner_id, topic_id, kind, item_ids_json, plan_json, started_at, ended_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?)')
        .run(`old${s}`, 'u1', 't1', 'session', '[]', '{}', 1000 + s, 2000 + s)
      for (let a = 0; a < 10; a++) {
        raw.prepare('INSERT INTO attempts (id, learner_id, session_id, item_id, concept_id, at, answer_json, correct, score, confidence, response_ms, rating, p_known_before, p_known_after) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)')
          .run(`old${s}-a${a}`, 'u1', `old${s}`, 'c1-i1', 'c1', 1000 + s, '{}', a < 3 ? 1 : 0, a < 3 ? 1 : 0, 3, 1000, 1, 0.1, 0.1)
      }
    }

    const { sessionId } = await startSession({ data: { topicId: 't1' } })
    const ids = JSON.parse(scalar(raw, 'SELECT item_ids_json FROM sessions WHERE id = ?', sessionId).item_ids_json as string) as string[]
    expect(ids[0]).toBe('c1-i0')
    expect(ids.filter((id) => id.startsWith('c2-')).length).toBeGreaterThan(0)
    expect((await getSession({ data: { sessionId } })).basics).toBe(true)
  })

  it.each([
    { frontier: 'underfilled', itemCount: 1, hasDue: true },
    { frontier: 'seen-out', itemCount: 6, hasDue: true },
    { frontier: 'underfilled', itemCount: 1, hasDue: false },
  ])('handles the daily cap with a $frontier frontier and hasDue=$hasDue', async ({ itemCount, hasDue }) => {
    seedFrontier(raw, itemCount, hasDue)
    const log = raw.prepare('INSERT INTO model_calls (id, learner_id, purpose, model, latency_ms, ok, created_at) VALUES (?, ?, ?, ?, ?, ?, ?)')
    for (let i = 0; i < GUEST_DAILY_MODEL_CALL_CAP; i++) log.run(`call-${i}`, 'u1', 'items', 'muse-spark-1.3', 0, 1, Date.now())

    const result = startSession({ data: { topicId: 't1' } })
    if (hasDue) {
      await expect(result).resolves.toEqual({ sessionId: expect.any(String) })
      const { sessionId } = await result
      const stored = scalar(raw, 'SELECT learner_id, topic_id, kind, item_ids_json, plan_json FROM sessions WHERE id = ?', sessionId)
      expect(stored).toMatchObject({ learner_id: 'u1', topic_id: 't1', kind: 'session', item_ids_json: JSON.stringify(['i1']) })
      expect(JSON.parse(stored.plan_json as string)).toMatchObject({ queue: ['i1'], reasons: { due: 1, frontier: 0, closers: 0 } })
    } else {
      await expect(result).rejects.toMatchObject({ status: 429 })
      expect(scalar(raw, 'SELECT COUNT(*) AS n FROM sessions').n).toBe(0)
    }
    expect(chatJson).not.toHaveBeenCalled()
    expect(scalar(raw, 'SELECT COUNT(*) AS n FROM model_calls').n).toBe(GUEST_DAILY_MODEL_CALL_CAP)
  })

  it('refuses both overlapping Starts at the daily cap with 429 when only seen items are stored', async () => {
    seedFrontier(raw, 6, false)
    const log = raw.prepare('INSERT INTO model_calls (id, learner_id, purpose, model, latency_ms, ok, created_at) VALUES (?, ?, ?, ?, ?, ?, ?)')
    for (let i = 0; i < GUEST_DAILY_MODEL_CALL_CAP; i++) log.run(`call-${i}`, 'u1', 'items', 'muse-spark-1.3', 0, 1, Date.now())

    const results = await Promise.allSettled([startSession({ data: { topicId: 't1' } }), startSession({ data: { topicId: 't1' } })])
    expect(results).toMatchObject([{ status: 'rejected', reason: { status: 429 } }, { status: 'rejected', reason: { status: 429 } }])
    expect(scalar(raw, "SELECT gen_status AS s FROM concepts WHERE id = 'c1'").s).toBe('ready')
    expect(scalar(raw, 'SELECT COUNT(*) AS n FROM sessions').n).toBe(0)
    expect(chatJson).not.toHaveBeenCalled()
  })

  it('refuses Start at the daily cap with 429 instead of joining a stale generation claim', async () => {
    seedFrontier(raw, 6, false)
    const log = raw.prepare('INSERT INTO model_calls (id, learner_id, purpose, model, latency_ms, ok, created_at) VALUES (?, ?, ?, ?, ?, ?, ?)')
    for (let i = 0; i < GUEST_DAILY_MODEL_CALL_CAP; i++) log.run(`call-${i}`, 'u1', 'items', 'muse-spark-1.3', 0, 1, Date.now())
    vi.useFakeTimers({ toFake: ['setTimeout', 'Date'] })
    onTestFinished(() => { vi.useRealTimers() })
    raw.prepare("UPDATE concepts SET gen_status = 'generating', gen_started_at = ? WHERE id = 'c1'").run(Date.now() - 11 * 60 * 1000)

    const refused = expect(startSession({ data: { topicId: 't1' } })).rejects.toMatchObject({ status: 429 })
    await vi.advanceTimersByTimeAsync(121_000)
    await refused
    expect(scalar(raw, 'SELECT COUNT(*) AS n FROM sessions').n).toBe(0)
    expect(chatJson).not.toHaveBeenCalled()
  })

  it('joins a preparation that reserved the final cap slot instead of refusing Start', async () => {
    seedFrontier(raw, 1, false)
    const log = raw.prepare('INSERT INTO model_calls (id, learner_id, purpose, model, latency_ms, ok, error, created_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?)')
    for (let i = 0; i < GUEST_DAILY_MODEL_CALL_CAP - 1; i++) log.run(`call-${i}`, 'u1', 'items', 'muse-spark-1.3', 0, 1, null, Date.now())
    // Preparation holds the concept claim and the final, pending slot while its model call is in flight.
    log.run('call-prep', 'u1', 'items', 'muse-spark-1.3', 0, 0, 'pending', Date.now())
    raw.prepare("UPDATE concepts SET gen_status = 'generating', gen_started_at = ? WHERE id = 'c1'").run(Date.now())
    setTimeout(() => {
      raw.prepare('INSERT INTO items (id, concept_id, topic_id, format, payload_json, difficulty_prior, created_at) SELECT ?, concept_id, topic_id, format, payload_json, difficulty_prior, ? FROM items WHERE id = ?')
        .run('i-prep', Date.now(), 'i1')
      raw.prepare("UPDATE concepts SET gen_status = 'ready', gen_started_at = NULL WHERE id = 'c1'").run()
    }, 50)

    const { sessionId } = await startSession({ data: { topicId: 't1' } })
    const plan = JSON.parse(scalar(raw, 'SELECT plan_json FROM sessions WHERE id = ?', sessionId).plan_json as string)
    expect(plan.queue).toContain('i-prep')
    expect(chatJson).not.toHaveBeenCalled()
    expect(scalar(raw, 'SELECT COUNT(*) AS n FROM model_calls').n).toBe(GUEST_DAILY_MODEL_CALL_CAP)
  })

  it.each([new LlmError('Provider rate limit', 429), new Error('Unexpected generation failure')])(
    'propagates other frontier errors when nothing is stored to practise: $message',
    async (error) => {
      // A due item now starts Start without generating, so use a seen, not-due item to force the generation path.
      seedFrontier(raw, 1, false)
      vi.mocked(chatJson).mockRejectedValueOnce(error)

      await expect(startSession({ data: { topicId: 't1' } })).rejects.toThrow(error.message)
      expect(scalar(raw, 'SELECT COUNT(*) AS n FROM sessions').n).toBe(0)
    },
  )

  it('does not generate questions for a concept whose document was retired', async () => {
    seedFrontier(raw, 1, false)
    raw.prepare('INSERT INTO sources (id, topic_id, kind, title, body_text, retired_at, created_at) VALUES (?, ?, ?, ?, ?, ?, ?)')
      .run('src-old', 't1', 'text', 'Handbook', 'Old handbook.', Date.now(), 1)
    raw.prepare("UPDATE concepts SET source_id = 'src-old' WHERE id = 'c1'").run()

    await expect(startSession({ data: { topicId: 't1' } })).rejects.toMatchObject({ status: 409, message: 'Nothing to practice yet' })
    expect(chatJson).not.toHaveBeenCalled()
    expect(scalar(raw, 'SELECT COUNT(*) AS n FROM model_calls').n).toBe(0)
  })

  const PAYLOAD = JSON.stringify({
    format: 'cloze', stem: 'Solve x + 1 = 2: x = ____.', options: [], accepted_answers: ['1'], model_answer: '1',
    explanation: 'Subtract 1 from both sides.', difficulty: 1, source_quote: null, grounded: false, bloom: 'apply',
  })
  const seedSources = () => {
    const src = raw.prepare('INSERT INTO sources (id, topic_id, kind, title, body_text, retired_at, created_at) VALUES (?, ?, ?, ?, ?, ?, ?)')
    src.run('src-old', 't1', 'text', 'Old handbook', 'Old.', Date.now(), 1)
    src.run('src-new', 't1', 'text', 'New handbook', 'New.', null, 1)
  }
  const seedConcept = (id: string, unit: string, order: number, source: string, itemIds: string[]) => {
    raw.prepare('INSERT INTO concepts (id, topic_id, unit_id, "order", name, summary, source_id) VALUES (?, ?, ?, ?, ?, ?, ?)').run(id, 't1', unit, order, id, '', source)
    for (const itemId of itemIds) {
      raw.prepare('INSERT INTO items (id, concept_id, topic_id, format, payload_json, difficulty_prior, created_at) VALUES (?, ?, ?, ?, ?, ?, ?)')
        .run(itemId, id, 't1', 'cloze', PAYLOAD, 1, Date.now())
    }
  }

  it('practises a live document when four retired-document concepts rank first in the frontier', async () => {
    seedSources()
    raw.prepare('INSERT INTO units (id, topic_id, "order", name) VALUES (?, ?, ?, ?)').run('un1', 't1', 0, 'Basics')
    raw.prepare('INSERT INTO learner_unit (learner_id, unit_id, unlocked_at) VALUES (?, ?, ?)').run('u1', 'un1', 1)
    for (let i = 1; i <= 4; i++) seedConcept(`dead${i}`, 'un1', i, 'src-old', [])
    seedConcept('live', 'un1', 5, 'src-new', ['l1', 'l2', 'l3'])

    const { sessionId } = await startSession({ data: { topicId: 't1' } })
    const plan = JSON.parse(scalar(raw, 'SELECT plan_json FROM sessions WHERE id = ?', sessionId).plan_json as string)
    expect([...plan.queue].sort()).toEqual(['l1', 'l2', 'l3'])
    expect(chatJson).not.toHaveBeenCalled()
  })

  it('leaves retired-document concepts out of the session unit mastery', async () => {
    seedSources()
    raw.prepare('INSERT INTO units (id, topic_id, "order", name) VALUES (?, ?, ?, ?)').run('un1', 't1', 0, 'Basics')
    for (let i = 1; i <= 4; i++) seedConcept(`dead${i}`, 'un1', i, 'src-old', [])
    seedConcept('live', 'un1', 5, 'src-new', ['l1'])
    raw.prepare('INSERT INTO learner_concept (learner_id, concept_id, p_known, updated_at) VALUES (?, ?, ?, ?)').run('u1', 'live', 0.9, 1)
    const plan = { queue: ['l1'], position: 1, answered: true, reinserted: [], reasons: { due: 0, frontier: 1, closers: 0 }, unitStart: { un1: 0.4 } }
    raw.prepare('INSERT INTO sessions (id, learner_id, topic_id, kind, item_ids_json, plan_json, started_at, ended_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?)')
      .run('s1', 'u1', 't1', 'session', JSON.stringify(['l1']), JSON.stringify(plan), 1, 2)

    expect((await endSession({ data: { sessionId: 's1' } })).masteryMoved).toEqual([{ unitId: 'un1', unitName: 'Basics', before: 0.4, after: 0.9 }])
  })

  it('places from live concepts when the first concept of every unit cites a retired document', async () => {
    seedSources()
    for (const [i, unit] of ['un1', 'un2', 'un3'].entries()) {
      raw.prepare('INSERT INTO units (id, topic_id, "order", name) VALUES (?, ?, ?, ?)').run(unit, 't1', i, unit)
      seedConcept(`dead-${unit}`, unit, 0, 'src-old', [`d-${unit}`])
      seedConcept(`live-${unit}`, unit, 1, 'src-new', [1, 2, 3, 4, 5, 6].map((n) => `l${n}-${unit}`))
    }

    const { sessionId } = await startPlacement({ data: { topicId: 't1' } })
    const plan = JSON.parse(scalar(raw, 'SELECT plan_json FROM sessions WHERE id = ?', sessionId).plan_json as string)
    const pool = plan.pool as { id: string; conceptId: string }[]
    expect(pool).toHaveLength(18)
    expect(new Set(pool.map((p) => p.conceptId))).toEqual(new Set(['live-un1', 'live-un2', 'live-un3']))
    expect(chatJson).not.toHaveBeenCalled()
  })
})

it.each([
  { poolSize: 3, answers: [true, false, true] },
  { poolSize: 12, answers: Array(8).fill(true) as boolean[] },
  { poolSize: 12, answers: [true, true, false, false, true, true, true, true] },
  { poolSize: 12, answers: [true, false, true, false, true, false, true, true, true, true] },
  { poolSize: 12, answers: [true, true, false, false, true, true, false, false, true, true, false, false] },
])('reports the served count when placement stops after $answers.length answers from $poolSize candidates', async ({ poolSize, answers }) => {
  seedTopicAndLearner(raw, 0)
  seedFrontier(raw, poolSize, false)
  const pool = Array.from({ length: poolSize }, (_, i) => ({ id: `i${i + 1}`, conceptId: 'c1', difficulty: 1 }))
  raw.prepare('INSERT INTO sessions (id, learner_id, topic_id, kind, item_ids_json, plan_json, started_at) VALUES (?, ?, ?, ?, ?, ?, ?)')
    .run('placement-count', 'u1', 't1', 'placement', JSON.stringify(['i1']), JSON.stringify({ position: 0, answered: false, workingLevel: 3, log: [], pool }), 1)
  let view = await getSession({ data: { sessionId: 'placement-count' } })
  for (const [index, correct] of answers.entries()) {
    expect(view.ended).toBe(false)
    expect(view.progress.position).toBe(index + 1)
    // An adaptive placement cannot promise the maximum as its total.
    expect(view.progress.total).toBeLessThanOrEqual(answers.length)
    if (index < answers.length - 1) expect(view.progress.totalKnown).toBe(false)
    const request = { data: { sessionId: view.id, itemId: view.item!.id, answer: { text: correct ? '1' : '0' }, confidence: 'sure' as const, responseMs: 100 } }
    const reveal = await answerItem(request)
    if (index === answers.length - 1) {
      expect(reveal.progress).toEqual({ position: answers.length, total: answers.length })
      expect((await answerItem(request)).progress).toEqual(reveal.progress)
      expect((await getSession({ data: { sessionId: view.id } })).progress).toEqual(reveal.progress)
    }
    view = await nextItem({ data: { sessionId: view.id } })
  }
  expect(view).toMatchObject({ ended: true, item: null, progress: { position: answers.length, total: answers.length } })
  expect((await getSession({ data: { sessionId: view.id } })).progress).toEqual(view.progress)
  expect((await endSession({ data: { sessionId: view.id } })).total).toBe(view.progress.total)
  const today = todayView(await getToday(), new Date())
  expect(today.hero).toMatchObject({ kind: 'done', title: 'Done for today' })
  expect(today.quests).toContainEqual({ key: 'session', label: 'One session', count: null, done: true })
})

it.each(['session', 'placement'])('does not earn One session by leaving a %s after one answer', async (kind) => {
  seedTopicAndLearner(raw, 0)
  seedFrontier(raw, 12, true)
  raw.exec('UPDATE learner_item SET due = 1')
  const { sessionId } = kind === 'placement'
    ? await startPlacement({ data: { topicId: 't1' } })
    : await startSession({ data: { topicId: 't1' } })
  const view = await getSession({ data: { sessionId } })
  await answerItem({ data: { sessionId, itemId: view.item!.id, answer: { text: '1' }, confidence: 'sure', responseMs: 100 } })
  expect((await endSession({ data: { sessionId } })).total).toBe(1)
  const today = todayView(await getToday(), new Date())
  expect(today.hero.kind).not.toBe('done')
  expect(today.quests).toContainEqual({ key: 'session', label: 'One session', count: null, done: false })
})

it('shrinks the ended practice counter to the answers served when the rest are retired', async () => {
  seedTopicAndLearner(raw, 0)
  seedFrontier(raw, 3, true)
  raw.exec('UPDATE learner_item SET due = 1')
  const { sessionId } = await startSession({ data: { topicId: 't1' } })
  const view = await getSession({ data: { sessionId } })
  await answerItem({ data: { sessionId, itemId: view.item!.id, answer: { text: '1' }, confidence: 'sure', responseMs: 100 } })
  raw.prepare('UPDATE items SET status = ? WHERE id != ?').run('retired', view.item!.id)
  expect(await nextItem({ data: { sessionId } })).toMatchObject({ ended: true, progress: { position: 1, total: 1 } })
  expect((await endSession({ data: { sessionId } })).total).toBe(1)
  expect((await getToday()).plan).toMatchObject({ state: 'done', sessionDone: true })
})

it('credits the streak day for a finished session of eight due reviews and nothing fresh', async () => {
  vi.mocked(chatJson).mockClear()
  vi.spyOn(Date, 'now').mockReturnValue(1793620800000)
  seedTopicAndLearner(raw, 0)
  seedFrontier(raw, 8, true)
  raw.prepare('UPDATE learner_item SET due = ?').run(Date.now() - 1)
  const { sessionId } = await startSession({ data: { topicId: 't1' } })
  expect(vi.mocked(chatJson)).not.toHaveBeenCalled()
  let view = await getSession({ data: { sessionId } })
  expect(view.progress.total).toBe(8)
  while (!view.ended) {
    await answerItem({ data: { sessionId, itemId: view.item!.id, answer: { text: '1' }, confidence: 'sure', responseMs: 1000 } })
    view = await nextItem({ data: { sessionId } })
  }
  expect(scalar(raw, 'SELECT COUNT(*) AS n, SUM(correct) AS ok FROM attempts WHERE session_id = ?', sessionId)).toEqual({ n: 8, ok: 8 })
  expect(scalar(raw, 'SELECT streak_count, last_session_at FROM learner_topic WHERE topic_id = ?', 't1')).toEqual({ streak_count: 1, last_session_at: 1793620800000 })
  expect((await getToday()).plan).toMatchObject({ state: 'done', sessionDone: true })
})

it('credits the session bonus once when two finishing nextItem calls race (practice)', async () => {
  seedTopicAndLearner(raw, 100)
  const plan = JSON.stringify({
    queue: ['i1'],
    position: 0,
    answered: true,
    reinserted: [],
    reasons: { due: 0, frontier: 1, closers: 0 },
    unitStart: {},
    lastAttemptId: 'a1',
  })
  raw
    .prepare(
      'INSERT INTO sessions (id, learner_id, topic_id, kind, item_ids_json, plan_json, started_at, ended_at, correct_count, xp) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)',
    )
    .run('s1', 'u1', 't1', 'session', JSON.stringify(['i1']), plan, 1, null, 1, 0)
  raw
    .prepare(
      'INSERT INTO attempts (id, learner_id, session_id, item_id, concept_id, at, answer_json, correct, score, confidence, response_ms, grade_json, rating, p_known_before, p_known_after, retrievability_before) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)',
    )
    .run('a1', 'u1', 's1', 'i1', 'c1', 1, '{}', 1, 1, 'sure', 100, '{}', 3, 0.1, 0.5, null)

  const [a, b] = await Promise.all([nextItem({ data: { sessionId: 's1' } }), nextItem({ data: { sessionId: 's1' } })])

  expect(a.ended).toBe(true)
  expect(b.ended).toBe(true)
  expect(scalar(raw, 'SELECT xp FROM learner_topic WHERE learner_id = ? AND topic_id = ?', 'u1', 't1').xp).toBe(120)
  expect(scalar(raw, 'SELECT ended_at AS endedAt FROM sessions WHERE id = ?', 's1').endedAt).not.toBeNull()
  const summary = await endSession({ data: { sessionId: 's1' } })
  expect(summary.xp).toBe(20)
})

it('lists only units whose rounded mastery changed under Mastery moved', async () => {
  seedTopicAndLearner(raw, 0)
  seedFrontier(raw, 1, false)
  raw.prepare('INSERT INTO units (id, topic_id, "order", name) VALUES (?, ?, ?, ?)').run('un2', 't1', 1, 'Next')
  raw.prepare('INSERT INTO concepts (id, topic_id, unit_id, "order", name, summary) VALUES (?, ?, ?, ?, ?, ?)').run('c2', 't1', 'un2', 0, 'Equations', '')
  const known = raw.prepare('INSERT INTO learner_concept (learner_id, concept_id, p_known, updated_at) VALUES (?, ?, ?, ?)')
  known.run('u1', 'c1', 0.682, 1)
  known.run('u1', 'c2', 0.7, 1)
  const plan = { queue: ['i1'], position: 1, answered: true, reinserted: [], reasons: { due: 0, frontier: 1, closers: 0 }, unitStart: { un1: 0.678, un2: 0.5 } }
  raw.prepare('INSERT INTO sessions (id, learner_id, topic_id, kind, item_ids_json, plan_json, started_at, ended_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?)')
    .run('s1', 'u1', 't1', 'session', JSON.stringify(['i1']), JSON.stringify(plan), 1, 2)

  expect((await endSession({ data: { sessionId: 's1' } })).masteryMoved).toEqual([{ unitId: 'un2', unitName: 'Next', before: 0.5, after: 0.7 }])
})

it('writes exactly one placement when two finishing nextItem calls race (placement)', async () => {
  seedTopicAndLearner(raw, 0)
  raw.prepare('INSERT INTO units (id, topic_id, "order", name, summary, unlocked_at) VALUES (?, ?, ?, ?, ?, ?)').run('un1', 't1', 0, 'Basics', '', null)
  raw
    .prepare(
      'INSERT INTO concepts (id, topic_id, unit_id, "order", name, summary, level, source_id, source_quote, misconceptions_json, grounded, visual, image_key, image_alt) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)',
    )
    .run('c1', 't1', 'un1', 0, 'Variables', '', 3, null, null, '[]', 0, 0, null, null)
  raw
    .prepare(
      'INSERT INTO items (id, concept_id, topic_id, format, payload_json, difficulty_prior, elo_difficulty, check_json, status, created_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)',
    )
    .run('i1', 'c1', 't1', 'mcq', JSON.stringify({ format: 'mcq', stem: 'Q?', options: [], explanation: '', source_quote: '', difficulty: 3 }), 3, null, null, 'active', 1)
  const log = Array.from({ length: 8 }, () => ({ itemId: 'i1', correct: true, confidence: 'sure' as const, level: 4 }))
  const plan = JSON.stringify({
    position: 7,
    answered: true,
    workingLevel: 4,
    log,
    pool: [{ id: 'i1', conceptId: 'c1', difficulty: 3 }],
    lastAttemptId: 'a1',
  })
  raw
    .prepare(
      'INSERT INTO sessions (id, learner_id, topic_id, kind, item_ids_json, plan_json, started_at, ended_at, correct_count, xp) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)',
    )
    .run('s1', 'u1', 't1', 'placement', JSON.stringify(['i1']), plan, 1, null, 8, 0)

  const [a, b] = await Promise.all([nextItem({ data: { sessionId: 's1' } }), nextItem({ data: { sessionId: 's1' } })])

  expect(a.ended).toBe(true)
  expect(b.ended).toBe(true)
  expect(scalar(raw, 'SELECT COUNT(*) AS n FROM placements WHERE id = ?', 's1').n).toBe(1)
  expect(scalar(raw, 'SELECT level FROM learner_topic WHERE learner_id = ? AND topic_id = ?', 'u1', 't1').level).toBe(4)
  expect(scalar(raw, 'SELECT ended_at AS endedAt FROM sessions WHERE id = ?', 's1').endedAt).not.toBeNull()
  const summary = await endSession({ data: { sessionId: 's1' } })
  expect(summary.level).toBe(4)
  expect(summary.levelLineModel).toBe('muse-spark-1.3')
  expect(summary.levelLine).toBe('You know the basics and will grow from here.')
})

it('prepareNextSession generates the next concepts\' items after placement so the first session makes no item calls', async () => {
  seedTopicAndLearner(raw, 0)
  raw.prepare('INSERT INTO units (id, topic_id, "order", name) VALUES (?, ?, ?, ?)').run('un1', 't1', 0, 'Basics')
  const concept = raw.prepare('INSERT INTO concepts (id, topic_id, unit_id, "order", name, summary) VALUES (?, ?, ?, ?, ?, ?)')
  concept.run('c1', 't1', 'un1', 0, 'Variables', '')
  concept.run('c2', 't1', 'un1', 1, 'Equations', '')
  const payload = { format: 'cloze', stem: 'Solve x + 1 = 2: x = ____.', options: [], accepted_answers: ['1'], model_answer: '1', explanation: 'Subtract 1.', difficulty: 3, source_quote: null, grounded: false, bloom: 'apply' }
  raw.prepare('INSERT INTO items (id, concept_id, topic_id, format, payload_json, difficulty_prior, created_at) VALUES (?, ?, ?, ?, ?, ?, ?)')
    .run('i1', 'c1', 't1', 'cloze', JSON.stringify(payload), 3, 1)
  const log = Array.from({ length: 8 }, () => ({ itemId: 'i1', correct: false, confidence: 'sure' as const, level: 1 }))
  raw.prepare('INSERT INTO sessions (id, learner_id, topic_id, kind, item_ids_json, plan_json, started_at, correct_count, xp) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)')
    .run('p1', 'u1', 't1', 'placement', JSON.stringify(['i1']), JSON.stringify({ position: 7, answered: true, workingLevel: 1, log, pool: [{ id: 'i1', conceptId: 'c1', difficulty: 3 }], lastAttemptId: 'a1' }), 1, 0, 0)
  const base = vi.mocked(chatJson).getMockImplementation()!
  const batch = Array.from({ length: 6 }, (_, i) => ({ ...payload, stem: `Solve x + ${i} = ${i + 1}: x = ____.` }))
  vi.mocked(chatJson).mockImplementation(async (opts) => opts.purpose === 'items' ? { items: batch }
    : opts.purpose === 'self_check' ? { results: batch.map((_, index) => ({ index, keep: true, reasons: [] })) } : base(opts))
  onTestFinished(() => { vi.mocked(chatJson).mockImplementation(base) })
  const itemCalls = () => vi.mocked(chatJson).mock.calls.filter(([o]) => o.purpose === 'items').length

  expect((await nextItem({ data: { sessionId: 'p1' } })).ended).toBe(true)
  await expect(prepareNextSession({ data: { sessionId: 'p1' } })).resolves.toEqual({ ok: true })
  expect(scalar(raw, "SELECT COUNT(*) AS n FROM items WHERE concept_id = 'c2'").n).toBe(6)
  const before = itemCalls()

  const { sessionId } = await startSession({ data: { topicId: 't1' } })
  expect(itemCalls() - before).toBe(0)
  const queue = JSON.parse(scalar(raw, 'SELECT item_ids_json AS ids FROM sessions WHERE id = ?', sessionId).ids as string) as string[]
  expect(queue).toHaveLength(12)
  expect(new Set(queue).size).toBe(12)
})

it('startSession answers 503 rather than "Nothing to practice yet" when another generation outlives the join wait', async () => {
  seedTopicAndLearner(raw, 0)
  raw.prepare('INSERT INTO units (id, topic_id, "order", name) VALUES (?, ?, ?, ?)').run('un1', 't1', 0, 'Basics')
  raw.prepare('INSERT INTO concepts (id, topic_id, unit_id, "order", name, summary) VALUES (?, ?, ?, ?, ?, ?)').run('c1', 't1', 'un1', 0, 'Variables', '')
  raw.prepare('INSERT INTO learner_unit (learner_id, unit_id, unlocked_at) VALUES (?, ?, ?)').run('u1', 'un1', 1)
  vi.useFakeTimers({ toFake: ['setTimeout', 'Date'] })
  onTestFinished(() => { vi.useRealTimers() })
  raw.prepare("UPDATE concepts SET gen_status = 'generating', gen_started_at = ? WHERE id = 'c1'").run(Date.now())
  const before = vi.mocked(chatJson).mock.calls.filter(([o]) => o.purpose === 'items').length

  const start = startSession({ data: { topicId: 't1' } })
  const rejected = expect(start).rejects.toMatchObject({ status: 503, message: 'Your questions are still being written. Try again in a moment.' })
  await vi.advanceTimersByTimeAsync(121_000)
  await rejected

  expect(vi.mocked(chatJson).mock.calls.filter(([o]) => o.purpose === 'items').length - before).toBe(0)
  expect(scalar(raw, "SELECT gen_status AS s FROM concepts WHERE id = 'c1'").s).toBe('generating')
})

it('startSession joins an in-flight prepareNextSession generation so one concept is generated once', async () => {
  seedTopicAndLearner(raw, 0)
  raw.prepare('INSERT INTO units (id, topic_id, "order", name) VALUES (?, ?, ?, ?)').run('un1', 't1', 0, 'Basics')
  raw.prepare('INSERT INTO concepts (id, topic_id, unit_id, "order", name, summary) VALUES (?, ?, ?, ?, ?, ?)').run('c1', 't1', 'un1', 0, 'Variables', '')
  const payload = { format: 'cloze', stem: 'Solve x + 1 = 2: x = ____.', options: [], accepted_answers: ['1'], model_answer: '1', explanation: 'Subtract 1.', difficulty: 3, source_quote: null, grounded: false, bloom: 'apply' }
  const log = Array.from({ length: 8 }, () => ({ itemId: 'i1', correct: false, confidence: 'sure' as const, level: 1 }))
  raw.prepare('INSERT INTO items (id, concept_id, topic_id, format, payload_json, difficulty_prior, created_at, status) VALUES (?, ?, ?, ?, ?, ?, ?, ?)')
    .run('i1', 'c1', 't1', 'cloze', JSON.stringify(payload), 3, 1, 'retired')
  raw.prepare('INSERT INTO sessions (id, learner_id, topic_id, kind, item_ids_json, plan_json, started_at, correct_count, xp) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)')
    .run('p1', 'u1', 't1', 'placement', JSON.stringify(['i1']), JSON.stringify({ position: 7, answered: true, workingLevel: 1, log, pool: [{ id: 'i1', conceptId: 'c1', difficulty: 3 }], lastAttemptId: 'a1' }), 1, 0, 0)
  const base = vi.mocked(chatJson).getMockImplementation()!
  const batch = Array.from({ length: 6 }, (_, i) => ({ ...payload, stem: `Solve x + ${i} = ${i + 1}: x = ____.` }))
  let release!: () => void
  const gate = new Promise<void>((r) => { release = r })
  vi.mocked(chatJson).mockImplementation(async (opts) => {
    if (opts.purpose === 'items') { await gate; return { items: batch } }
    return opts.purpose === 'self_check' ? { results: batch.map((_, index) => ({ index, keep: true, reasons: [] })) } : base(opts)
  })
  onTestFinished(() => { vi.mocked(chatJson).mockImplementation(base) })
  const itemCalls = () => vi.mocked(chatJson).mock.calls.filter(([o]) => o.purpose === 'items').length
  expect((await nextItem({ data: { sessionId: 'p1' } })).ended).toBe(true)
  const before = itemCalls()

  const prep = prepareNextSession({ data: { sessionId: 'p1' } })
  await vi.waitFor(() => expect(itemCalls() - before).toBe(1))
  const start = startSession({ data: { topicId: 't1' } })
  await new Promise((r) => setTimeout(r, 50))
  release()
  await prep
  const { sessionId } = await start

  expect(itemCalls() - before).toBe(1)
  expect(scalar(raw, "SELECT COUNT(*) AS n FROM items WHERE concept_id = 'c1' AND status = 'active'").n).toBe(6)
  const queue = JSON.parse(scalar(raw, 'SELECT item_ids_json AS ids FROM sessions WHERE id = ?', sessionId).ids as string) as string[]
  expect(queue).toHaveLength(6)
  expect(scalar(raw, "SELECT gen_status AS s FROM concepts WHERE id = 'c1'").s).toBe('ready')
})

it('prepareNextSession mid-placement generates units 0-1 items so the first session makes no item calls', async () => {
  seedTopicAndLearner(raw, 0)
  const unit = raw.prepare('INSERT INTO units (id, topic_id, "order", name) VALUES (?, ?, ?, ?)')
  unit.run('un1', 't1', 0, 'Basics')
  unit.run('un2', 't1', 1, 'Next')
  const concept = raw.prepare('INSERT INTO concepts (id, topic_id, unit_id, "order", name, summary) VALUES (?, ?, ?, ?, ?, ?)')
  concept.run('c1', 't1', 'un1', 0, 'Variables', '')
  concept.run('c2', 't1', 'un1', 1, 'Equations', '')
  concept.run('c3', 't1', 'un2', 0, 'Functions', '')
  const payload = { format: 'cloze', stem: 'Solve x + 1 = 2: x = ____.', options: [], accepted_answers: ['1'], model_answer: '1', explanation: 'Subtract 1.', difficulty: 3, source_quote: null, grounded: false, bloom: 'apply' }
  raw.prepare('INSERT INTO items (id, concept_id, topic_id, format, payload_json, difficulty_prior, created_at) VALUES (?, ?, ?, ?, ?, ?, ?)')
    .run('i1', 'c1', 't1', 'cloze', JSON.stringify(payload), 3, 1)
  const log = Array.from({ length: 7 }, () => ({ itemId: 'i1', correct: false, confidence: 'sure' as const, level: 1 }))
  raw.prepare('INSERT INTO sessions (id, learner_id, topic_id, kind, item_ids_json, plan_json, started_at, correct_count, xp) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)')
    .run('p1', 'u1', 't1', 'placement', JSON.stringify(['i1']), JSON.stringify({ position: 7, answered: false, workingLevel: 1, log, pool: [{ id: 'i1', conceptId: 'c1', difficulty: 3 }] }), 1, 0, 0)
  const base = vi.mocked(chatJson).getMockImplementation()!
  const batch = Array.from({ length: 6 }, (_, i) => ({ ...payload, stem: `Solve x + ${i} = ${i + 1}: x = ____.` }))
  vi.mocked(chatJson).mockImplementation(async (opts) => opts.purpose === 'items' ? { items: batch }
    : opts.purpose === 'self_check' ? { results: batch.map((_, index) => ({ index, keep: true, reasons: [] })) } : base(opts))
  onTestFinished(() => { vi.mocked(chatJson).mockImplementation(base) })
  const itemCalls = () => vi.mocked(chatJson).mock.calls.filter(([o]) => o.purpose === 'items').length

  await expect(prepareNextSession({ data: { sessionId: 'p1' } })).resolves.toEqual({ ok: true })
  expect(scalar(raw, "SELECT COUNT(*) AS n FROM items WHERE concept_id = 'c2'").n).toBe(6)
  expect(scalar(raw, "SELECT COUNT(*) AS n FROM items WHERE concept_id = 'c3'").n).toBe(6)

  // Finish the placement, then the first session must not wait on generation.
  raw.prepare('UPDATE sessions SET plan_json = ? WHERE id = ?')
    .run(JSON.stringify({ position: 7, answered: true, workingLevel: 1, log: [...log, log[0]], pool: [{ id: 'i1', conceptId: 'c1', difficulty: 3 }], lastAttemptId: 'a1' }), 'p1')
  expect((await nextItem({ data: { sessionId: 'p1' } })).ended).toBe(true)
  const before = itemCalls()
  await startSession({ data: { topicId: 't1' } })
  expect(itemCalls() - before).toBe(0)
})

it('startSession uses stored unseen items without generating when the frontier has enough, even if a concept has fewer than 6', async () => {
  seedTopicAndLearner(raw, 0)
  raw.prepare('INSERT INTO units (id, topic_id, "order", name) VALUES (?, ?, ?, ?)').run('un1', 't1', 0, 'Basics')
  raw.prepare('INSERT INTO learner_unit (learner_id, unit_id, unlocked_at) VALUES (?, ?, ?)').run('u1', 'un1', 1)
  const concept = raw.prepare('INSERT INTO concepts (id, topic_id, unit_id, "order", name, summary) VALUES (?, ?, ?, ?, ?, ?)')
  const item = raw.prepare('INSERT INTO items (id, concept_id, topic_id, format, payload_json, difficulty_prior, created_at) VALUES (?, ?, ?, ?, ?, ?, ?)')
  const payload = JSON.stringify({ format: 'cloze', stem: 'Solve x + 1 = 2: x = ____.', options: [], accepted_answers: ['1'], model_answer: '1', explanation: 'Subtract 1.', difficulty: 3, source_quote: null, grounded: false, bloom: 'apply' })
  for (const [i, n] of [2, 6, 6].entries()) {
    concept.run(`c${i + 1}`, 't1', 'un1', i, `Concept ${i + 1}`, '')
    for (let k = 0; k < n; k++) item.run(`c${i + 1}-i${k}`, `c${i + 1}`, 't1', 'cloze', payload, 3, 1)
  }
  const base = vi.mocked(chatJson).getMockImplementation()!
  vi.mocked(chatJson).mockImplementation(async (opts) => opts.purpose === 'items' ? { items: [JSON.parse(payload)] }
    : opts.purpose === 'self_check' ? { results: [{ index: 0, keep: true, reasons: [] }] } : base(opts))
  onTestFinished(() => { vi.mocked(chatJson).mockImplementation(base) })
  vi.mocked(chatJson).mockClear()

  const { sessionId } = await startSession({ data: { topicId: 't1' } })
  expect(vi.mocked(chatJson).mock.calls.filter(([o]) => o.purpose === 'items')).toHaveLength(0)
  const queue = JSON.parse(scalar(raw, 'SELECT item_ids_json AS ids FROM sessions WHERE id = ?', sessionId).ids as string) as string[]
  expect(queue).toHaveLength(12)
})

it('startSession starts from a few stored unseen items without generating, even when other frontier concepts have none', async () => {
  seedTopicAndLearner(raw, 0)
  raw.prepare('INSERT INTO units (id, topic_id, "order", name) VALUES (?, ?, ?, ?)').run('un1', 't1', 0, 'Basics')
  raw.prepare('INSERT INTO learner_unit (learner_id, unit_id, unlocked_at) VALUES (?, ?, ?)').run('u1', 'un1', 1)
  const concept = raw.prepare('INSERT INTO concepts (id, topic_id, unit_id, "order", name, summary) VALUES (?, ?, ?, ?, ?, ?)')
  const item = raw.prepare('INSERT INTO items (id, concept_id, topic_id, format, payload_json, difficulty_prior, created_at) VALUES (?, ?, ?, ?, ?, ?, ?)')
  const payload = JSON.stringify({ format: 'cloze', stem: 'Solve x + 1 = 2: x = ____.', options: [], accepted_answers: ['1'], model_answer: '1', explanation: 'Subtract 1.', difficulty: 3, source_quote: null, grounded: false, bloom: 'apply' })
  for (const [i, n] of [2, 0, 0].entries()) {
    concept.run(`c${i + 1}`, 't1', 'un1', i, `Concept ${i + 1}`, '')
    for (let k = 0; k < n; k++) item.run(`c${i + 1}-i${k}`, `c${i + 1}`, 't1', 'cloze', payload, 3, 1)
  }
  const base = vi.mocked(chatJson).getMockImplementation()!
  vi.mocked(chatJson).mockImplementation(async (opts) => opts.purpose === 'items' ? { items: [JSON.parse(payload)] }
    : opts.purpose === 'self_check' ? { results: [{ index: 0, keep: true, reasons: [] }] } : base(opts))
  onTestFinished(() => { vi.mocked(chatJson).mockImplementation(base) })
  vi.mocked(chatJson).mockClear()

  const { sessionId } = await startSession({ data: { topicId: 't1' } })
  expect(vi.mocked(chatJson).mock.calls.filter(([o]) => o.purpose === 'items')).toHaveLength(0)
  const queue = JSON.parse(scalar(raw, 'SELECT item_ids_json AS ids FROM sessions WHERE id = ?', sessionId).ids as string) as string[]
  expect([...queue].sort()).toEqual(['c1-i0', 'c1-i1'])
})

it('prepareNextSession also prepares the concepts after the current session\'s four, so mastering them still starts without generating', async () => {
  seedTopicAndLearner(raw, 0)
  raw.prepare('INSERT INTO units (id, topic_id, "order", name) VALUES (?, ?, ?, ?)').run('un1', 't1', 0, 'Basics')
  raw.prepare('INSERT INTO learner_unit (learner_id, unit_id, unlocked_at) VALUES (?, ?, ?)').run('u1', 'un1', 1)
  const concept = raw.prepare('INSERT INTO concepts (id, topic_id, unit_id, "order", name, summary) VALUES (?, ?, ?, ?, ?, ?)')
  const item = raw.prepare('INSERT INTO items (id, concept_id, topic_id, format, payload_json, difficulty_prior, created_at) VALUES (?, ?, ?, ?, ?, ?, ?)')
  const payload = { format: 'cloze', stem: 'Solve x + 1 = 2: x = ____.', options: [], accepted_answers: ['1'], model_answer: '1', explanation: 'Subtract 1.', difficulty: 3, source_quote: null, grounded: false, bloom: 'apply' }
  const stored = ['c1', 'c2', 'c3', 'c4'].flatMap((c) => Array.from({ length: 6 }, (_, k) => `${c}-i${k}`))
  for (let i = 1; i <= 5; i++) concept.run(`c${i}`, 't1', 'un1', i, `Concept ${i}`, '')
  for (const id of stored) item.run(id, id.split('-')[0], 't1', 'cloze', JSON.stringify(payload), 3, 1)
  const base = vi.mocked(chatJson).getMockImplementation()!
  const batch = Array.from({ length: 6 }, (_, i) => ({ ...payload, stem: `Solve x + ${i} = ${i + 1}: x = ____.` }))
  vi.mocked(chatJson).mockImplementation(async (opts) => opts.purpose === 'items' ? { items: batch }
    : opts.purpose === 'self_check' ? { results: batch.map((_, index) => ({ index, keep: true, reasons: [] })) } : base(opts))
  onTestFinished(() => { vi.mocked(chatJson).mockImplementation(base) })
  const itemCalls = () => vi.mocked(chatJson).mock.calls.filter(([o]) => o.purpose === 'items').length

  await startSession({ data: { topicId: 't1' } })
  const current = scalar(raw, "SELECT id FROM sessions WHERE kind = 'session'").id as string
  await prepareNextSession({ data: { sessionId: current } })
  expect(scalar(raw, "SELECT COUNT(*) AS n FROM items WHERE concept_id = 'c5'").n).toBe(6)

  for (let i = 1; i <= 4; i++) raw.prepare('INSERT INTO learner_concept (learner_id, concept_id, p_known, n_attempts, mastered_at, updated_at) VALUES (?, ?, ?, ?, ?, ?)').run('u1', `c${i}`, 0.99, 5, 1, 1)
  for (const id of stored) raw.prepare('INSERT INTO learner_item (learner_id, item_id, due, stability, difficulty, state, reps) VALUES (?, ?, ?, ?, ?, ?, ?)').run('u1', id, Date.now() + 7 * 864e5, 5, 5, 2, 1)
  const before = itemCalls()

  const { sessionId } = await startSession({ data: { topicId: 't1' } })
  expect(itemCalls() - before).toBe(0)
  const queue = JSON.parse(scalar(raw, 'SELECT item_ids_json AS ids FROM sessions WHERE id = ?', sessionId).ids as string) as string[]
  const c5 = (raw.prepare("SELECT id FROM items WHERE concept_id = 'c5'").all() as { id: string }[]).map((r) => r.id)
  expect(c5).toHaveLength(6)
  expect([...queue].sort()).toEqual([...c5].sort())
})

it('replays stored role questions early when every one is scheduled ahead and none is due', async () => {
  seedTopicAndLearner(raw, 0)
  raw.prepare('INSERT INTO user (id, name, email) VALUES (?, ?, ?)').run('u1', 'Learner', 'learner@example.test')
  raw.prepare('INSERT INTO organization (id, name, slug, created_at) VALUES (?, ?, ?, ?)').run('org-a', 'Alpha', 'alpha', 1)
  raw.prepare('INSERT INTO member (id, organization_id, user_id, role, created_at) VALUES (?, ?, ?, ?, ?)').run('m1', 'org-a', 'u1', 'member', 1)
  raw.prepare('INSERT INTO job_roles (id, org_id, name, benchmark, created_at) VALUES (?, ?, ?, ?, ?)').run('role', 'org-a', 'Analyst', 0.5, 1)
  raw.prepare('INSERT INTO member_role_assignments (user_id, org_id, job_role_id, assigned_at) VALUES (?, ?, ?, ?)').run('u1', 'org-a', 'role', 1)
  raw.prepare('UPDATE topics SET learner_id = NULL, job_role_id = ? WHERE id = ?').run('role', 't1')
  seedFrontier(raw, 1, false)
  raw.prepare('INSERT INTO learner_concept (learner_id, concept_id, p_known, n_attempts, updated_at) VALUES (?, ?, ?, ?, ?)').run('u1', 'c1', 0.4, 1, 1)

  const { sessionId } = await startSession({ data: { topicId: 't1' } })
  expect(JSON.parse(scalar(raw, 'SELECT item_ids_json AS ids FROM sessions WHERE id = ?', sessionId).ids as string)).toEqual(['i1'])
})

it('refuses prepareNextSession for another learner\'s session', async () => {
  seedTopicAndLearner(raw, 0)
  raw.prepare('INSERT INTO sessions (id, learner_id, topic_id, kind, started_at) VALUES (?, ?, ?, ?, ?)').run('s1', 'u1', 't1', 'session', 1)
  vi.mocked(requireLearnerId).mockResolvedValueOnce('u2')
  await expect(prepareNextSession({ data: { sessionId: 's1' } })).rejects.toMatchObject({ status: 404 })
})

it('refuses prepareNextSession for another employee on the same role topic', async () => {
  seedTopicAndLearner(raw, 0)
  raw.prepare('INSERT INTO organization (id, name, slug, created_at) VALUES (?, ?, ?, ?)').run('org-a', 'Alpha', 'alpha', 1)
  raw.prepare('INSERT INTO job_roles (id, org_id, name, benchmark, created_at) VALUES (?, ?, ?, ?, ?)').run('role', 'org-a', 'Analyst', 0.5, 1)
  raw.prepare('UPDATE topics SET learner_id = NULL, job_role_id = ? WHERE id = ?').run('role', 't1')
  for (const learnerId of ['u1', 'u2']) {
    raw.prepare('INSERT INTO user (id, name, email) VALUES (?, ?, ?)').run(learnerId, 'Learner', `${learnerId}@example.test`)
    raw.prepare('INSERT INTO member (id, organization_id, user_id, role, created_at) VALUES (?, ?, ?, ?, ?)').run(`m-${learnerId}`, 'org-a', learnerId, 'member', 1)
    raw.prepare('INSERT INTO member_role_assignments (user_id, org_id, job_role_id, assigned_at) VALUES (?, ?, ?, ?)').run(learnerId, 'org-a', 'role', 1)
    raw.prepare('INSERT INTO sessions (id, learner_id, topic_id, kind, started_at) VALUES (?, ?, ?, ?, ?)').run(`s-${learnerId}`, learnerId, 't1', 'session', 1)
  }

  await expect(prepareNextSession({ data: { sessionId: 's-u1' } })).resolves.toEqual({ ok: true })
  vi.mocked(requireLearnerId).mockResolvedValueOnce('u2')
  await expect(prepareNextSession({ data: { sessionId: 's-u2' } })).resolves.toEqual({ ok: true })
  vi.mocked(requireLearnerId).mockResolvedValueOnce('u2')
  await expect(prepareNextSession({ data: { sessionId: 's-u1' } })).rejects.toMatchObject({ status: 404 })
})

it.each([
  [8, true],
  [12, false],
])('reports a %i-answer placement as endedEarly=%s', async (answers, endedEarly) => {
  seedTopicAndLearner(raw, 0)
  const plan = JSON.stringify({
    position: answers - 1, answered: true, workingLevel: 3,
    log: Array.from({ length: answers }, () => ({ itemId: 'i1', correct: true, confidence: 'sure', level: 3 })),
    pool: [],
  })
  raw.prepare('INSERT INTO sessions (id, learner_id, topic_id, kind, plan_json, started_at) VALUES (?, ?, ?, ?, ?, ?)')
    .run('s1', 'u1', 't1', 'placement', plan, Date.now())

  expect((await endSession({ data: { sessionId: 's1' } })).endedEarly).toBe(endedEarly)
})

describe('employees training on their role topic', () => {
  const fetchModel = vi.fn()
  const mcq = (n: number) => JSON.stringify({
    format: 'mcq', stem: `Question ${n}?`, accepted_answers: [], model_answer: '', explanation: 'Because.', difficulty: 1 + (n % 5),
    source_quote: null, grounded: false, bloom: 'apply',
    options: ['a', 'b', 'c'].map((id) => ({ id, text: id, is_correct: id === 'a', feedback: '' })),
  })
  const short = (n: number) => JSON.stringify({
    format: 'short', stem: `Explain ${n}.`, accepted_answers: ['because'], model_answer: 'Because.', explanation: 'Because.', difficulty: 1 + (n % 5),
    source_quote: null, grounded: false, bloom: 'apply', options: [],
  })
  // Company o1 has a role topic with two units of six stored mcq and six short items; company o2 has an employee with its own role.
  const seedRoleTopic = (itemsPerConcept: number) => {
    const org = raw.prepare('INSERT INTO organization (id, name, slug, created_at) VALUES (?, ?, ?, ?)')
    const member = raw.prepare('INSERT INTO member (id, organization_id, user_id, role, created_at) VALUES (?, ?, ?, ?, ?)')
    const role = raw.prepare('INSERT INTO job_roles (id, org_id, name, created_at) VALUES (?, ?, ?, ?)')
    const assign = raw.prepare('INSERT INTO member_role_assignments (user_id, org_id, job_role_id, assigned_at) VALUES (?, ?, ?, ?)')
    for (const [o, user] of [['o1', 'u1'], ['o2', 'u2']]) {
      raw.prepare('INSERT INTO user (id, name, email) VALUES (?, ?, ?)').run(user, user, `${user}@example.test`)
      org.run(o, o, o, 1)
      member.run(`m-${o}`, o, user, 'member', 1)
      role.run(`r-${o}`, o, 'Support agent', 1)
      assign.run(user, o, `r-${o}`, 1)
    }
    raw.prepare('INSERT INTO topics (id, learner_id, org_id, job_role_id, title, goal, status, created_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?)')
      .run('rt', null, 'o1', 'r-o1', 'Support agent', null, 'ready', 1)
    const item = raw.prepare('INSERT INTO items (id, concept_id, topic_id, format, payload_json, difficulty_prior, created_at) VALUES (?, ?, ?, ?, ?, ?, ?)')
    for (const u of [0, 1]) {
      raw.prepare('INSERT INTO units (id, topic_id, "order", name) VALUES (?, ?, ?, ?)').run(`ru${u}`, 'rt', u, `Unit ${u}`)
      raw.prepare('INSERT INTO concepts (id, topic_id, unit_id, "order", name, summary) VALUES (?, ?, ?, ?, ?, ?)').run(`rc${u}`, 'rt', `ru${u}`, 0, `Concept ${u}`, '')
      for (let i = 0; i < itemsPerConcept; i++) {
        item.run(`ri${u}-${i}`, `rc${u}`, 'rt', 'mcq', mcq(i), 1 + (i % 5), i)
        item.run(`rs${u}-${i}`, `rc${u}`, 'rt', 'short', short(i), 1 + (i % 5), i)
      }
    }
  }
  const count = (table: string) => scalar(raw, `SELECT COUNT(*) AS n FROM ${table}`).n
  beforeEach(() => {
    vi.mocked(chatJson).mockClear()
    fetchModel.mockReset()
    vi.stubGlobal('fetch', fetchModel)
  })
  afterEach(() => { vi.unstubAllGlobals() })

  it('lets an assigned employee place and practise on stored items without any model call', async () => {
    seedRoleTopic(6)
    expect(count('learner_topic')).toBe(0)
    const { sessionId } = await startPlacement({ data: { topicId: 'rt' } })
    expect(scalar(raw, 'SELECT COUNT(*) AS n FROM learner_topic WHERE learner_id = ? AND topic_id = ?', 'u1', 'rt').n).toBe(1)
    for (let view = await getSession({ data: { sessionId } }); view.item; view = await nextItem({ data: { sessionId } })) {
      await answerItem({ data: { sessionId, itemId: view.item.id, answer: { optionId: 'a' }, confidence: 'sure', responseMs: 1000 } })
    }
    expect(await endSession({ data: { sessionId } })).toMatchObject({ kind: 'placement', levelLine: expect.stringContaining('landed at level'), levelLineModel: null })
    expect(count('placements')).toBe(1)
    // See your path opens the shared role topic, whose learner_id is NULL.
    const path = await getTopicPath({ data: { topicId: 'rt' } })
    expect(path).toMatchObject({ topic: { id: 'rt', title: 'Support agent' }, company: 'o1', learner: { placed: true } })
    const answered = raw.prepare("SELECT li.item_id AS id FROM learner_item li JOIN items i ON i.id = li.item_id WHERE li.learner_id = 'u1' AND i.concept_id = 'rc0'").all()
    expect(answered.length).toBeGreaterThan(0)
    expect((await getConceptItems({ data: { conceptId: 'rc0' } })).items.map((i) => i.id).sort()).toEqual(answered.map((r) => r.id).sort())

    const practice = await startSession({ data: { topicId: 'rt' } })
    expect((await getSession({ data: practice })).item).not.toBeNull()
    expect(scalar(raw, 'SELECT learner_id FROM topics WHERE id = ?', 'rt').learner_id).toBeNull()
    expect(chatJson).not.toHaveBeenCalled()
    expect(fetchModel).not.toHaveBeenCalled()
    expect(count('model_calls')).toBe(0)
  })

  it('keeps another company’s employee out of the role topic and its sessions', async () => {
    seedRoleTopic(6)
    const { sessionId } = await startPlacement({ data: { topicId: 'rt' } })
    vi.mocked(requireLearnerId).mockResolvedValueOnce('u2')
    await expect(startPlacement({ data: { topicId: 'rt' } })).rejects.toMatchObject({ status: 404, message: 'Topic not found' })
    vi.mocked(requireLearnerId).mockResolvedValueOnce('u2')
    await expect(startSession({ data: { topicId: 'rt' } })).rejects.toMatchObject({ status: 404, message: 'Topic not found' })
    vi.mocked(requireLearnerId).mockResolvedValueOnce('u2')
    await expect(getSession({ data: { sessionId } })).rejects.toMatchObject({ status: 404 })
    expect(scalar(raw, 'SELECT COUNT(*) AS n FROM learner_topic WHERE learner_id = ?', 'u2').n).toBe(0)
  })

  it('asks the employee to wait while the role topic has no stored items', async () => {
    seedRoleTopic(0)
    await expect(startPlacement({ data: { topicId: 'rt' } })).rejects.toMatchObject({ status: 409, message: 'Your training at o1 is being prepared' })
    expect(count('sessions')).toBe(0)
    expect(fetchModel).not.toHaveBeenCalled()
  })

  it('waits for the shared role questions, then starts a session on them without any model call', async () => {
    seedRoleTopic(0)
    raw.exec("UPDATE concepts SET gen_status = 'pending' WHERE topic_id = 'rt'")
    await expect(startSession({ data: { topicId: 'rt' } })).rejects.toMatchObject({ status: 503, message: 'Your training at o1 is being prepared. Try again in a few minutes.' })
    expect(count('sessions')).toBe(0)
    // The company queue stores the concept's questions; the next start plays them.
    const item = raw.prepare('INSERT INTO items (id, concept_id, topic_id, format, payload_json, difficulty_prior, created_at) VALUES (?, ?, ?, ?, ?, ?, ?)')
    for (let i = 0; i < 6; i++) item.run(`rq-${i}`, 'rc0', 'rt', 'mcq', mcq(i), 1 + (i % 5), i)
    const { sessionId } = await startSession({ data: { topicId: 'rt' } })
    expect((await getSession({ data: { sessionId } })).item).not.toBeNull()
    expect(count('learner_unit')).toBe(2)
    expect(chatJson).not.toHaveBeenCalled()
    expect(fetchModel).not.toHaveBeenCalled()
    expect(count('model_calls')).toBe(0)
  })

  it('places on a stored question outside the first concept of each unit', async () => {
    seedRoleTopic(0)
    raw.prepare('INSERT INTO concepts (id, topic_id, unit_id, "order", name, summary) VALUES (?, ?, ?, ?, ?, ?)').run('rc-late', 'rt', 'ru0', 1, 'Later concept', '')
    raw.prepare('INSERT INTO items (id, concept_id, topic_id, format, payload_json, difficulty_prior, created_at) VALUES (?, ?, ?, ?, ?, ?, ?)')
      .run('ri-late', 'rc-late', 'rt', 'mcq', mcq(2), 3, 1)
    const { sessionId } = await startPlacement({ data: { topicId: 'rt' } })
    expect((await getSession({ data: { sessionId } })).item?.id).toBe('ri-late')
    expect(fetchModel).not.toHaveBeenCalled()
  })

  it('never tops up role questions with a model, even when the concepts hold few', async () => {
    seedRoleTopic(1)
    const { sessionId } = await startPlacement({ data: { topicId: 'rt' } })
    const before = count('items')
    expect(await prepareNextSession({ data: { sessionId } })).toEqual({ ok: true })
    expect(chatJson).not.toHaveBeenCalled()
    expect(fetchModel).not.toHaveBeenCalled()
    expect(count('items')).toBe(before)
  })

  it('never serves a short question in a role session', async () => {
    seedRoleTopic(3)
    // The first concept holds one mcq among its short items, so a raw read would mostly pick short ones.
    raw.exec("DELETE FROM items WHERE concept_id = 'rc0' AND format = 'mcq' AND id <> 'ri0-0'")
    const { sessionId } = await startSession({ data: { topicId: 'rt' } })
    const formats: string[] = []
    for (let view = await getSession({ data: { sessionId } }); view.item; view = await nextItem({ data: { sessionId } })) {
      formats.push(view.item.format)
      if (view.item.format === 'short') break
      await answerItem({ data: { sessionId, itemId: view.item.id, answer: { optionId: 'a' }, confidence: 'sure', responseMs: 1000 } })
    }
    expect(formats.length).toBeGreaterThan(0)
    expect(formats).not.toContain('short')
    expect(chatJson).not.toHaveBeenCalled()
    expect(fetchModel).not.toHaveBeenCalled()
  })

  it('practises a later concept\'s stored mcq when the first four frontier concepts hold only short questions', async () => {
    seedRoleTopic(0)
    const concept = raw.prepare('INSERT INTO concepts (id, topic_id, unit_id, "order", name, summary) VALUES (?, ?, ?, ?, ?, ?)')
    const item = raw.prepare('INSERT INTO items (id, concept_id, topic_id, format, payload_json, difficulty_prior, created_at) VALUES (?, ?, ?, ?, ?, ?, ?)')
    for (let c = 1; c <= 4; c++) {
      concept.run(`rshort${c}`, 'rt', 'ru0', c, `Short ${c}`, '')
      item.run(`rs-only${c}`, `rshort${c}`, 'rt', 'short', short(c), 1, c)
    }
    item.run('ri-later', 'rc1', 'rt', 'mcq', mcq(1), 1, 1)
    const { sessionId } = await startSession({ data: { topicId: 'rt' } })
    expect(JSON.parse(scalar(raw, 'SELECT plan_json FROM sessions WHERE id = ?', sessionId).plan_json as string).queue).toEqual(['ri-later'])
    expect(chatJson).not.toHaveBeenCalled()
    expect(fetchModel).not.toHaveBeenCalled()
  })

  it('never serves a due short answer in a role session', async () => {
    seedRoleTopic(1)
    raw.prepare('INSERT INTO learner_item (learner_id, item_id, due, stability, difficulty, state) VALUES (?, ?, ?, ?, ?, ?)')
      .run('u1', 'rs0-0', 1, 1, 5, 2)
    const { sessionId } = await startSession({ data: { topicId: 'rt' } })
    const served = JSON.parse(scalar(raw, 'SELECT item_ids_json FROM sessions WHERE id = ?', sessionId).item_ids_json as string) as string[]
    expect(served.length).toBeGreaterThan(0)
    expect(served).not.toContain('rs0-0')
    expect(chatJson).not.toHaveBeenCalled()
  })

  it('reveals a role short answer ungraded without calling the model', async () => {
    seedRoleTopic(1)
    await startPlacement({ data: { topicId: 'rt' } })
    const { sessionId } = await startMiniSession({ data: { itemId: 'rs0-0' } })
    const reveal = await answerItem({ data: { sessionId, itemId: 'rs0-0', answer: { text: 'because' }, confidence: 'sure', responseMs: 1000 } })
    expect(reveal).toMatchObject({ state: 'ungraded', attemptId: null })
    expect(chatJson).not.toHaveBeenCalled()
    expect(fetchModel).not.toHaveBeenCalled()
    expect(count('model_calls')).toBe(0)
  })
})

describe('replaying an identical answer', () => {
  const ask = (sessionId: string, answer: { optionId: string }, confidence: 'sure' | 'unsure' = 'sure') =>
    answerItem({ data: { sessionId, itemId: 'i1', answer, confidence, responseMs: 1000 } })
  const xps = (sessionId: string) => ({
    session: scalar(raw, 'SELECT xp FROM sessions WHERE id = ?', sessionId).xp,
    topic: scalar(raw, 'SELECT xp FROM learner_topic').xp,
    attempts: scalar(raw, 'SELECT COUNT(*) AS n FROM attempts').n,
  })
  beforeEach(() => {
    seedTopicAndLearner(raw, 0)
    seedFrontier(raw, 6, true)
    const payload = JSON.parse(scalar(raw, 'SELECT payload_json FROM items WHERE id = ?', 'i1').payload_json as string)
    const options = ['a', 'b', 'c'].map((id) => ({ id, text: id, is_correct: id === 'b', feedback: '' }))
    raw.prepare("UPDATE items SET format = 'mcq', payload_json = ?").run(JSON.stringify({ ...payload, format: 'mcq', options }))
  })

  it('returns the original reveal without a second attempt, XP or mastery change', async () => {
    const { sessionId } = await startSession({ data: { topicId: 't1' } })
    const first = await ask(sessionId, { optionId: 'b' })
    expect(first).toMatchObject({ correct: true, xp: 10 })
    const before = { ...xps(sessionId), learner: scalar(raw, 'SELECT p_known, n_attempts FROM learner_concept'), item: scalar(raw, "SELECT due, stability, reps FROM learner_item WHERE item_id = 'i1'") }
    expect(before).toMatchObject({ session: 10, topic: 10, attempts: 1 })

    expect(await ask(sessionId, { optionId: 'b' })).toEqual(first)
    expect({ ...xps(sessionId), learner: scalar(raw, 'SELECT p_known, n_attempts FROM learner_concept'), item: scalar(raw, "SELECT due, stability, reps FROM learner_item WHERE item_id = 'i1'") }).toEqual(before)
  })

  it('rejects a different option or a different confidence', async () => {
    const { sessionId } = await startSession({ data: { topicId: 't1' } })
    await ask(sessionId, { optionId: 'b' })
    await expect(ask(sessionId, { optionId: 'a' })).rejects.toMatchObject({ status: 409 })
    await expect(ask(sessionId, { optionId: 'b' }, 'unsure')).rejects.toMatchObject({ status: 409 })
    expect(xps(sessionId)).toEqual({ session: 10, topic: 10, attempts: 1 })
  })

  it('rejects the same answer once the session has moved to the next question', async () => {
    raw.prepare('UPDATE learner_item SET due = 1').run()
    const { sessionId } = await startSession({ data: { topicId: 't1' } })
    await ask(sessionId, { optionId: 'b' })
    expect(await nextItem({ data: { sessionId } })).toMatchObject({ ended: false })
    await expect(ask(sessionId, { optionId: 'b' })).rejects.toMatchObject({ status: 409, message: 'That is not the current question' })
    expect(xps(sessionId).attempts).toBe(1)
  })

  it('rejects a retry of an ungraded short answer', async () => {
    const payload = JSON.parse(scalar(raw, 'SELECT payload_json FROM items WHERE id = ?', 'i1').payload_json as string)
    raw.prepare("UPDATE items SET format = 'short', payload_json = ? WHERE id = 'i1'").run(JSON.stringify({ ...payload, format: 'short', options: [], model_answer: 'Because.' }))
    vi.mocked(chatJson).mockRejectedValue(new Error('grader down'))
    vi.spyOn(console, 'error').mockImplementation(() => {})
    const { sessionId } = await startMiniSession({ data: { itemId: 'i1' } })
    const answer = { data: { sessionId, itemId: 'i1', answer: { text: 'because' }, confidence: 'sure' as const, responseMs: 1000 } }
    expect(await answerItem(answer)).toMatchObject({ state: 'ungraded', attemptId: null })
    await expect(answerItem(answer)).rejects.toMatchObject({ status: 409 })
    expect(xps(sessionId)).toEqual({ session: 0, topic: 0, attempts: 0 })
  })

  it('keeps returnsThisSession true when replaying a missed question that was re-asked', async () => {
    const { sessionId } = await startSession({ data: { topicId: 't1' } })
    const first = await ask(sessionId, { optionId: 'a' })
    expect(first).toMatchObject({ correct: false, returnsThisSession: true })
    expect(JSON.parse(scalar(raw, 'SELECT plan_json FROM sessions WHERE id = ?', sessionId).plan_json as string).reinserted).toContain('i1')

    expect(await ask(sessionId, { optionId: 'a' })).toEqual(first)
    expect(xps(sessionId).attempts).toBe(1)
  })
})
