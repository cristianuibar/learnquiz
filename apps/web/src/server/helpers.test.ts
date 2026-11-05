import { readFileSync, readdirSync } from 'node:fs'
import { DatabaseSync } from 'node:sqlite'
import { drizzle } from 'drizzle-orm/sqlite-proxy'
import { afterAll, afterEach, beforeAll, beforeEach, expect, it, vi } from 'vitest'
import { getDb } from '@/db'
import { concepts, topics } from '@/db/schema'
import { ensureConceptItems } from './helpers'

// Real claim/generation/client SQL; only the Worker binding and provider HTTP are replaced.
const holder = vi.hoisted(() => ({ db: null as unknown }))
vi.mock('@/db', () => ({ getDb: () => holder.db }))
vi.mock('cloudflare:workers', () => ({ env: { LLM_PROFILE: 'meta', LLM_BASE_URL: 'https://llm.example', LLM_MODEL: 'muse-spark-1.3' } }))
let raw: DatabaseSync
const fetchModel = vi.fn<typeof fetch>()
const payload = { format: 'cloze', stem: 'x + 1 = 2; x = ____', options: [], accepted_answers: ['1'], model_answer: '1', explanation: 'Subtract one.', difficulty: 3, source_quote: null, grounded: false, bloom: 'apply' }
const reply = (init?: RequestInit) => Response.json({ choices: [{ message: { content: JSON.stringify(
  JSON.parse(init!.body as string).response_format.json_schema.name === 'item_batch'
    ? { items: [payload, payload, payload] }
    : { results: [0, 1, 2].map((index) => ({ index, keep: true, reasons: [] })) },
) } }] })
const state = () => raw.prepare("SELECT gen_status, gen_started_at FROM concepts WHERE id = 'c1'").get() as { gen_status: string; gen_started_at: number | null }
const ensure = async () => {
  const db = getDb()
  const [concept] = await db.select().from(concepts)
  const [topic] = await db.select().from(topics)
  return ensureConceptItems(db, 'u1', concept, topic, { targetDifficulty: 3 })
}
const abandoned = () => raw.prepare("UPDATE concepts SET gen_status = 'generating', gen_started_at = ?").run(Date.now() - 100_000)

beforeAll(() => {
  raw = new DatabaseSync(':memory:')
  for (const file of readdirSync('drizzle').filter((f) => f.endsWith('.sql')).sort()) raw.exec(readFileSync(`drizzle/${file}`, 'utf8').replaceAll('--> statement-breakpoint', ''))
  const run = (sql: string, params: unknown[], method: string) => {
    const stmt = raw.prepare(sql)
    stmt.setReturnArrays(true)
    const args = params as (string | number | null)[]
    if (method === 'run') { stmt.run(...args); return { rows: [] } }
    return { rows: (method === 'get' ? stmt.get(...args) : stmt.all(...args)) as never }
  }
  holder.db = drizzle(async (sql, params, method) => run(sql, params, method), async (batch) => batch.map((q) => run(q.sql, q.params, q.method)))
})
beforeEach(() => {
  raw.exec(`SAVEPOINT test;
    INSERT INTO user (id, name, email) VALUES ('u1', 'Learner', 'learner@example.test');
    INSERT INTO topics (id, learner_id, title, status, created_at) VALUES ('t1', 'u1', 'Algebra', 'ready', 1);
    INSERT INTO units (id, topic_id, "order", name) VALUES ('un1', 't1', 0, 'Basics');
    INSERT INTO concepts (id, topic_id, unit_id, "order", name, summary) VALUES ('c1', 't1', 'un1', 0, 'Variables', '');`)
  vi.useFakeTimers()
  vi.setSystemTime(new Date('2026-11-05T12:00:00Z'))
  fetchModel.mockReset().mockImplementation(async (_url, init) => reply(init))
  vi.stubGlobal('fetch', fetchModel)
})
afterEach(() => {
  vi.unstubAllGlobals()
  vi.useRealTimers()
  raw.exec('ROLLBACK TO test; RELEASE test')
})
afterAll(() => raw.close())

it('replaces a dead writer after 100 seconds and closes its orphaned reservations while producing items', async () => {
  abandoned()
  raw.prepare("INSERT INTO model_calls (id, learner_id, purpose, model, latency_ms, ok, error, created_at) VALUES ('orphan', 'u1', 'items', 'muse-spark-1.3', 0, 0, 'pending', ?)").run(Date.now() - 301_000)
  const items = await ensure()
  expect(items).toHaveLength(3)
  expect(state()).toEqual({ gen_status: 'ready', gen_started_at: null })
  expect(raw.prepare("SELECT ok, error FROM model_calls WHERE id = 'orphan'").get()).toEqual({ ok: 0, error: 'abandoned' })
  expect(raw.prepare('SELECT COUNT(*) AS n FROM model_calls').get()).toEqual({ n: 3 })
  expect(vi.getTimerCount()).toBe(0)
})

it('keeps a writer live through slow items and self-check calls, so a joiner never replaces it', async () => {
  fetchModel.mockImplementation(async (_url, init) => {
    const isItems = JSON.parse(init!.body as string).response_format.json_schema.name === 'item_batch'
    await new Promise((r) => setTimeout(r, isItems ? 110_000 : 100_000))
    return reply(init)
  })
  const writer = ensure()
  await vi.advanceTimersByTimeAsync(100_000)
  expect(state().gen_started_at).toBeGreaterThan(Date.now() - 30_000)
  const joiner = ensure()
  await vi.advanceTimersByTimeAsync(100_000)
  expect(state().gen_started_at).toBeGreaterThan(Date.now() - 30_000)
  expect(fetchModel).toHaveBeenCalledTimes(2)
  await vi.advanceTimersByTimeAsync(11_000)
  const [written, joined] = await Promise.all([writer, joiner])
  expect(joined.map((i) => i.id).sort()).toEqual(written.map((i) => i.id).sort())
  expect(joined).toHaveLength(3)
  expect(fetchModel).toHaveBeenCalledTimes(2)
  expect(state()).toEqual({ gen_status: 'ready', gen_started_at: null })
  expect(vi.getTimerCount()).toBe(0)
})

it('lets only one of two concurrent joiners take over an abandoned claim', async () => {
  abandoned()
  fetchModel.mockImplementation(async (_url, init) => {
    await new Promise((r) => setTimeout(r, 100))
    return reply(init)
  })
  const both = Promise.all([ensure(), ensure()])
  await vi.advanceTimersByTimeAsync(2000)
  const [first, second] = await both
  expect(first).toHaveLength(3)
  expect(second.map((i) => i.id).sort()).toEqual(first.map((i) => i.id).sort())
  expect(fetchModel).toHaveBeenCalledTimes(2)
  expect(raw.prepare('SELECT COUNT(*) AS n FROM items').get()).toEqual({ n: 3 })
})

it('takes over when the writer stops heartbeating during a join', async () => {
  raw.prepare("UPDATE concepts SET gen_status = 'generating', gen_started_at = ?").run(Date.now())
  const joined = ensure()
  await vi.advanceTimersByTimeAsync(92_000)
  expect(await joined).toHaveLength(3)
  expect(fetchModel).toHaveBeenCalledTimes(2)
  expect(state().gen_status).toBe('ready')
})

it('stops an old writer from storing items or releasing a replacement claim', async () => {
  fetchModel.mockImplementation(async (_url, init) => {
    raw.prepare("UPDATE concepts SET gen_started_at = ? WHERE id = 'c1'").run(Date.now() + 10_000)
    return reply(init)
  })
  await expect(ensure()).rejects.toThrow('claim was replaced')
  expect(state()).toEqual({ gen_status: 'generating', gen_started_at: Date.now() + 10_000 })
  expect(raw.prepare('SELECT COUNT(*) AS n FROM items').get()).toEqual({ n: 0 })
  expect(vi.getTimerCount()).toBe(0)
})
