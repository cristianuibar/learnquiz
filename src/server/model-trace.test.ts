import { readFileSync, readdirSync } from 'node:fs'
import { DatabaseSync } from 'node:sqlite'
import { drizzle } from 'drizzle-orm/sqlite-proxy'
import { afterAll, afterEach, beforeAll, beforeEach, expect, it, vi } from 'vitest'

const holder = vi.hoisted(() => ({ db: null as unknown, learnerId: 'u1' as string | null }))
vi.mock('@/db', () => ({ getDb: () => holder.db }))
vi.mock('@/server/session', () => ({ requireLearnerId: async () => {
  if (!holder.learnerId) throw Object.assign(new Error('Sign in first'), { status: 401 })
  return holder.learnerId
} }))
vi.mock('cloudflare:workers', () => ({ env: {
  LLM_PROFILE: 'meta', LLM_BASE_URL: 'https://llm.example', LLM_MODEL: 'muse-spark-1.3',
} }))
// Keep validation, handlers, SQL, model retries and logging real; replace only
// the server-function transport, request identity, bindings and provider HTTP.
vi.mock('@tanstack/react-start', () => ({ createServerFn: () => ({
  validator: (validator: { parse: (data: unknown) => unknown }) => ({
    handler: (fn: (input: { data: unknown }) => unknown) => ({ data }: { data: unknown }) => fn({ data: validator.parse(data) }),
  }),
}) }))

import { createTopic, getTopicPath } from './curriculum'
import { endSession, getSession, startPlacement, startSession } from './play'
import { getModelTrace } from './model-trace'
import { getEnv } from './env'

let raw: DatabaseSync
beforeAll(() => {
  raw = new DatabaseSync(':memory:')
  for (const file of readdirSync('drizzle').filter((f) => f.endsWith('.sql')).sort()) {
    raw.exec(readFileSync(`drizzle/${file}`, 'utf8').replaceAll('--> statement-breakpoint', ''))
  }
  const run = (sql: string, params: unknown[], method: string) => {
    const stmt = raw.prepare(sql)
    stmt.setReturnArrays(true)
    const values = params as (string | number | null)[]
    if (method === 'run') { stmt.run(...values); return { rows: [] } }
    return { rows: (method === 'get' ? stmt.get(...values) : stmt.all(...values)) as unknown[] }
  }
  holder.db = drizzle(async (sql, params, method) => run(sql, params, method), async (batch) => batch.map((q) => run(q.sql, q.params, q.method)))
})
beforeEach(() => {
  raw.exec('BEGIN')
  holder.learnerId = 'u1'
  getEnv().LLM_MODEL = 'muse-spark-1.3'
})
afterEach(() => { raw.exec('ROLLBACK'); vi.unstubAllGlobals() })
afterAll(() => raw.close())

function topic(id: string, learnerId = 'u1') {
  raw.prepare('INSERT INTO topics (id, learner_id, title, status, created_at) VALUES (?, ?, ?, ?, ?)').run(id, learnerId, 'Algebra', 'ready', 1)
}
function session(id: string, topicId: string, learnerId = 'u1') {
  raw.prepare('INSERT INTO sessions (id, topic_id, learner_id, kind, started_at, ended_at) VALUES (?, ?, ?, ?, ?, ?)').run(id, topicId, learnerId, 'session', 1, 2)
}

it('returns every owned session call and exact costs, with generation scoped to its topic', async () => {
  topic('t1'); topic('t2'); topic('t3', 'u2')
  session('s1', 't1'); session('s2', 't1'); session('s3', 't3', 'u2')
  session('transferred', 't3')
  const insert = raw.prepare(`INSERT INTO model_calls
    (id, learner_id, session_id, topic_id, purpose, model, latency_ms, prompt_tokens, completion_tokens, reasoning_tokens, cost_usd, ok, created_at)
    VALUES (?, ?, ?, ?, ?, 'muse-spark-1.3', 123, 100, 200, 20, ?, ?, ?)`)
  const calls = [
    ['curriculum', 'u1', null, 't1', 'curriculum', 0.01, 1, 1],
    ['retry', 'u1', 's1', 't1', 'items', 0.02, 0, 2],
    ['items', 'u1', 's1', 't1', 'items', 0.03, 1, 3],
    ['check', 'u1', 's1', 't1', 'self_check', 0.04, 1, 4],
    ['line', 'u1', 's1', 't1', 'placement_line', 0.05, 1, 5],
    ['voice', 'u1', 's1', 't1', 'voice', 0, 1, 6],
    ['later', 'u1', 's2', 't1', 'items', 0.06, 1, 7],
    ['other-topic', 'u1', null, 't2', 'curriculum', 1, 1, 8],
    ['other-learner', 'u2', 's1', 't1', 'items', 9, 1, 9],
    ['anonymous', null, 's1', 't1', 'items', 9, 1, 10],
    ['foreign', 'u2', 's3', 't3', 'items', 9, 1, 11],
  ] as const
  for (const call of calls) insert.run(...call)

  const trace = await getModelTrace({ data: { scope: 'session', sessionId: 's1' } })
  expect(trace.calls.map((c) => c.id)).toEqual(['retry', 'items', 'check', 'line', 'voice'])
  expect(trace.calls[0]).toEqual({ id: 'retry', purpose: 'items', model: 'muse-spark-1.3', latencyMs: 123, promptTokens: 100, completionTokens: 200, reasoningTokens: 20, costUsd: 0.02, ok: false, createdAt: 2 })
  expect(trace.totalCostUsd).toBe(trace.calls.reduce((sum, c) => sum + c.costUsd, 0))
  expect(trace.totalCostUsd).toBeCloseTo(0.14, 12)
  const generation = await getModelTrace({ data: { scope: 'topic', topicId: 't1' } })
  expect(generation.calls.map((c) => c.id)).toEqual(['curriculum', 'retry', 'items', 'check', 'later'])
  expect(generation.totalCostUsd).toBe(0.16)
  await expect(getModelTrace({ data: { scope: 'topic', topicId: 't2' } })).resolves.toMatchObject({ totalCostUsd: 1 })
  for (const data of [
    { scope: 'session', sessionId: 's3' }, { scope: 'session', sessionId: 'transferred' },
    { scope: 'topic', topicId: 't3' }, { scope: 'topic', topicId: 'missing' },
  ] as const) await expect(getModelTrace({ data })).rejects.toMatchObject({ status: 404 })
  holder.learnerId = null
  await expect(getModelTrace({ data: { scope: 'session', sessionId: 's1' } })).rejects.toMatchObject({ status: 401 })
})

it.each(['placement', 'session'] as const)('traces real %s startup generation, retries and persisted model attribution', async (kind) => {
  const skeleton = { units: Array.from({ length: 4 }, (_, u) => ({
    name: `Unit ${u}`, summary: 'Basics', concepts: Array.from({ length: 4 }, (_, c) => ({
      name: `Concept ${u}-${c}`, summary: 'Variables', visual: false, prerequisites: [], source_quote: null, critical: false, misconceptions: [],
    })),
  })) }
  const items = Array.from({ length: 6 }, (_, i) => ({
    format: 'cloze', stem: `x + ${i} = ${i + 1}; x = ____`, options: [], accepted_answers: ['1'], model_answer: '1',
    explanation: 'Subtract.', difficulty: 3, source_quote: null, grounded: false, bloom: 'apply',
  }))
  let retry = true
  vi.stubGlobal('fetch', vi.fn(async (_url: string, request: RequestInit) => {
    const name = JSON.parse(request.body as string).response_format.json_schema.name
    const content = name === 'item_batch' && retry ? (retry = false, 'invalid JSON') : JSON.stringify(
      name === 'curriculum_skeleton' ? skeleton : name === 'item_batch' ? { items } :
        name === 'self_check' ? { results: items.map((_, index) => ({ index, keep: true, reasons: [] })) } : { line: 'You know variables. Next, practise equations.' },
    )
    return Response.json({ choices: [{ message: { content } }], usage: { prompt_tokens: 100, completion_tokens: 200, completion_tokens_details: { reasoning_tokens: 20 } } })
  }))
  const { topicId } = await createTopic({ data: { topic: 'Algebra' } })
  const path = await getTopicPath({ data: { topicId } })
  if (kind === 'session') raw.prepare('INSERT INTO learner_unit (learner_id, unit_id, unlocked_at) VALUES (?, ?, ?)').run('u1', path.units[0].id, 1)
  const { sessionId } = await (kind === 'placement' ? startPlacement : startSession)({ data: { topicId } })
  const view = await getSession({ data: { sessionId } })
  const initialTrace = await getModelTrace({ data: { scope: 'session', sessionId } })
  expect(initialTrace.calls).toHaveLength(kind === 'placement' ? 7 : 9)
  expect(initialTrace.calls.filter((c) => !c.ok)).toHaveLength(1)
  if (kind === 'placement') {
    const row = raw.prepare('SELECT plan_json FROM sessions WHERE id = ?').get(sessionId) as { plan_json: string }
    const plan = JSON.parse(row.plan_json)
    plan.log = Array.from({ length: 8 }, () => ({ itemId: view.item!.id, correct: true, confidence: 'sure', level: 3 }))
    raw.prepare('UPDATE sessions SET plan_json = ? WHERE id = ?').run(JSON.stringify(plan), sessionId)
  }
  const summary = await endSession({ data: { sessionId } })
  getEnv().LLM_MODEL = 'a-different-model'
  expect(path.topic.generatedBy).toBe('muse-spark-1.3')
  expect((await getSession({ data: { sessionId } })).ended).toBe(true)
  expect(view.item?.generatedBy).toBe('muse-spark-1.3')
  const stored = raw.prepare('SELECT generated_by FROM items WHERE concept_id = ?').all(view.item!.conceptId) as { generated_by: string }[]
  expect(stored.map((i) => i.generated_by)).toEqual(Array(6).fill('muse-spark-1.3'))
  if (kind === 'placement') {
    expect(summary.levelLineModel).toBe('muse-spark-1.3')
    expect((await getTopicPath({ data: { topicId } })).learner.levelLineModel).toBe('muse-spark-1.3')
  }
  const trace = await getModelTrace({ data: { scope: 'session', sessionId } })
  expect(trace.calls).toHaveLength(kind === 'placement' ? 8 : 9)
  expect(trace.calls.every((c) => c.costUsd === 0.000975)).toBe(true)
  const total = raw.prepare('SELECT SUM(cost_usd) AS cost FROM model_calls WHERE session_id = ?').get(sessionId) as { cost: number }
  expect(trace.totalCostUsd).toBe(trace.calls.reduce((sum, c) => sum + c.costUsd, 0))
  expect(trace.totalCostUsd).toBeCloseTo(total.cost, 12)
  expect((await getModelTrace({ data: { scope: 'topic', topicId } })).calls).toHaveLength(kind === 'placement' ? 8 : 10)
})
