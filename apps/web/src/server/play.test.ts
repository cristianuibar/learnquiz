import { DatabaseSync } from 'node:sqlite'
import { readFileSync, readdirSync } from 'node:fs'
import { drizzle } from 'drizzle-orm/sqlite-proxy'
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it, onTestFinished, vi } from 'vitest'
import type { z } from 'zod'
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

vi.mock('@/server/session', () => ({ requireLearnerId: vi.fn(async () => 'u1'), getSessionUser: async () => ({ id: 'u1', isAnonymous: false }) }))

vi.mock('@/lib/llm/client', async (importOriginal) => {
  const client = await importOriginal<typeof import('@/lib/llm/client')>()
  return {
    ...client,
    chatJson: vi.fn(async (opts) => opts.purpose === 'plan'
      ? client.chatJson(opts) : { line: 'You know the basics and will grow from here.' }),
  }
})


vi.mock('cloudflare:workers', () => ({ env: { LLM_PROFILE: 'ollama', LLM_MODEL: 'muse-spark-1.3', LLM_BASE_URL: 'https://llm.example/v1' } }))

import { answerItem, endSession, getSession, nextItem, startMiniSession, startPlacement, startSession } from './play'
import { getEnv } from '@/server/env'
import { getConceptItems, getTopicPath } from './curriculum'
import { getModelTrace } from './model-trace'
import { getPushSettings } from './push'

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
    { name: 'guest at 20 calls', account: false, calls: 20, local: false, requests: 0 },
    { name: 'account at 20 calls', account: true, calls: 20, local: false, requests: 1 },
    { name: 'account at 150 calls', account: true, calls: 150, local: false, requests: 0 },
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
  raw.prepare('UPDATE items SET status = ? WHERE id = ?').run('reported', 'i1')
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
    raw.prepare('UPDATE items SET status = ? WHERE id = ?').run('reported', 'i7')
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
    await expect(startSession({ data: { topicId: 't1' } })).rejects.toMatchObject({ status: 409, message: 'Nothing to practise yet' })
    expect(scalar(raw, 'SELECT COUNT(*) AS n FROM sessions WHERE learner_id = ?', 'u2').n).toBe(0)
  })

  it.each([
    { frontier: 'underfilled', itemCount: 1, hasDue: true },
    { frontier: 'seen-out', itemCount: 6, hasDue: true },
    { frontier: 'underfilled', itemCount: 1, hasDue: false },
  ])('handles the daily cap with a $frontier frontier and hasDue=$hasDue', async ({ itemCount, hasDue }) => {
    seedFrontier(raw, itemCount, hasDue)
    const log = raw.prepare('INSERT INTO model_calls (id, learner_id, purpose, model, latency_ms, ok, created_at) VALUES (?, ?, ?, ?, ?, ?, ?)')
    for (let i = 0; i < 20; i++) log.run(`call-${i}`, 'u1', 'items', 'muse-spark-1.3', 0, 1, Date.now())

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
    expect(scalar(raw, 'SELECT COUNT(*) AS n FROM model_calls').n).toBe(20)
  })

  it.each([new LlmError('Provider rate limit', 429), new Error('Unexpected generation failure')])(
    'propagates other frontier errors even with a due question: $message',
    async (error) => {
      seedFrontier(raw, 1, true)
      vi.mocked(chatJson).mockRejectedValueOnce(error)

      await expect(startSession({ data: { topicId: 't1' } })).rejects.toThrow(error.message)
      expect(scalar(raw, 'SELECT COUNT(*) AS n FROM sessions').n).toBe(0)
    },
  )
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
  expect(summary.levelLine).toBe('You know the basics and will grow from here.')
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
    await expect(startPlacement({ data: { topicId: 'rt' } })).rejects.toMatchObject({ status: 409, message: 'Your training is being prepared' })
    expect(count('sessions')).toBe(0)
    expect(fetchModel).not.toHaveBeenCalled()
  })

  it('waits for the shared role questions, then starts a session on them without any model call', async () => {
    seedRoleTopic(0)
    raw.exec("UPDATE concepts SET gen_status = 'pending' WHERE topic_id = 'rt'")
    await expect(startSession({ data: { topicId: 'rt' } })).rejects.toMatchObject({ status: 503, message: expect.stringContaining('being prepared') })
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
})
