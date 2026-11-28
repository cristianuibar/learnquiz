import { readFileSync, readdirSync } from 'node:fs'
import { DatabaseSync } from 'node:sqlite'
import { drizzle } from 'drizzle-orm/sqlite-proxy'
import { afterAll, afterEach, beforeAll, beforeEach, expect, it, vi } from 'vitest'
import { getDb } from '@/db'
import { concepts, topics } from '@/db/schema'
import { requestedSchema } from '@/lib/llm/test-request'
import { ensureConceptItems, releaseStaleClaims } from './helpers'

const holder = vi.hoisted(() => ({ db: null as unknown }))
vi.mock('@/db', () => ({ getDb: () => holder.db }))
vi.mock('@/server/env', () => ({ getEnv: () => ({ LLM_PROFILE: 'baseten', LLM_BASE_URL: 'https://llm.example', LLM_MODEL: 'muse-spark-1.3', COMPANY_GENERATION_ENABLED: 'true' }) }))
vi.mock('cloudflare:workers', () => ({ env: {}, waitUntil: () => {} }))

let raw: DatabaseSync
let beforeSql: { prefix: string; fn: () => void } | null = null
const fetchModel = vi.fn<typeof fetch>()
const payload = { format: 'cloze', stem: 'x + 1 = 2; x = ____', options: [], accepted_answers: ['1'], model_answer: '1', explanation: 'Subtract one.', difficulty: 3, source_quote: null, grounded: false, bloom: 'apply' }
const reply = (init?: RequestInit) => Response.json({ choices: [{ finish_reason: 'stop', message: { content: JSON.stringify(
  requestedSchema(init!.body).name === 'item_batch'
    ? { items: [payload, payload, payload] }
    : { results: [0, 1, 2].map((index) => ({ index, keep: true, reasons: [] })) },
) } }] })
const claim = (id: string) => raw.prepare('SELECT gen_status, gen_started_at, gen_token FROM concepts WHERE id = ?').get(id)
const itemCount = () => raw.prepare('SELECT COUNT(*) AS n FROM items').get()
const ensure = async () => {
  const db = getDb()
  const [concept] = await db.select().from(concepts)
  const [topic] = await db.select().from(topics)
  return ensureConceptItems(db, 'u1', concept, topic, { targetDifficulty: 3 })
}

beforeAll(() => {
  raw = new DatabaseSync(':memory:')
  for (const file of readdirSync('drizzle').filter((f) => f.endsWith('.sql')).sort()) raw.exec(readFileSync(`drizzle/${file}`, 'utf8').replaceAll('--> statement-breakpoint', ''))
  const run = (sql: string, params: unknown[], method: string) => {
    if (beforeSql && sql.startsWith(beforeSql.prefix)) { const { fn } = beforeSql; beforeSql = null; fn() }
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
})
beforeEach(() => {
  raw.exec(`SAVEPOINT test;
    INSERT INTO user (id, name, email) VALUES ('u1', 'Learner', 'learner@example.test');
    INSERT INTO topics (id, learner_id, title, status, created_at) VALUES ('t1', 'u1', 'Algebra', 'ready', 1);
    INSERT INTO units (id, topic_id, "order", name) VALUES ('un1', 't1', 0, 'Basics');
    INSERT INTO concepts (id, topic_id, unit_id, "order", name, summary) VALUES ('c1', 't1', 'un1', 0, 'Variables', '');`)
  beforeSql = null
  vi.useFakeTimers({ toFake: ['Date'] })
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

it('generates, stores and releases its own claim', async () => {
  expect(await ensure()).toHaveLength(3)
  expect(itemCount()).toEqual({ n: 3 })
  expect(claim('c1')).toEqual({ gen_status: 'ready', gen_started_at: null, gen_token: null })
})

it('stores nothing and keeps the replacement claim when a newer claim lands just before the insert', async () => {
  beforeSql = { prefix: 'insert into "items"', fn: () => raw.prepare("UPDATE concepts SET gen_started_at = ?, gen_token = 'replacement' WHERE id = 'c1'").run(Date.now()) }
  expect(await ensure()).toEqual([])
  expect(beforeSql).toBeNull()
  expect(itemCount()).toEqual({ n: 0 })
  expect(claim('c1')).toEqual({ gen_status: 'generating', gen_started_at: Date.now(), gen_token: 'replacement' })
})

it('makes no model call when another writer wins the claim and finishes before the status read', async () => {
  beforeSql = { prefix: 'update "concepts" set "gen_status"', fn: () => {
    raw.prepare("UPDATE concepts SET gen_status = 'generating', gen_started_at = ?, gen_token = 'holder' WHERE id = 'c1'").run(Date.now())
    beforeSql = { prefix: 'select "gen_status"', fn: () => raw.exec("UPDATE concepts SET gen_status = 'ready', gen_started_at = NULL, gen_token = NULL WHERE id = 'c1'") }
  } }
  expect(await ensure()).toEqual([])
  expect(beforeSql).toBeNull()
  expect(fetchModel).not.toHaveBeenCalled()
  expect(itemCount()).toEqual({ n: 0 })
})

it('generates for a queued company concept under its own claim and hands it back to the drain', async () => {
  raw.exec(`INSERT INTO organization (id, name, slug, created_at) VALUES ('org1', 'Org', 'org', 1);
    UPDATE topics SET learner_id = NULL, org_id = 'org1' WHERE id = 't1';
    UPDATE concepts SET gen_status = 'pending' WHERE id = 'c1';`)
  const during: unknown[] = []
  fetchModel.mockImplementation(async (_url, init) => { during.push((claim('c1') as { gen_status: string }).gen_status); return reply(init) })
  expect(await ensure()).toHaveLength(3)
  expect(during).toEqual(['generating', 'generating'])
  expect(claim('c1')).toEqual({ gen_status: 'pending', gen_started_at: null, gen_token: null })
})

it('hands a stale company claim back to the drain when the learner takeover hits a rate limit', async () => {
  raw.exec(`INSERT INTO organization (id, name, slug, created_at) VALUES ('org1', 'Org', 'org', 1);
    UPDATE topics SET learner_id = NULL, org_id = 'org1' WHERE id = 't1';`)
  raw.prepare("UPDATE concepts SET gen_status = 'generating', gen_started_at = ?, gen_token = 'dead' WHERE id = 'c1'").run(Date.now() - 11 * 60 * 1000)
  fetchModel.mockImplementation(async () => new Response('Too many requests', { status: 429 }))
  await expect(ensure()).rejects.toMatchObject({ status: 429 })
  expect(claim('c1')).toEqual({ gen_status: 'pending', gen_started_at: null, gen_token: null })
})

it('releases a stale personal claim and leaves company concepts and fresh claims alone', async () => {
  raw.exec(`INSERT INTO organization (id, name, slug, created_at) VALUES ('org1', 'Org', 'org', 1);
    INSERT INTO topics (id, org_id, title, status, created_at) VALUES ('t2', 'org1', 'Picking', 'ready', 1);
    INSERT INTO units (id, topic_id, "order", name) VALUES ('un2', 't2', 0, 'Basics');
    INSERT INTO concepts (id, topic_id, unit_id, "order", name, summary) VALUES ('c2', 't2', 'un2', 0, 'Scanning', '');
    INSERT INTO concepts (id, topic_id, unit_id, "order", name, summary) VALUES ('c3', 't1', 'un1', 1, 'Equations', '');`)
  const stale = Date.now() - 11 * 60 * 1000
  const set = raw.prepare("UPDATE concepts SET gen_status = 'generating', gen_started_at = ?, gen_token = ? WHERE id = ?")
  set.run(stale, 'dead', 'c1')
  set.run(stale, 'company', 'c2')
  set.run(Date.now() - 60_000, 'live', 'c3')
  await releaseStaleClaims(getDb())
  expect(claim('c1')).toEqual({ gen_status: 'ready', gen_started_at: null, gen_token: null })
  expect(claim('c2')).toEqual({ gen_status: 'generating', gen_started_at: stale, gen_token: 'company' })
  expect(claim('c3')).toEqual({ gen_status: 'generating', gen_started_at: Date.now() - 60_000, gen_token: 'live' })
})
