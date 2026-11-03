import { readFileSync, readdirSync } from 'node:fs'
import { DatabaseSync } from 'node:sqlite'
import { drizzle } from 'drizzle-orm/sqlite-proxy'
import { afterAll, afterEach, beforeAll, beforeEach, expect, it } from 'vitest'
import type { Db } from '@/db'
import { MAX_PUSH_STEM, pickPushItem, previewItem } from './pick'

const NOW = Date.UTC(2026, 10, 2, 12)
const H = 3600_000
let raw: DatabaseSync
let db: Db

beforeAll(() => {
  raw = new DatabaseSync(':memory:')
  raw.exec('PRAGMA foreign_keys = ON')
  for (const file of readdirSync('drizzle').filter((f) => f.endsWith('.sql')).sort()) {
    raw.exec(readFileSync(`drizzle/${file}`, 'utf8').replaceAll('--> statement-breakpoint', ''))
  }
  for (const id of ['me', 'other']) raw.prepare('INSERT INTO user (id, name, email) VALUES (?, ?, ?)').run(id, id, `${id}@example.test`)
  db = drizzle(async (sql, params, method) => {
    const stmt = raw.prepare(sql)
    stmt.setReturnArrays(true)
    const args = params as (string | number | null)[]
    if (method === 'run') { stmt.run(...args); return { rows: [] } }
    return { rows: (method === 'get' ? stmt.get(...args) : stmt.all(...args)) as never }
  }) as unknown as Db
})
beforeEach(() => {
  raw.exec('BEGIN')
  const topic = raw.prepare("INSERT INTO topics (id, learner_id, title, status, created_at) VALUES (?, ?, 't', 'ready', 0)")
  topic.run('mine', 'me')
  topic.run('theirs', 'other')
})
afterEach(() => raw.exec('ROLLBACK'))
afterAll(() => raw.close())

// An item with a learner_item due `dueIn` ms from now.
function seed(id: string, dueIn: number, o: { topic?: string; format?: string; status?: string; stem?: string } = {}) {
  raw.prepare('INSERT INTO items (id, concept_id, topic_id, format, payload_json, status, created_at) VALUES (?, ?, ?, ?, ?, ?, 0)')
    .run(id, 'c', o.topic ?? 'mine', o.format ?? 'mcq', JSON.stringify({ stem: o.stem ?? `Stem ${id}` }), o.status ?? 'active')
  raw.prepare('INSERT INTO learner_item (learner_id, item_id, due, stability, difficulty, state) VALUES (?, ?, ?, 1, 1, 2)').run('me', id, NOW + dueIn)
}
const push = (itemId: string, outcome: string, ago: number) =>
  raw.prepare('INSERT INTO push_log (id, user_id, subscription_id, outcome, item_id, created_at) VALUES (?, ?, ?, ?, ?, ?)')
    .run(`p-${itemId}-${outcome}-${ago}`, 'me', 's', outcome, itemId, NOW - ago)

it('picks the most overdue eligible item and skips ineligible ones', async () => {
  seed('a-multi', -9 * H, { format: 'multi' })
  seed('b-long', -8 * H, { stem: 'x'.repeat(MAX_PUSH_STEM + 1) })
  seed('c-retired', -7 * H, { status: 'retired' })
  seed('d-foreign', -6 * H, { topic: 'theirs' })
  seed('e-recent', -5 * H)
  seed('f-failed', -4 * H)
  seed('g-old', -3 * H)
  seed('h-edge', -2 * H, { stem: 'x'.repeat(MAX_PUSH_STEM) })
  push('e-recent', 'accepted', 23 * H)
  push('f-failed', 'failed', H)
  push('g-old', 'accepted', 25 * H)
  expect((await pickPushItem(db, 'me', NOW))?.itemId).toBe('f-failed')
  push('f-failed', 'accepted', H)
  expect((await pickPushItem(db, 'me', NOW))?.itemId).toBe('g-old')
  push('g-old', 'accepted', 2 * H)
  expect(await pickPushItem(db, 'me', NOW)).toEqual({ itemId: 'h-edge', stem: 'x'.repeat(MAX_PUSH_STEM) })
})

it('breaks due ties by item id and ignores items that are not yet due', async () => {
  expect(await pickPushItem(db, 'me', NOW)).toBeNull()
  seed('z', -H)
  seed('b', -H)
  seed('later', H)
  expect(await pickPushItem(db, 'me', NOW)).toEqual({ itemId: 'b', stem: 'Stem b' })
})

it('previews the soonest upcoming item only when nothing is due', async () => {
  expect(await previewItem(db, 'me', NOW)).toBeNull()
  seed('far', 5 * H)
  seed('soon', 2 * H)
  seed('soon-multi', H, { format: 'multi' })
  expect(await pickPushItem(db, 'me', NOW)).toBeNull()
  expect(await previewItem(db, 'me', NOW)).toEqual({ itemId: 'soon', stem: 'Stem soon' })
  seed('due', -H)
  expect((await previewItem(db, 'me', NOW))?.itemId).toBe('due')
})
