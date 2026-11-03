import { readFileSync, readdirSync } from 'node:fs'
import { DatabaseSync } from 'node:sqlite'
import { drizzle } from 'drizzle-orm/sqlite-proxy'
import { afterAll, beforeAll, expect, it, vi } from 'vitest'
import { flagResult } from './flags'

const holder = vi.hoisted(() => ({ db: null as unknown, user: null as { id: string; isAnonymous: boolean } | null }))

// Fake only the transport, session and Cloudflare database binding; queries run on SQLite with the real migrations.
vi.mock('@tanstack/react-start', () => ({
  createServerFn: () => ({
    validator: (schema: { parse: (input: unknown) => unknown }) => ({
      handler: (fn: (context: { data: unknown }) => unknown) => (context: { data: unknown }) => fn({ data: schema.parse(context.data) }),
    }),
  }),
}))
vi.mock('@/db', () => ({ getDb: () => holder.db }))
vi.mock('@/server/session', () => ({ getSessionUser: async () => holder.user }))
vi.mock('@/server/env', () => ({}))

let raw: DatabaseSync
const rows = (sql: string) => raw.prepare(sql).all()

beforeAll(() => {
  raw = new DatabaseSync(':memory:')
  for (const file of readdirSync('drizzle').filter((f) => f.endsWith('.sql')).sort()) {
    raw.exec(readFileSync(`drizzle/${file}`, 'utf8').replaceAll('--> statement-breakpoint', ''))
  }
  holder.db = drizzle(async (sql, params, method) => {
    const stmt = raw.prepare(sql)
    stmt.setReturnArrays(true)
    if (method === 'run') { stmt.run(...params); return { rows: [] } }
    return { rows: (method === 'get' ? stmt.get(...params) : stmt.all(...params)) as never }
  })
  for (const id of ['member-a', 'guest-a']) raw.prepare('INSERT INTO user (id, name, email) VALUES (?, ?, ?)').run(id, id, `${id}@example.test`)
  raw.prepare('INSERT INTO organization (id, name, slug, created_at) VALUES (?, ?, ?, ?)').run('org-a', 'alpha', 'alpha', 1)
  raw.prepare('INSERT INTO member (id, organization_id, user_id, role, created_at) VALUES (?, ?, ?, ?, ?)').run('m1', 'org-a', 'member-a', 'member', 1)
  raw.prepare("INSERT INTO topics (id, learner_id, title, status, created_at) VALUES ('t', 'guest-a', 't', 'ready', 1)").run()
  raw.prepare("INSERT INTO units (id, topic_id, 'order', name) VALUES ('u', 't', 0, 'U')").run()
  raw.prepare("INSERT INTO concepts (id, topic_id, unit_id, 'order', name, summary) VALUES ('c', 't', 'u', 0, 'C', '')").run()
  for (const [id, version] of [['i-old', 1], ['i-new', 2]]) {
    raw.prepare("INSERT INTO items (id, concept_id, topic_id, format, payload_json, source_version, created_at) VALUES (?, 'c', 't', 'cloze', '{}', ?, 1)").run(id, version)
  }
  for (const [id, item, at] of [['att-old', 'i-old', 100], ['att-new', 'i-new', 200]]) {
    raw.prepare(`INSERT INTO attempts (id, learner_id, item_id, concept_id, at, answer_json, correct, score, confidence, response_ms, rating, p_known_before, p_known_after)
      VALUES (?, 'member-a', ?, 'c', ?, '{}', 0, 0, 'sure', 1, 1, 0.5, 0.4)`).run(id, item, at)
  }
})
afterAll(() => raw.close())

it('files an unfair-result flag on the latest attempt, once', async () => {
  holder.user = { id: 'member-a', isAnonymous: false }
  expect(() => flagResult({ data: { conceptId: 'c', note: 'x'.repeat(501) } })).toThrow(/500/)
  await expect(flagResult({ data: { conceptId: 'c', note: 'Marked wrong but my answer was right' } })).resolves.toEqual({ ok: true })
  await flagResult({ data: { conceptId: 'c' } })
  expect(rows('SELECT item_id, user_id, reason, note, attempt_id, source_version FROM item_flags')).toEqual([
    { item_id: 'i-new', user_id: 'member-a', reason: 'unfair-result', note: 'Marked wrong but my answer was right', attempt_id: 'att-new', source_version: 2 },
  ])
})

it('refuses guests and non-members, and 404s without an attempt', async () => {
  holder.user = { id: 'guest-a', isAnonymous: true }
  await expect(flagResult({ data: { conceptId: 'c' } })).rejects.toMatchObject({ status: 403 })
  holder.user = { id: 'guest-a', isAnonymous: false }
  await expect(flagResult({ data: { conceptId: 'c' } })).rejects.toMatchObject({ status: 403 })
  holder.user = { id: 'member-a', isAnonymous: false }
  await expect(flagResult({ data: { conceptId: 'none' } })).rejects.toMatchObject({ status: 404, message: 'No attempt for this concept' })
  holder.user = null
  await expect(flagResult({ data: { conceptId: 'c' } })).rejects.toMatchObject({ status: 401 })
})
