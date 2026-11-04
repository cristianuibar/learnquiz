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
import { answerItem, endSession, getSession, startSession } from './play'
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
  getEnv().JOB_MODELS = undefined
})
afterEach(() => { raw.exec('ROLLBACK'); vi.unstubAllGlobals() })
afterAll(() => raw.close())


const skeleton = { units: Array.from({ length: 4 }, (_, u) => ({
  name: `Unit ${u}`, summary: 'Basics', concepts: Array.from({ length: 4 }, (_, c) => ({
    name: `Concept ${u}-${c}`, summary: 'Variables', visual: false, prerequisites: [], source_quote: null, critical: false, misconceptions: [],
  })),
})) }
const generated = Array.from({ length: 6 }, (_, i) => ({
  format: 'cloze', stem: `x + ${i} = ${i + 1}; x = ____`, options: [], accepted_answers: ['1'], model_answer: '1',
  explanation: 'Subtract.', difficulty: 3, source_quote: null, grounded: false, bloom: 'apply',
}))

// A fake Meta endpoint: every structured job answers with valid content.
function stubModels() {
  vi.stubGlobal('fetch', vi.fn(async (_url: string, request: RequestInit) => {
    const body = JSON.parse(request.body as string)
    const name = body.response_format.json_schema.name
    const content = JSON.stringify(
      name === 'curriculum_skeleton' ? skeleton : name === 'item_batch' ? { items: generated } :
        name === 'session_plan' ? { steps: JSON.parse(body.messages[1].content).candidates.map((c: { itemId: string }) => ({ itemId: c.itemId, reason: 'Practise this concept first.' })) } :
        name === 'self_check' ? { results: generated.map((_, index) => ({ index, keep: true, reasons: [] })) } : { line: 'You know variables.' },
    )
    return Response.json({ choices: [{ message: { content } }], usage: { prompt_tokens: 1, completion_tokens: 1 } })
  }))
}

function logCall(id: string, scope: { sessionId?: string; topicId: string }, purpose: string, model: string, ok = true) {
  raw.prepare(`INSERT INTO model_calls (id, learner_id, session_id, topic_id, purpose, model, latency_ms, ok, created_at)
    VALUES (?, 'u1', ?, ?, ?, ?, 1, ?, ?)`).run(id, scope.sessionId ?? null, scope.topicId, purpose, model, ok ? 1 : 0, Date.now() + 60_000)
}

it('names the Muse models behind a perfect session, though it has no mistakes', async () => {
  getEnv().JOB_MODELS = { plan: { provider: 'meta', model: 'muse-wonder-1.0' }, items: { provider: 'meta', model: 'muse-wonder-1.0' } }
  stubModels()
  const { topicId } = await createTopic({ data: { topic: 'Algebra' } })
  const path = await getTopicPath({ data: { topicId } })
  raw.prepare('INSERT INTO learner_unit (learner_id, unit_id, unlocked_at) VALUES (?, ?, ?)').run('u1', path.units[0].id, 1)
  const { sessionId } = await startSession({ data: { topicId } })
  const { item } = await getSession({ data: { sessionId } })
  const reveal = await answerItem({ data: { sessionId, itemId: item!.id, answer: { text: '1' }, confidence: 'sure', responseMs: 100 } })
  expect(reveal).toMatchObject({ correct: true })
  logCall('grade', { sessionId, topicId }, 'grade', 'accounts/fireworks/models/muse-glimmer')
  logCall('failed', { sessionId, topicId }, 'grade', 'muse-image-1.0', false)
  logCall('voice', { sessionId, topicId }, 'voice', 'muse-voice-transcribe-1.0')
  logCall('foreign', { sessionId, topicId }, 'grade', 'gpt-4o')

  const summary = await endSession({ data: { sessionId } })
  expect(summary.mistakes).toEqual([])
  // Questions first, then the session's successful calls in order; failed, voice and non-Muse calls are left out.
  expect(summary.models).toEqual(['muse-wonder-1.0', 'muse-spark-1.3', 'accounts/fireworks/models/muse-glimmer'])
})

it('names the Muse models behind the curriculum, its questions and its diagrams on the path', async () => {
  getEnv().JOB_MODELS = { curriculum: { provider: 'meta', model: 'muse-wonder-1.0' } }
  stubModels()
  const { topicId } = await createTopic({ data: { topic: 'Algebra' } })
  const { units: [unit] } = await getTopicPath({ data: { topicId } })
  const conceptId = unit.concepts[0].id
  const item = raw.prepare(`INSERT INTO items (id, concept_id, topic_id, format, payload_json, generated_by, status, created_at)
    VALUES (?, ?, ?, 'cloze', '{}', ?, ?, 1)`)
  item.run('active-open', conceptId, topicId, 'muse-spark-open', 'active')
  item.run('active-other', conceptId, topicId, 'gpt-4o', 'active')
  item.run('retired', conceptId, topicId, 'muse-glimmer', 'retired')
  logCall('diagram', { topicId }, 'diagram', 'muse-image-1.0')
  logCall('diagram-failed', { topicId }, 'diagram', 'muse-glimmer', false)

  // No concept has a diagram yet, so no diagram model is named.
  expect((await getTopicPath({ data: { topicId } })).models).toEqual(['muse-wonder-1.0', 'muse-spark-open'])
  raw.prepare('UPDATE concepts SET image_key = ? WHERE id = ?').run('diagrams/c.png', conceptId)
  expect((await getTopicPath({ data: { topicId } })).models).toEqual(['muse-wonder-1.0', 'muse-spark-open', 'muse-image-1.0'])
})
