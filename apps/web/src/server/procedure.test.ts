import { readFileSync, readdirSync } from 'node:fs'
import { DatabaseSync } from 'node:sqlite'
import { drizzle } from 'drizzle-orm/sqlite-proxy'
import { afterAll, afterEach, beforeAll, beforeEach, expect, it, vi } from 'vitest'
import { getUnitProcedure } from './procedure'

const boundary = vi.hoisted(() => ({
  db: null as unknown,
  learnerId: 'learner' as string | null,
  env: { LLM_PROFILE: 'meta', LLM_BASE_URL: 'https://model.test/v1', LLM_MODEL: 'muse-spark-1.3', JOB_MODELS: undefined },
}))
vi.mock('@tanstack/react-start', () => ({
  createServerFn: () => ({ validator: () => ({ handler: (fn: unknown) => fn }) }),
  createServerOnlyFn: (fn: unknown) => fn,
}))
vi.mock('@/db', () => ({ getDb: () => boundary.db }))
vi.mock('@/server/env', () => ({ getEnv: () => boundary.env }))
vi.mock('@/server/session', () => ({
  getLearnerId: async () => boundary.learnerId,
  requireLearnerId: async () => {
    if (!boundary.learnerId) throw Object.assign(new Error('Sign in first'), { status: 401 })
    return boundary.learnerId
  },
}))

const graph = {
  nodes: [
    { id: 'n1', kind: 'step', label: 'Check stock', critical: false },
    { id: 'n2', kind: 'decision', label: 'Is stock available?', critical: false },
    { id: 'n3', kind: 'step', label: 'Pack and dispatch', critical: true },
  ],
  edges: [{ from: 'n1', to: 'n2', label: null }, { from: 'n2', to: 'n3', label: 'yes' }],
}
const fetchModel = vi.fn()
let raw: DatabaseSync
beforeAll(() => {
  raw = new DatabaseSync(':memory:')
  for (const file of readdirSync('drizzle').filter((f) => f.endsWith('.sql')).sort()) {
    raw.exec(readFileSync(`drizzle/${file}`, 'utf8').replaceAll('--> statement-breakpoint', ''))
  }
  const query = (sql: string, params: unknown[], method: string) => {
    const stmt = raw.prepare(sql)
    stmt.setReturnArrays(true)
    const args = params as (string | number | null)[]
    if (method === 'run') { stmt.run(...args); return { rows: [] } }
    return { rows: (method === 'get' ? stmt.get(...args) : stmt.all(...args)) as unknown[] }
  }
  boundary.db = drizzle(async (sql, params, method) => query(sql, params, method), async (batch) => batch.map((q) => query(q.sql, q.params, q.method)))
})
afterAll(() => raw.close())
const run = (sql: string, ...args: (string | number | null)[]) => raw.prepare(sql).run(...args)
beforeEach(() => {
  raw.exec('BEGIN')
  boundary.learnerId = 'learner'
  fetchModel.mockReset().mockImplementation(async () => Response.json({ choices: [{ message: { content: JSON.stringify(graph) }, finish_reason: 'stop' }] }))
  vi.stubGlobal('fetch', fetchModel)
  run('INSERT INTO topics (id, learner_id, title, status, created_at) VALUES (?, ?, ?, ?, ?)', 'topic', 'learner', 'Northwind procedures', 'ready', 1)
  run('INSERT INTO units (id, topic_id, "order", name) VALUES (?, ?, ?, ?)', 'unit', 'topic', 0, 'Order handling')
  run('INSERT INTO sources (id, topic_id, kind, title, body_text, version, created_at) VALUES (?, ?, ?, ?, ?, ?, ?)', 'src', 'topic', 'text', 'Dispatch SOP', 'Check stock. If available, pack and dispatch.', 3, 1)
  run('INSERT INTO concepts (id, topic_id, unit_id, "order", name, summary, source_id) VALUES (?, ?, ?, ?, ?, ?, ?)', 'c1', 'topic', 'unit', 0, 'Dispatch', 'Pack it.', 'src')
})
afterEach(() => {
  raw.exec('ROLLBACK')
  vi.unstubAllGlobals()
})

it('generates the flowchart once with one model call and then serves the stored graph', async () => {
  const expected = { status: 'ready', graph, source: { title: 'Dispatch SOP', version: 3 } }
  expect(await getUnitProcedure({ data: { unitId: 'unit' } })).toEqual(expected)
  expect(await getUnitProcedure({ data: { unitId: 'unit' } })).toEqual(expected)
  expect(fetchModel).toHaveBeenCalledTimes(1)
  expect(raw.prepare('SELECT purpose, ok FROM model_calls').all()).toEqual([{ purpose: 'procedure', ok: 1 }])
  expect(raw.prepare('SELECT procedure_started_at AS s FROM units').get()).toEqual({ s: null })
})

it('regenerates when the source version changes', async () => {
  await getUnitProcedure({ data: { unitId: 'unit' } })
  run('UPDATE sources SET version = 4')
  expect(await getUnitProcedure({ data: { unitId: 'unit' } })).toMatchObject({ status: 'ready', source: { version: 4 } })
  expect(fetchModel).toHaveBeenCalledTimes(2)
})

it('returns null without a model call or claim when no concept has a usable source', async () => {
  run('UPDATE concepts SET source_id = NULL')
  expect(await getUnitProcedure({ data: { unitId: 'unit' } })).toBeNull()
  run('UPDATE concepts SET source_id = ?', 'src')
  run('UPDATE sources SET body_text = ?', '   ')
  expect(await getUnitProcedure({ data: { unitId: 'unit' } })).toBeNull()
  expect(fetchModel).not.toHaveBeenCalled()
  expect(raw.prepare('SELECT procedure_started_at AS s FROM units').get()).toEqual({ s: null })
})

it('refuses a learner without access', async () => {
  boundary.learnerId = 'other'
  await expect(getUnitProcedure({ data: { unitId: 'unit' } })).rejects.toMatchObject({ status: 404 })
  expect(fetchModel).not.toHaveBeenCalled()
})

it('releases the claim when the model call fails', async () => {
  fetchModel.mockResolvedValueOnce(new Response('unavailable', { status: 503 }))
  await expect(getUnitProcedure({ data: { unitId: 'unit' } })).rejects.toThrow()
  expect(raw.prepare('SELECT procedure_started_at AS s FROM units').get()).toEqual({ s: null })
  expect(await getUnitProcedure({ data: { unitId: 'unit' } })).toMatchObject({ status: 'ready' })
})

it('returns 429 for a company topic over the company cap, with no model call', async () => {
  run('INSERT INTO organization (id, name, slug, created_at) VALUES (?, ?, ?, ?)', 'org', 'Northwind', 'northwind', 1)
  run('UPDATE topics SET org_id = ?', 'org')
  const log = raw.prepare('INSERT INTO model_calls (id, topic_id, purpose, model, latency_ms, ok, created_at) VALUES (?, ?, ?, ?, ?, ?, ?)')
  for (let i = 0; i < 400; i++) log.run(`call-${i}`, 'topic', 'items', 'muse-spark-1.3', 1, 1, Date.now())
  await expect(getUnitProcedure({ data: { unitId: 'unit' } })).rejects.toMatchObject({ status: 429 })
  expect(fetchModel).not.toHaveBeenCalled()
})
