import { readFileSync, readdirSync } from 'node:fs'
import { DatabaseSync } from 'node:sqlite'
import { drizzle } from 'drizzle-orm/sqlite-proxy'
import { afterAll, afterEach, beforeAll, beforeEach, expect, it, vi } from 'vitest'
import { createTopic, getTopicPath } from '@/server/curriculum'
import { answerItem } from '@/server/play'
import { generateConceptDiagram, serveConceptDiagram } from './diagrams'

const boundary = vi.hoisted(() => ({
  db: null as unknown,
  learnerId: 'learner' as string | null,
  objects: new Map<string, Uint8Array>(),
  env: {
    LLM_PROFILE: 'meta', LLM_BASE_URL: 'https://model.test/v1', LLM_MODEL: 'muse-spark-1.3',
    JOB_MODELS: undefined as string | undefined,
    MEDIA: { head: vi.fn(), get: vi.fn(), put: vi.fn() },
  },
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

const png = Uint8Array.from(atob('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+a5N8AAAAASUVORK5CYII='), (c) => c.charCodeAt(0))
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
beforeEach(() => {
  raw.exec('BEGIN')
  vi.useFakeTimers({ toFake: ['Date'] })
  vi.setSystemTime(new Date('2026-11-02T12:00:00Z'))
  boundary.learnerId = 'learner'
  boundary.env.LLM_PROFILE = 'meta'
  boundary.env.JOB_MODELS = undefined
  boundary.objects.clear()
  boundary.env.MEDIA.head.mockImplementation(async (key: string) => boundary.objects.has(key) ? {} : null)
  boundary.env.MEDIA.get.mockImplementation(async (key: string) => boundary.objects.has(key) ? { body: boundary.objects.get(key) } : null)
  boundary.env.MEDIA.put.mockImplementation(async (key: string, bytes: Uint8Array) => { boundary.objects.set(key, bytes); return {} })
  boundary.env.MEDIA.put.mockClear()
  fetchModel.mockReset()
  vi.stubGlobal('fetch', fetchModel)
  raw.prepare('INSERT INTO topics (id, learner_id, title, status, created_at) VALUES (?, ?, ?, ?, ?)').run('topic', 'learner', 'Northwind procedures', 'ready', 1)
  raw.prepare('INSERT INTO units (id, topic_id, "order", name) VALUES (?, ?, ?, ?)').run('unit', 'topic', 0, 'Order handling')
  raw.prepare('INSERT INTO concepts (id, topic_id, unit_id, "order", name, summary, source_quote, visual) VALUES (?, ?, ?, ?, ?, ?, ?, ?)')
    .run('procedure', 'topic', 'unit', 0, 'Dispatch an order', 'Check stock, pack the order, then dispatch it.', 'Check stock before packing.', 1)
})
afterEach(() => {
  raw.exec('ROLLBACK')
  vi.unstubAllGlobals()
  vi.useRealTimers()
})
const row = (sql: string) => raw.prepare(sql).get() as Record<string, unknown>

const storeDiagram = (conceptId: string) => {
  boundary.objects.set(`concepts/${conceptId}/diagram.png`, png)
  raw.prepare('UPDATE concepts SET image_key = ?, image_alt = ? WHERE id = ?').run(`concepts/${conceptId}/diagram.png`, 'Dispatch an order', conceptId)
}

// The old Muse Image mapping no longer turns generation on.
it('never generates a diagram for the topic owner and reports it unavailable', async () => {
  boundary.env.JOB_MODELS = JSON.stringify({ image: { provider: 'meta', model: 'muse-image-1.0' } })
  expect(await generateConceptDiagram({ data: { conceptId: 'procedure' } })).toEqual({ status: 'unavailable' })
  raw.exec('UPDATE concepts SET visual = 0')
  expect(await generateConceptDiagram({ data: { conceptId: 'procedure' } })).toEqual({ status: 'disabled' })
  expect(fetchModel).not.toHaveBeenCalled()
  expect(boundary.env.MEDIA.put).not.toHaveBeenCalled()
  expect(row('SELECT COUNT(*) AS n FROM model_calls').n).toBe(0)
  expect(row('SELECT image_generation_started_at FROM concepts')).toEqual({ image_generation_started_at: null })
})

it('serves a stored diagram to its owner and keeps it on Path and reveal', async () => {
  storeDiagram('procedure')
  expect(await generateConceptDiagram({ data: { conceptId: 'procedure' } })).toEqual({ status: 'ready', image: { src: '/media/concepts/procedure', alt: 'Dispatch an order' } })
  const response = await serveConceptDiagram('procedure')
  expect(response.status).toBe(200)
  expect(response.headers.get('content-type')).toBe('image/png')
  expect(response.headers.get('cache-control')).toContain('private')
  expect(new Uint8Array(await response.arrayBuffer())).toEqual(png)
  const path = await getTopicPath({ data: { topicId: 'topic' } })
  expect(path.units[0].concepts[0]).toMatchObject({ visual: true })
  raw.prepare('INSERT INTO items (id, concept_id, topic_id, format, payload_json, created_at) VALUES (?, ?, ?, ?, ?, ?)').run('item', 'procedure', 'topic', 'cloze', JSON.stringify({ format: 'cloze', stem: 'First check ____.', options: [], accepted_answers: ['stock'], explanation: 'Check before packing.', difficulty: 1, source_quote: null }), 1)
  raw.prepare('INSERT INTO sessions (id, learner_id, topic_id, kind, item_ids_json, plan_json, started_at) VALUES (?, ?, ?, ?, ?, ?, ?)').run('session', 'learner', 'topic', 'session', '["item"]', JSON.stringify({ position: 0, answered: false, reinserted: [], reasons: { closers: 0 } }), 1)
  const reveal = await answerItem({ data: { sessionId: 'session', itemId: 'item', answer: { text: 'stock' }, confidence: 'sure', responseMs: 100 } })
  expect(reveal).toMatchObject({ correct: true, diagramConceptId: 'procedure' })
  expect(fetchModel).not.toHaveBeenCalled()
})

it.each([null, 'other-learner'])('refuses a stored diagram and its media to %s', async (learnerId) => {
  storeDiagram('procedure')
  boundary.learnerId = learnerId
  const status = learnerId ? 404 : 401
  await expect(generateConceptDiagram({ data: { conceptId: 'procedure' } })).rejects.toMatchObject({ status })
  expect((await serveConceptDiagram('procedure')).status).toBe(status)
})

it('never generates a shared role diagram for an employee, serves a stored one, and refuses an unassigned user', async () => {
  const run = (sql: string, ...args: (string | number | null)[]) => raw.prepare(sql).run(...args)
  for (const id of ['employee', 'stranger']) run('INSERT INTO user (id, name, email) VALUES (?, ?, ?)', id, id, `${id}@example.test`)
  run('INSERT INTO organization (id, name, slug, created_at) VALUES (?, ?, ?, ?)', 'org', 'Northwind', 'northwind', 1)
  run('INSERT INTO member (id, organization_id, user_id, role, created_at) VALUES (?, ?, ?, ?, ?)', 'm1', 'org', 'employee', 'member', 1)
  run('INSERT INTO job_roles (id, org_id, name, created_at) VALUES (?, ?, ?, ?)', 'role', 'org', 'Dispatcher', 1)
  run('INSERT INTO member_role_assignments (user_id, org_id, job_role_id, assigned_at) VALUES (?, ?, ?, ?)', 'employee', 'org', 'role', 1)
  run('INSERT INTO topics (id, learner_id, org_id, job_role_id, title, status, created_at) VALUES (?, NULL, ?, ?, ?, ?, ?)', 'role-topic', 'org', 'role', 'Dispatcher role', 'ready', 1)
  run('INSERT INTO units (id, topic_id, "order", name) VALUES (?, ?, ?, ?)', 'role-unit', 'role-topic', 0, 'Orders')
  run('INSERT INTO concepts (id, topic_id, unit_id, "order", name, summary, visual) VALUES (?, ?, ?, ?, ?, ?, ?)', 'role-concept', 'role-topic', 'role-unit', 0, 'Dispatch an order', 'Check stock, pack, dispatch.', 1)

  boundary.learnerId = 'employee'
  expect(await generateConceptDiagram({ data: { conceptId: 'role-concept' } })).toEqual({ status: 'unavailable' })
  expect(raw.prepare("SELECT count(*) AS n FROM model_calls").get()).toEqual({ n: 0 })
  expect(fetchModel).not.toHaveBeenCalled()
  expect(boundary.env.MEDIA.put).not.toHaveBeenCalled()

  // A diagram the company side already stored is served to the assigned employee.
  await boundary.env.MEDIA.put('concepts/role-concept/diagram.png', new Uint8Array([1, 2, 3]))
  run('UPDATE concepts SET image_key = ?, image_alt = ? WHERE id = ?', 'concepts/role-concept/diagram.png', 'Dispatch an order', 'role-concept')
  expect(await generateConceptDiagram({ data: { conceptId: 'role-concept' } })).toMatchObject({ status: 'ready' })
  expect((await serveConceptDiagram('role-concept')).status).toBe(200)
  expect(fetchModel).not.toHaveBeenCalled()

  boundary.learnerId = 'stranger'
  await expect(generateConceptDiagram({ data: { conceptId: 'role-concept' } })).rejects.toMatchObject({ status: 404, message: 'Concept not found' })
  expect((await serveConceptDiagram('role-concept')).status).toBe(404)
  expect(fetchModel).not.toHaveBeenCalled()
})

it('carries the curriculum visual flag into stored concepts', async () => {
  const concept = { name: 'Dispatch', summary: 'Pack and dispatch.', visual: true, critical: false, prerequisites: [], source_quote: null, misconceptions: [] }
  const skeleton = { units: Array.from({ length: 4 }, (_, u) => ({ name: `Unit ${u}`, summary: '', concepts: Array.from({ length: 4 }, (_, c) => ({ ...concept, name: `Dispatch ${u}-${c}`, visual: c === 0 })) })) }
  fetchModel.mockResolvedValueOnce(Response.json({ choices: [{ message: { content: JSON.stringify(skeleton) }, finish_reason: 'stop' }] }))
  const { topicId } = await createTopic({ data: { topic: 'Warehouse procedures' } })
  const rows = raw.prepare('SELECT visual FROM concepts WHERE topic_id = ? ORDER BY "order"').all(topicId)
  expect(rows.map((r) => r.visual)).toEqual([1, 1, 1, 1, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0])
})
