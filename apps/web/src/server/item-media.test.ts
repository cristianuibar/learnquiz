import { readFileSync, readdirSync } from 'node:fs'
import { DatabaseSync } from 'node:sqlite'
import { drizzle } from 'drizzle-orm/sqlite-proxy'
import { afterAll, beforeAll, beforeEach, afterEach, expect, it, vi } from 'vitest'
import { toItemView } from '@/lib/learning/grade'
import type { ItemPayload } from '@/lib/llm/schemas'
import { serveItemImage } from './item-media'

const boundary = vi.hoisted(() => ({
  db: null as unknown,
  learnerId: 'u1' as string | null,
  objects: new Map<string, { body: Uint8Array; contentType: string }>(),
}))
vi.mock('@tanstack/react-start', () => ({ createServerOnlyFn: (fn: unknown) => fn }))
vi.mock('@/db', () => ({ getDb: () => boundary.db }))
vi.mock('@/server/env', () => ({
  getEnv: () => ({
    MEDIA: {
      get: async (key: string) => {
        const o = boundary.objects.get(key)
        return o ? { body: o.body, httpMetadata: { contentType: o.contentType } } : null
      },
    },
  }),
}))
vi.mock('@/server/session', () => ({ getLearnerId: async () => boundary.learnerId }))

const bytes = Uint8Array.from([137, 80, 78, 71, 1, 2, 3])
const image = { key: 'figure.png', alt: 'A figure', width: 4, height: 3 }
const payload = { format: 'cloze', stem: 'x = ____', options: [], accepted_answers: ['1'], model_answer: '1', explanation: '', difficulty: 3, source_quote: null, grounded: false, image } as unknown as ItemPayload
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
  boundary.learnerId = 'u1'
  boundary.objects.clear()
  boundary.objects.set('items/item/figure.png', { body: bytes, contentType: 'image/png' })
  for (const id of ['u1', 'u2']) raw.prepare('INSERT INTO user (id, name, email) VALUES (?, ?, ?)').run(id, id, `${id}@example.test`)
  raw.prepare('INSERT INTO organization (id, name, slug, created_at) VALUES (?, ?, ?, ?)').run('org-a', 'Alpha', 'alpha', 1)
  raw.prepare('INSERT INTO member (id, organization_id, user_id, role, created_at) VALUES (?, ?, ?, ?, ?)').run('m1', 'org-a', 'u1', 'member', 1)
  raw.prepare('INSERT INTO job_roles (id, org_id, name, benchmark, created_at) VALUES (?, ?, ?, ?, ?)').run('role', 'org-a', 'Analyst', 0.5, 1)
  raw.prepare('INSERT INTO member_role_assignments (user_id, org_id, job_role_id, assigned_at) VALUES (?, ?, ?, ?)').run('u1', 'org-a', 'role', 1)
  raw.prepare('INSERT INTO topics (id, job_role_id, org_id, title, status, created_at) VALUES (?, ?, ?, ?, ?, ?)').run('t1', 'role', 'org-a', 'Role topic', 'ready', 1)
  raw.prepare('INSERT INTO units (id, topic_id, "order", name) VALUES (?, ?, ?, ?)').run('un1', 't1', 0, 'Basics')
  raw.prepare('INSERT INTO concepts (id, topic_id, unit_id, "order", name, summary) VALUES (?, ?, ?, ?, ?, ?)').run('c1', 't1', 'un1', 0, 'Figures', '')
  raw.prepare('INSERT INTO items (id, concept_id, topic_id, format, payload_json, created_at) VALUES (?, ?, ?, ?, ?, ?)').run('item', 'c1', 't1', 'cloze', JSON.stringify(payload), 1)
})
afterEach(() => raw.exec('ROLLBACK'))

it('serves a role topic item image to an assigned member as a non-sniffable private image', async () => {
  const res = await serveItemImage('item')
  expect(res.status).toBe(200)
  expect(res.headers.get('content-type')).toMatch(/^image\//)
  expect(res.headers.get('x-content-type-options')).toBe('nosniff')
  expect(res.headers.get('cache-control')).toBe('private, max-age=86400')
  expect(new Uint8Array(await res.arrayBuffer())).toEqual(bytes)
})

it.each([
  ['an unrelated learner', 'u2', 404],
  ['no session', null, 401],
])('refuses the image to %s', async (_name, learnerId, status) => {
  boundary.learnerId = learnerId
  expect((await serveItemImage('item')).status).toBe(status)
})

it.each([
  ['owner', 'owner', 200],
  ['admin', 'admin', 200],
  ['combined admin role', 'member,admin', 200],
  ['unassigned member', 'member', 404],
  ['another company owner', 'owner', 404],
])('serves portal images only to the owning company admins: %s', async (name, role, status) => {
  raw.prepare('DELETE FROM member_role_assignments').run()
  raw.prepare('UPDATE member SET role = ? WHERE id = ?').run(role, 'm1')
  if (name === 'another company owner') {
    raw.prepare('INSERT INTO organization (id, name, slug, created_at) VALUES (?, ?, ?, ?)').run('org-b', 'Beta', 'org-a', 1)
    raw.prepare('UPDATE member SET organization_id = ? WHERE id = ?').run('org-b', 'm1')
  }
  const res = await serveItemImage('item')
  expect(res.status).toBe(status)
  if (status === 200) expect(new Uint8Array(await res.arrayBuffer())).toEqual(bytes)
})

it('points the item view at the served route', () => {
  const view = toItemView({ id: 'item', conceptId: 'c1', conceptName: 'Figures', format: 'cloze', difficultyPrior: 3, payload }, 'seed')
  expect(view.image).toEqual({ src: '/media/items/item', alt: 'A figure', width: 4, height: 3 })
})
