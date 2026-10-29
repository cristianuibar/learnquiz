import { DatabaseSync } from 'node:sqlite'
import { readFileSync } from 'node:fs'
import { drizzle } from 'drizzle-orm/sqlite-proxy'
import { expect, it, vi } from 'vitest'

// Only external boundaries are faked: the server-fn transport, auth, the model
// client and the Cloudflare bindings. The handlers under test run for real
// against an in-memory SQLite database speaking the drizzle proxy protocol.
const holder = vi.hoisted(() => ({ db: null as unknown }))

vi.mock('@tanstack/react-start', () => ({
  createServerFn: () => ({
    validator: () => ({
      handler: (fn: unknown) => fn,
    }),
  }),
}))

vi.mock('@/db', () => ({ getDb: () => holder.db }))

vi.mock('@/server/session', () => ({ requireLearnerId: async () => 'u1' }))

vi.mock('@/lib/llm/client', () => ({
  chatJson: async () => ({ line: 'You know the basics and will grow from here.' }),
  LlmError: class LlmError extends Error {
    status = 500
  },
}))

vi.mock('cloudflare:workers', () => ({ env: {} }))

import { endSession, nextItem } from './play'

type Method = 'run' | 'all' | 'values' | 'get'

function makeDb() {
  const raw = new DatabaseSync(':memory:')
  const ddl = readFileSync(new URL('../../drizzle/0000_scaffold.sql', import.meta.url), 'utf8')
  raw.exec(ddl.replaceAll('--> statement-breakpoint', ''))

  const runOne = (sqlText: string, params: unknown[], method: Method): { rows: unknown[] } => {
    const stmt = raw.prepare(sqlText)
    ;(stmt as unknown as { setReturnArrays: (v: boolean) => void }).setReturnArrays(true)
    const args = params as (string | number | bigint | null)[]
    if (method === 'run') {
      stmt.run(...args)
      return { rows: [] }
    }
    if (method === 'get') {
      const row = stmt.get(...args) as unknown[] | undefined
      // drizzle's proxy expects `rows` to be the single row itself for `get`.
      return { rows: row as unknown as unknown[] }
    }
    return { rows: stmt.all(...args) as unknown[] }
  }

  const db = drizzle(
    async (sqlText, params, method) => runOne(sqlText, params, method),
    async (batch) => {
      raw.exec('BEGIN')
      try {
        const out = batch.map((q) => runOne(q.sql, q.params, q.method))
        raw.exec('COMMIT')
        return out
      } catch (e) {
        raw.exec('ROLLBACK')
        throw e
      }
    },
  )
  holder.db = db
  return raw
}

function seedTopicAndLearner(raw: DatabaseSync, xp: number) {
  raw
    .prepare('INSERT INTO topics (id, learner_id, title, goal, status, created_at) VALUES (?, ?, ?, ?, ?, ?)')
    .run('t1', 'u1', 'Algebra', null, 'ready', 1)
  raw
    .prepare(
      'INSERT INTO learner_topic (learner_id, topic_id, level, rating, last_session_at, streak_count, streak_freeze_available, xp) VALUES (?, ?, ?, ?, ?, ?, ?, ?)',
    )
    .run('u1', 't1', 1, 1500, null, 0, 1, xp)
}

const scalar = (raw: DatabaseSync, sqlText: string, ...params: (string | number)[]) =>
  (raw.prepare(sqlText).get(...params) as unknown as Record<string, unknown> | undefined) ?? {}

it('credits the session bonus once when two finishing nextItem calls race (practice)', async () => {
  const raw = makeDb()
  seedTopicAndLearner(raw, 100)
  const plan = JSON.stringify({
    queue: ['i1'],
    position: 0,
    answered: true,
    reinserted: [],
    reasons: { due: 0, frontier: 1, closers: 0 },
    unitStart: {},
    lastAttemptId: 'a1',
  })
  raw
    .prepare(
      'INSERT INTO sessions (id, learner_id, topic_id, kind, item_ids_json, plan_json, started_at, ended_at, correct_count, xp) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)',
    )
    .run('s1', 'u1', 't1', 'session', JSON.stringify(['i1']), plan, 1, null, 1, 0)
  raw
    .prepare(
      'INSERT INTO attempts (id, learner_id, session_id, item_id, concept_id, at, answer_json, correct, score, confidence, response_ms, grade_json, rating, p_known_before, p_known_after, retrievability_before) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)',
    )
    .run('a1', 'u1', 's1', 'i1', 'c1', 1, '{}', 1, 1, 'sure', 100, '{}', 3, 0.1, 0.5, null)

  const [a, b] = await Promise.all([nextItem({ data: { sessionId: 's1' } }), nextItem({ data: { sessionId: 's1' } })])

  expect(a.ended).toBe(true)
  expect(b.ended).toBe(true)
  expect(scalar(raw, 'SELECT xp FROM learner_topic WHERE learner_id = ? AND topic_id = ?', 'u1', 't1').xp).toBe(120)
  expect(scalar(raw, 'SELECT ended_at AS endedAt FROM sessions WHERE id = ?', 's1').endedAt).not.toBeNull()
  const summary = await endSession({ data: { sessionId: 's1' } })
  expect(summary.xp).toBe(20)
})

it('writes exactly one placement when two finishing nextItem calls race (placement)', async () => {
  const raw = makeDb()
  seedTopicAndLearner(raw, 0)
  raw.prepare('INSERT INTO units (id, topic_id, "order", name, summary, unlocked_at) VALUES (?, ?, ?, ?, ?, ?)').run('un1', 't1', 0, 'Basics', '', null)
  raw
    .prepare(
      'INSERT INTO concepts (id, topic_id, unit_id, "order", name, summary, level, source_id, source_quote, misconceptions_json, grounded, visual, image_key, image_alt) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)',
    )
    .run('c1', 't1', 'un1', 0, 'Variables', '', 3, null, null, '[]', 0, 0, null, null)
  raw
    .prepare(
      'INSERT INTO items (id, concept_id, topic_id, format, payload_json, difficulty_prior, elo_difficulty, check_json, status, created_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)',
    )
    .run('i1', 'c1', 't1', 'mcq', JSON.stringify({ format: 'mcq', stem: 'Q?', options: [], explanation: '', source_quote: '', difficulty: 3 }), 3, null, null, 'active', 1)
  const log = Array.from({ length: 8 }, () => ({ itemId: 'i1', correct: true, confidence: 'sure' as const, level: 4 }))
  const plan = JSON.stringify({
    position: 7,
    answered: true,
    workingLevel: 4,
    log,
    pool: [{ id: 'i1', conceptId: 'c1', difficulty: 3 }],
    lastAttemptId: 'a1',
  })
  raw
    .prepare(
      'INSERT INTO sessions (id, learner_id, topic_id, kind, item_ids_json, plan_json, started_at, ended_at, correct_count, xp) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)',
    )
    .run('s1', 'u1', 't1', 'placement', JSON.stringify(['i1']), plan, 1, null, 8, 0)

  const [a, b] = await Promise.all([nextItem({ data: { sessionId: 's1' } }), nextItem({ data: { sessionId: 's1' } })])

  expect(a.ended).toBe(true)
  expect(b.ended).toBe(true)
  expect(scalar(raw, 'SELECT COUNT(*) AS n FROM placements WHERE id = ?', 's1').n).toBe(1)
  expect(scalar(raw, 'SELECT level FROM learner_topic WHERE learner_id = ? AND topic_id = ?', 'u1', 't1').level).toBe(4)
  expect(scalar(raw, 'SELECT ended_at AS endedAt FROM sessions WHERE id = ?', 's1').endedAt).not.toBeNull()
  const summary = await endSession({ data: { sessionId: 's1' } })
  expect(summary.level).toBe(4)
  expect(summary.levelLine).toBe('You know the basics and will grow from here.')
})
