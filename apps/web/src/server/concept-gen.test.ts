import { readFileSync, readdirSync } from 'node:fs'
import { DatabaseSync } from 'node:sqlite'
import { drizzle } from 'drizzle-orm/sqlite-proxy'
import { afterAll, afterEach, beforeAll, beforeEach, expect, it, vi } from 'vitest'
import { COMPANY_DAILY_MODEL_CALL_CAP } from '@/lib/limits'
import { COMPANY_CAP_MESSAGE } from '@/server/model-cap'
import { drainConceptQueue } from './concept-gen'
import { retryConceptGeneration } from './curriculum'

// Real handlers, authorization, generateConceptItems, model client and database; fakes are the
// transport, session provider, Worker bindings, background scheduler and model HTTP only.
const holder = vi.hoisted(() => ({ db: null as unknown, userId: 'owner' as string | null, background: [] as Promise<unknown>[] }))
vi.mock('@tanstack/react-start', () => ({
  createServerFn: () => ({
    validator: (schema: { parse: (data: unknown) => unknown }) => ({
      handler: (fn: (args: { data: unknown }) => unknown) => (args: { data: unknown }) => fn({ data: schema.parse(args.data) }),
    }),
  }),
}))
vi.mock('@tanstack/react-start/server', () => ({ getRequestHeaders: () => new Headers() }))
vi.mock('@/db', () => ({ getDb: () => holder.db }))
vi.mock('@/server/auth', () => ({
  getAuth: () => ({ api: { getSession: async () => holder.userId ? { user: { id: holder.userId } } : null } }),
}))
vi.mock('@/server/env', () => ({
  getEnv: () => ({ LLM_PROFILE: 'meta', LLM_BASE_URL: 'https://llm.example', LLM_MODEL: 'muse-spark-1.3' }),
  runInBackground: (task: Promise<unknown>) => { holder.background.push(task) },
}))
vi.mock('cloudflare:workers', () => ({ env: {}, waitUntil: () => {} }))

const CONCEPTS = 40
const conceptIds = Array.from({ length: CONCEPTS }, (_, i) => `c${String(i).padStart(2, '0')}`)
const modelReply = (value: unknown) => Response.json({ choices: [{ message: { content: JSON.stringify(value) }, finish_reason: 'stop' }] })
let stemCounter = 0
const item = () => ({
  format: 'short', stem: `Question ${++stemCounter}?`, options: [], accepted_answers: [], model_answer: 'Scan the bin.',
  explanation: 'The SOP requires it.', difficulty: 3, source_quote: 'Scan the bin.', grounded: true, bloom: 'apply',
})
const fetchModel = vi.fn<typeof fetch>()
const answerModel = async (_url: unknown, init?: RequestInit) => {
  const schema = JSON.parse(init!.body as string).response_format.json_schema.name
  if (schema === 'item_batch') return modelReply({ items: Array.from({ length: 6 }, item) })
  return modelReply({ results: Array.from({ length: 6 }, (_, index) => ({ index, keep: true, reasons: [] })) })
}
let raw: DatabaseSync
const one = (sql: string, ...args: (string | number)[]) => raw.prepare(sql).get(...args) as Record<string, unknown>
const states = () => raw.prepare('SELECT id, gen_status, gen_error FROM concepts WHERE topic_id = ? ORDER BY id').all('co-topic') as { id: string; gen_status: string; gen_error: string | null }[]
const drainAll = async () => { while (await drainConceptQueue()) { /* until idle */ } }

beforeAll(() => {
  raw = new DatabaseSync(':memory:')
  for (const file of readdirSync('drizzle').filter((f) => f.endsWith('.sql')).sort()) {
    raw.exec(readFileSync(`drizzle/${file}`, 'utf8').replaceAll('--> statement-breakpoint', ''))
  }
  const run = (sql: string, params: unknown[], method: string) => {
    if (params.length > 100) throw new Error(`D1_ERROR: too many SQL variables (${params.length} > 100)`)
    const stmt = raw.prepare(sql)
    stmt.setReturnArrays(true)
    const args = params as (string | number | null)[]
    if (method === 'run') { stmt.run(...args); return { rows: [] } }
    return { rows: (method === 'get' ? stmt.get(...args) : stmt.all(...args)) as never }
  }
  holder.db = drizzle(async (sql, params, method) => run(sql, params, method), async (queries) => {
    raw.exec('SAVEPOINT batch')
    try {
      const result = queries.map((q) => run(q.sql, q.params, q.method))
      raw.exec('RELEASE batch')
      return result
    } catch (e) {
      raw.exec('ROLLBACK TO batch; RELEASE batch')
      throw e
    }
  })
  for (const id of ['owner', 'employee', 'other-owner']) raw.prepare('INSERT INTO user (id, name, email) VALUES (?, ?, ?)').run(id, id, `${id}@learnquiz.test`)
  for (const id of ['northwind', 'other-org']) raw.prepare('INSERT INTO organization (id, name, slug, created_at) VALUES (?, ?, ?, 1)').run(id, id, id)
  for (const [userId, orgId, role] of [['owner', 'northwind', 'owner'], ['employee', 'northwind', 'member'], ['other-owner', 'other-org', 'owner']]) {
    raw.prepare('INSERT INTO member (id, organization_id, user_id, role, created_at) VALUES (?, ?, ?, ?, 1)').run(userId, orgId, userId, role)
  }
  for (const [topic, org] of [['co-topic', 'northwind'], ['other-topic', 'other-org']]) {
    raw.prepare("INSERT INTO topics (id, org_id, title, status, created_at) VALUES (?, ?, 'Warehouse picker', 'ready', 1)").run(topic, org)
    raw.prepare('INSERT INTO sources (id, topic_id, kind, title, body_text, version, created_at) VALUES (?, ?, \'text\', \'SOP\', \'Scan the bin.\', 2, 1)').run(`${topic}-src`, topic)
    raw.prepare('INSERT INTO units (id, topic_id, "order", name, summary) VALUES (?, ?, 0, \'Picking\', \'Picking\')').run(`${topic}-unit`, topic)
  }
  const insert = raw.prepare(`INSERT INTO concepts (id, topic_id, unit_id, "order", name, summary, source_id, source_quote, gen_status)
    VALUES (?, ?, ?, ?, ?, 'Summary', ?, 'Scan the bin.', 'pending')`)
  conceptIds.forEach((id, i) => insert.run(id, 'co-topic', 'co-topic-unit', i, `Concept ${i}`, 'co-topic-src'))
  insert.run('foreign', 'other-topic', 'other-topic-unit', 0, 'Foreign', 'other-topic-src')
})
afterAll(() => raw.close())
beforeEach(() => {
  raw.exec('SAVEPOINT test')
  holder.userId = 'owner'
  holder.background = []
  vi.useFakeTimers({ toFake: ['Date'] })
  vi.setSystemTime(new Date('2026-11-02T12:00:00Z'))
  fetchModel.mockReset().mockImplementation(answerModel)
  vi.stubGlobal('fetch', fetchModel)
})
afterEach(() => {
  vi.unstubAllGlobals()
  vi.useRealTimers()
  raw.exec('ROLLBACK TO test; RELEASE test')
})

it('drains a pending company topic until every concept holds exactly six shared, source-stamped questions', async () => {
  expect(states().filter((c) => c.gen_status === 'pending')).toHaveLength(CONCEPTS)
  raw.exec("DELETE FROM concepts WHERE id = 'foreign'")
  const batches: number[] = []
  for (let n = await drainConceptQueue(); n; n = await drainConceptQueue()) batches.push(n)
  expect(batches).toEqual([8, 8, 8, 8, 8])
  expect(states().map((c) => [c.gen_status, c.gen_error])).toEqual(conceptIds.map(() => ['ready', null]))
  const perConcept = raw.prepare("SELECT concept_id, COUNT(*) AS n, MIN(source_id) AS s, MIN(source_version) AS lo, MAX(source_version) AS hi FROM items WHERE status = 'active' GROUP BY concept_id ORDER BY concept_id").all()
  expect(perConcept).toEqual(conceptIds.map((concept_id) => ({ concept_id, n: 6, s: 'co-topic-src', lo: 2, hi: 2 })))
  expect(one('SELECT COUNT(*) AS n FROM model_calls WHERE learner_id IS NOT NULL')).toEqual({ n: 0 })
  expect(one('SELECT COUNT(*) AS n FROM model_calls')).toEqual({ n: CONCEPTS * 2 })
})

it('stores questions as retired when their document is replaced while they generate', async () => {
  raw.exec("DELETE FROM concepts WHERE id <> 'c00'")
  fetchModel.mockImplementation(async (url, init) => {
    raw.exec("UPDATE sources SET retired_at = 1 WHERE id = 'co-topic-src'")
    return answerModel(url, init)
  })
  await drainConceptQueue()
  expect(raw.prepare("SELECT status, COUNT(*) AS n FROM items WHERE source_id = 'co-topic-src' GROUP BY status").all()).toEqual([{ status: 'retired', n: 6 }])
})

it('fails a concept the model cannot answer, resets it on admin retry and refuses other callers', async () => {
  fetchModel.mockImplementation(async () => new Response('Unavailable', { status: 502 }))
  raw.exec("DELETE FROM concepts WHERE id <> 'c00'")
  await drainAll()
  expect(states()).toEqual([{ id: 'c00', gen_status: 'failed', gen_error: 'Could not generate items for this concept' }])

  const retry = (slug: string, conceptId: string) => retryConceptGeneration({ data: { slug, conceptId } })
  for (const [userId, slug, conceptId, status] of [
    ['other-owner', 'northwind', 'c00', 403], ['employee', 'northwind', 'c00', 403], [null, 'northwind', 'c00', 401],
  ] as const) {
    holder.userId = userId
    await expect(retry(slug, conceptId)).rejects.toMatchObject({ status })
  }
  holder.userId = 'owner'
  await expect(retry('northwind', 'foreign')).rejects.toMatchObject({ status: 404 })
  expect(states()[0].gen_status).toBe('failed')

  fetchModel.mockImplementation(answerModel)
  await expect(retry('northwind', 'c00')).resolves.toEqual({ ok: true })
  // The retry schedules the drain in the background; it ends with the concept ready.
  await expect(Promise.all(holder.background)).resolves.toEqual([1])
  await expect(retry('northwind', 'c00')).rejects.toMatchObject({ status: 404 })
  expect(states()).toEqual([{ id: 'c00', gen_status: 'ready', gen_error: null }])
  expect(one("SELECT COUNT(*) AS n FROM items WHERE concept_id = 'c00'")).toEqual({ n: 6 })
})

it('defers every concept to the next UTC day once the company has spent its daily cap', async () => {
  raw.exec("DELETE FROM concepts WHERE id NOT IN ('c00', 'c01', 'c02')")
  const log = raw.prepare("INSERT INTO model_calls (id, learner_id, topic_id, purpose, model, latency_ms, ok, created_at) VALUES (?, NULL, 'co-topic', 'items', 'm', 0, 1, ?)")
  for (let i = 0; i < COMPANY_DAILY_MODEL_CALL_CAP; i++) log.run(`call-${i}`, Date.now())
  expect(await drainConceptQueue()).toBe(3)
  expect(fetchModel).not.toHaveBeenCalled()
  expect(states().map((c) => [c.gen_status, c.gen_error])).toEqual([1, 2, 3].map(() => ['pending', COMPANY_CAP_MESSAGE]))
  expect(await drainConceptQueue()).toBe(0)
  expect(fetchModel).not.toHaveBeenCalled()

  vi.setSystemTime(new Date('2026-11-03T00:00:01Z'))
  await drainAll()
  expect(states().map((c) => c.gen_status)).toEqual(['ready', 'ready', 'ready'])
})

it('stores a nine-question top-up within the D1 parameter limit', async () => {
  raw.exec("DELETE FROM concepts WHERE id <> 'c00'")
  // The first self-check keeps three items, so a second round adds six more in one write.
  let checks = 0
  fetchModel.mockImplementation(async (url, init) => {
    const schema = JSON.parse(init!.body as string).response_format.json_schema.name
    if (schema !== 'self_check' || checks++) return answerModel(url, init)
    return modelReply({ results: Array.from({ length: 6 }, (_, index) => ({ index, keep: index < 3, reasons: [] })) })
  })
  await drainAll()
  expect(states()).toEqual([{ id: 'c00', gen_status: 'ready', gen_error: null }])
  expect(one("SELECT COUNT(*) AS n FROM items WHERE concept_id = 'c00' AND status = 'active'")).toEqual({ n: 9 })
})

it('retries a provider rate limit on the next drain instead of parking it as the company cap', async () => {
  raw.exec("DELETE FROM concepts WHERE id <> 'c00'")
  fetchModel.mockImplementation(async () => new Response('Slow down', { status: 429 }))
  expect(await drainConceptQueue()).toBe(1)
  expect(states()).toEqual([{ id: 'c00', gen_status: 'pending', gen_error: 'LLM request failed (429)' }])

  fetchModel.mockImplementation(answerModel)
  expect(await drainConceptQueue()).toBe(1)
  expect(states()).toEqual([{ id: 'c00', gen_status: 'ready', gen_error: null }])
})
