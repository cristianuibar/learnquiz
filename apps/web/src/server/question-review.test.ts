import { readFileSync, readdirSync } from 'node:fs'
import { DatabaseSync } from 'node:sqlite'
import { drizzle } from 'drizzle-orm/sqlite-proxy'
import { afterAll, beforeAll, expect, it, vi } from 'vitest'
import type { ItemPayload } from '@/lib/llm/schemas'
import { getQuestionReview, reviewQuestion } from './question-review'
import { reportItem } from './play'

const holder = vi.hoisted(() => ({ db: null as unknown, userId: 'admin-a' as string | null }))

// Fake only the transport, session and Cloudflare database binding. Authorization,
// validation and all queries execute against SQLite with the real migrations.
vi.mock('@tanstack/react-start', () => ({
  createServerFn: () => ({
    validator: (schema: { parse: (input: unknown) => unknown }) => ({
      handler: (fn: (context: { data: unknown }) => unknown) => (context: { data: unknown }) => fn({ data: schema.parse(context.data) }),
    }),
  }),
}))
vi.mock('@/db', () => ({ getDb: () => holder.db }))
vi.mock('@/server/session', () => ({
  getSessionUser: async () => holder.userId ? { id: holder.userId, isAnonymous: false } : null,
  requireLearnerId: async () => holder.userId,
}))
vi.mock('@/server/env', () => ({}))

const payload: ItemPayload = {
  format: 'cloze', stem: 'Solve x + 1 = 2: x = ____.', options: [], accepted_answers: ['1'], model_answer: '1',
  explanation: 'Subtract 1 from both sides.', difficulty: 1, source_quote: 'Subtract 1 from both sides.', grounded: true, bloom: 'apply',
}
let raw: DatabaseSync
const row = (sql: string, ...params: (string | number)[]) => raw.prepare(sql).get(...params)

beforeAll(() => {
  vi.useFakeTimers({ toFake: ['Date'] })
  vi.setSystemTime(new Date('2026-11-02T12:00:00Z'))
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
  for (const id of ['admin-a', 'member-a', 'owner-b']) {
    raw.prepare('INSERT INTO user (id, name, email) VALUES (?, ?, ?)').run(id, id, `${id}@example.test`)
  }
  for (const [id, slug] of [['org-a', 'alpha'], ['org-b', 'beta']]) {
    raw.prepare('INSERT INTO organization (id, name, slug, created_at) VALUES (?, ?, ?, ?)').run(id, slug, slug, Date.now())
  }
  for (const [id, org, role] of [['admin-a', 'org-a', 'admin'], ['member-a', 'org-a', 'member'], ['owner-b', 'org-b', 'owner']]) {
    raw.prepare('INSERT INTO member (id, organization_id, user_id, role, created_at) VALUES (?, ?, ?, ?, ?)').run(id, org, id, role, Date.now())
  }
  for (const [id, org] of [['a', 'org-a'], ['b', 'org-b'], ['personal', null]]) {
    const roleId = org ? `role-${id}` : null
    if (org) raw.prepare('INSERT INTO job_roles (id, org_id, name, created_at) VALUES (?, ?, ?, ?)').run(roleId, org, id, Date.now())
    raw.prepare("INSERT INTO topics (id, job_role_id, learner_id, title, status, created_at) VALUES (?, ?, ?, ?, 'ready', ?)")
      .run(id, roleId, org ? null : 'admin-a', id, Date.now())
    raw.prepare("INSERT INTO units (id, topic_id, 'order', name) VALUES (?, ?, 0, 'Basics')").run(`unit-${id}`, id)
    raw.prepare("INSERT INTO sources (id, topic_id, kind, title, body_text, created_at) VALUES (?, ?, 'text', 'Algebra', ?, ?)").run(`source-${id}`, id, 'To solve the equation: Subtract 1 from both sides.', Date.now())
    raw.prepare("INSERT INTO concepts (id, topic_id, unit_id, 'order', name, summary, source_id, source_quote, grounded) VALUES (?, ?, ?, 0, 'Equations', '', ?, ?, 1)")
      .run(`concept-${id}`, id, `unit-${id}`, `source-${id}`, payload.source_quote)
    for (const name of ['live', 'invalid', 'flag']) {
      raw.prepare("INSERT INTO items (id, concept_id, topic_id, format, payload_json, check_json, created_at) VALUES (?, ?, ?, 'cloze', ?, '{\"keep\":true}', ?)")
        .run(`${id}-${name}`, `concept-${id}`, id, JSON.stringify(payload), Date.now())
    }
  }
  raw.prepare("UPDATE items SET status = 'reported' WHERE id = 'a-flag'").run()
})
afterAll(() => { raw.close(); vi.useRealTimers() })

it('lists company questions and learner flags, approves, edits and retires without resurrecting the question', async () => {
  holder.userId = 'admin-a'
  const review = await getQuestionReview({ data: { slug: 'alpha' } })
  expect(review.topics).toEqual([{ id: 'a', title: 'a' }])
  expect(review.concepts[0]).toMatchObject({ name: 'Equations', sourceQuote: payload.source_quote })
  expect(review.concepts[0].questions.map((q) => [q.id, q.status])).toEqual([
    ['a-live', 'active'], ['a-invalid', 'active'], ['a-flag', 'reported'],
  ])

  await reviewQuestion({ data: { slug: 'alpha', itemId: 'a-live', action: 'approve' } })
  expect(row('SELECT reviewed_by, reviewed_at FROM items WHERE id = ?', 'a-live')).toEqual({ reviewed_by: 'admin-a', reviewed_at: Date.now() })
  const edited: ItemPayload = {
    ...payload, format: 'mcq', stem: 'What is x when x + 1 = 2?', difficulty: 2, source_quote: 'subtract 1 from both sides.',
    options: ['1', '2', '3'].map((text, i) => ({ id: String(i), text, is_correct: i === 0, feedback: '' })),
  }
  await reviewQuestion({ data: { slug: 'alpha', itemId: 'a-live', action: 'edit', payload: edited } })
  expect(row('SELECT format, difficulty_prior, reviewed_by, reviewed_at, check_json, payload_json FROM items WHERE id = ?', 'a-live')).toEqual({
    format: 'mcq', difficulty_prior: 2, reviewed_by: null, reviewed_at: null, check_json: null,
    payload_json: JSON.stringify({ ...edited, source_quote: payload.source_quote }),
  })
  await reviewQuestion({ data: { slug: 'alpha', itemId: 'a-flag', action: 'edit', payload: edited } })
  expect(row('SELECT status FROM items WHERE id = ?', 'a-flag')).toEqual({ status: 'reported' })
  await reviewQuestion({ data: { slug: 'alpha', itemId: 'a-flag', action: 'approve' } })
  expect(row('SELECT status, reviewed_by FROM items WHERE id = ?', 'a-flag')).toEqual({ status: 'active', reviewed_by: 'admin-a' })
  await reviewQuestion({ data: { slug: 'alpha', itemId: 'a-live', action: 'retire' } })
  await expect(reviewQuestion({ data: { slug: 'alpha', itemId: 'a-live', action: 'approve' } })).rejects.toMatchObject({ status: 409 })
  expect(row('SELECT status FROM items WHERE id = ?', 'a-live')).toEqual({ status: 'retired' })
  raw.prepare("UPDATE items SET status = 'retired' WHERE id = 'personal-live'").run()
  await expect(reportItem({ data: { itemId: 'personal-live' } })).rejects.toMatchObject({ status: 404 })
  expect(row('SELECT status FROM items WHERE id = ?', 'personal-live')).toEqual({ status: 'retired' })
})

it('rejects invalid payloads, invented quotes and removing grounding with a message, preserving the stored question', async () => {
  holder.userId = 'admin-a'
  await reviewQuestion({ data: { slug: 'alpha', itemId: 'a-invalid', action: 'approve' } })
  const original = row('SELECT * FROM items WHERE id = ?', 'a-invalid')
  for (const invalid of [
    { ...payload, format: 'mcq' },
    { ...payload, source_quote: 'Add 1 to both sides.' },
    { ...payload, source_quote: null, grounded: false },
    { ...payload, format: 'order', accepted_answers: [], options: ['a', 'b', 'c'].map((id) => ({ id, text: id, is_correct: true, feedback: id })) },
  ]) {
    await expect(reviewQuestion({ data: { slug: 'alpha', itemId: 'a-invalid', action: 'edit', payload: invalid } }))
      .rejects.toMatchObject({ status: 400, message: expect.stringMatching(/Invalid question|source quote/) })
    expect(row('SELECT * FROM items WHERE id = ?', 'a-invalid')).toEqual(original)
  }
})

it.each([null, 'member-a', 'owner-b'])('refuses review reads and writes for %s', async (userId) => {
  holder.userId = userId
  const status = userId === null ? 401 : 403
  await expect(getQuestionReview({ data: { slug: 'alpha' } })).rejects.toMatchObject({ status })
  for (const action of ['approve', 'edit', 'retire'] as const) {
    await expect(reviewQuestion({ data: { slug: 'alpha', itemId: 'a-invalid', action, payload } })).rejects.toMatchObject({ status })
  }
})

it('scopes topic reads and every review action to the admin company, excluding personal topics', async () => {
  holder.userId = 'admin-a'
  for (const topicId of ['b', 'personal']) {
    await expect(getQuestionReview({ data: { slug: 'alpha', topicId } })).rejects.toMatchObject({ status: 404 })
    const original = row('SELECT * FROM items WHERE id = ?', `${topicId}-live`)
    for (const action of ['approve', 'edit', 'retire'] as const) {
      await expect(reviewQuestion({ data: { slug: 'alpha', itemId: `${topicId}-live`, action, payload } })).rejects.toMatchObject({ status: 404 })
      expect(row('SELECT * FROM items WHERE id = ?', `${topicId}-live`)).toEqual(original)
    }
  }
})
