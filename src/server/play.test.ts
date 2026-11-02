import { DatabaseSync } from 'node:sqlite'
import { readFileSync, readdirSync } from 'node:fs'
import { drizzle } from 'drizzle-orm/sqlite-proxy'
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest'
import { chatJson, LlmError } from '@/lib/llm/client'
import { requireLearnerId } from '@/server/session'

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

vi.mock('@/server/session', () => ({ requireLearnerId: vi.fn(async () => 'u1') }))

vi.mock('@/lib/llm/client', () => ({
  isVoiceEnabled: () => false,
  chatJson: vi.fn(async () => ({ line: 'You know the basics and will grow from here.' })),
  LlmError: class LlmError extends Error {
    constructor(message: string, public status: number) {
      super(message)
    }
  },
}))

vi.mock('cloudflare:workers', () => ({ env: {} }))

import { endSession, nextItem, startSession } from './play'
import { getTopicPath } from './curriculum'

type Method = 'run' | 'all' | 'values' | 'get'

function makeDb() {
  const raw = new DatabaseSync(':memory:')
  for (const file of readdirSync('drizzle').filter((f) => f.endsWith('.sql')).sort()) {
    raw.exec(readFileSync(`drizzle/${file}`, 'utf8').replaceAll('--> statement-breakpoint', ''))
  }

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
      raw.exec('SAVEPOINT d1_batch')
      try {
        const out = batch.map((q) => runOne(q.sql, q.params, q.method))
        raw.exec('RELEASE d1_batch')
        return out
      } catch (e) {
        raw.exec('ROLLBACK TO d1_batch')
        raw.exec('RELEASE d1_batch')
        throw e
      }
    },
  )
  holder.db = db
  return raw
}

let raw: DatabaseSync
beforeAll(() => { raw = makeDb() })
beforeEach(() => { raw.exec('BEGIN') })
afterEach(() => { raw.exec('ROLLBACK') })
afterAll(() => { raw.close() })

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

function seedFrontier(raw: DatabaseSync, itemCount: number, hasDue: boolean) {
  raw.prepare('INSERT INTO units (id, topic_id, "order", name) VALUES (?, ?, ?, ?)').run('un1', 't1', 0, 'Basics')
  raw.prepare('INSERT INTO learner_unit (learner_id, unit_id, unlocked_at) VALUES (?, ?, ?)').run('u1', 'un1', 1)
  raw.prepare('INSERT INTO concepts (id, topic_id, unit_id, "order", name, summary) VALUES (?, ?, ?, ?, ?, ?)').run('c1', 't1', 'un1', 0, 'Variables', '')
  const payload = JSON.stringify({
    format: 'cloze', stem: 'Solve x + 1 = 2: x = ____.', options: [], accepted_answers: ['1'], model_answer: '1',
    explanation: 'Subtract 1 from both sides.', difficulty: 1, source_quote: null, grounded: false, bloom: 'apply',
  })
  const item = raw.prepare('INSERT INTO items (id, concept_id, topic_id, format, payload_json, difficulty_prior, created_at) VALUES (?, ?, ?, ?, ?, ?, ?)')
  const schedule = raw.prepare('INSERT INTO learner_item (learner_id, item_id, due, stability, difficulty, state) VALUES (?, ?, ?, ?, ?, ?)')
  for (let i = 1; i <= itemCount; i++) {
    item.run(`i${i}`, 'c1', 't1', 'cloze', payload, 1, Date.now())
    schedule.run('u1', `i${i}`, Date.now() + (hasDue && i === 1 ? -1 : 86_400_000), 1, 5, 2)
  }
}

describe('learner practice and unit unlocks', () => {
  beforeEach(() => {
    vi.useFakeTimers({ toFake: ['Date'] })
    vi.setSystemTime(new Date('2026-10-29T12:00:00Z'))
    vi.mocked(chatJson).mockClear()
    seedTopicAndLearner(raw, 0)
  })
  afterEach(() => {
    vi.useRealTimers()
  })

  it('keeps unit 2 locked in another learner\'s Path and practice after placement', async () => {
    const payload = JSON.stringify({
      format: 'cloze', stem: 'Solve x + 1 = 2: x = ____.', options: [], accepted_answers: ['1'], model_answer: '1',
      explanation: 'Subtract 1 from both sides.', difficulty: 1, source_quote: null, grounded: false, bloom: 'apply',
    })
    for (const order of [0, 1]) {
      const unitId = `un${order + 1}`
      const conceptId = `c${order + 1}`
      raw.prepare('INSERT INTO units (id, topic_id, "order", name) VALUES (?, ?, ?, ?)').run(unitId, 't1', order, `Unit ${order + 1}`)
      raw.prepare('INSERT INTO concepts (id, topic_id, unit_id, "order", name, summary) VALUES (?, ?, ?, ?, ?, ?)')
        .run(conceptId, 't1', unitId, 0, `Concept ${order + 1}`, '')
      for (let i = 0; i < 6; i++) {
        raw.prepare('INSERT INTO items (id, concept_id, topic_id, format, payload_json, difficulty_prior, created_at) VALUES (?, ?, ?, ?, ?, ?, ?)')
          .run(`${conceptId}-i${i}`, conceptId, 't1', 'cloze', payload, 1, Date.now())
      }
    }
    const plan = JSON.stringify({
      position: 7, answered: true, workingLevel: 1,
      log: Array.from({ length: 8 }, () => ({ itemId: 'c1-i0', correct: false, confidence: 'sure', level: 1 })),
      pool: [],
    })
    raw.prepare('INSERT INTO sessions (id, learner_id, topic_id, kind, plan_json, started_at) VALUES (?, ?, ?, ?, ?, ?)')
      .run('s1', 'u1', 't1', 'placement', plan, Date.now())

    await endSession({ data: { sessionId: 's1' } })
    expect((await getTopicPath({ data: { topicId: 't1' } })).units.map((u) => u.unlocked)).toEqual([true, true])
    expect(scalar(raw, 'SELECT COUNT(*) AS n FROM units WHERE unlocked_at IS NOT NULL').n).toBe(0)
    await expect(startSession({ data: { topicId: 't1' } })).resolves.toEqual({ sessionId: expect.any(String) })

    // Retained legacy timestamps must not grant the next learner access.
    raw.prepare('UPDATE units SET unlocked_at = ? WHERE topic_id = ?').run(1, 't1')
    // Shared-role access is not available yet. Transfer ownership so both learners
    // exercise the same stored units through the existing authorization checks.
    raw.prepare('UPDATE topics SET learner_id = ? WHERE id = ?').run('u2', 't1')
    raw.prepare('INSERT INTO learner_topic (learner_id, topic_id) VALUES (?, ?)').run('u2', 't1')
    vi.mocked(requireLearnerId).mockResolvedValueOnce('u2')
    expect((await getTopicPath({ data: { topicId: 't1' } })).units.map((u) => u.unlocked)).toEqual([false, false])
    vi.mocked(requireLearnerId).mockResolvedValueOnce('u2')
    await expect(startSession({ data: { topicId: 't1' } })).rejects.toMatchObject({ status: 409, message: 'Nothing to practise yet' })
    expect(scalar(raw, 'SELECT COUNT(*) AS n FROM sessions WHERE learner_id = ?', 'u2').n).toBe(0)
  })

  it.each([
    { frontier: 'underfilled', itemCount: 1, hasDue: true },
    { frontier: 'seen-out', itemCount: 6, hasDue: true },
    { frontier: 'underfilled', itemCount: 1, hasDue: false },
  ])('handles the daily cap with a $frontier frontier and hasDue=$hasDue', async ({ itemCount, hasDue }) => {
    seedFrontier(raw, itemCount, hasDue)
    const log = raw.prepare('INSERT INTO model_calls (id, learner_id, purpose, model, latency_ms, ok, created_at) VALUES (?, ?, ?, ?, ?, ?, ?)')
    for (let i = 0; i < 20; i++) log.run(`call-${i}`, 'u1', 'items', 'muse-spark-1.3', 0, 1, Date.now())

    const result = startSession({ data: { topicId: 't1' } })
    if (hasDue) {
      await expect(result).resolves.toEqual({ sessionId: expect.any(String) })
      const { sessionId } = await result
      const stored = scalar(raw, 'SELECT learner_id, topic_id, kind, item_ids_json, plan_json FROM sessions WHERE id = ?', sessionId)
      expect(stored).toMatchObject({ learner_id: 'u1', topic_id: 't1', kind: 'session', item_ids_json: JSON.stringify(['i1']) })
      expect(JSON.parse(stored.plan_json as string)).toMatchObject({ queue: ['i1'], reasons: { due: 1, frontier: 0, closers: 0 } })
    } else {
      await expect(result).rejects.toMatchObject({ status: 429 })
      expect(scalar(raw, 'SELECT COUNT(*) AS n FROM sessions').n).toBe(0)
    }
    expect(chatJson).not.toHaveBeenCalled()
    expect(scalar(raw, 'SELECT COUNT(*) AS n FROM model_calls').n).toBe(20)
  })

  it.each([new LlmError('Provider rate limit', 429), new Error('Unexpected generation failure')])(
    'propagates other frontier errors even with a due question: $message',
    async (error) => {
      seedFrontier(raw, 1, true)
      vi.mocked(chatJson).mockRejectedValueOnce(error)

      await expect(startSession({ data: { topicId: 't1' } })).rejects.toThrow(error.message)
      expect(scalar(raw, 'SELECT COUNT(*) AS n FROM sessions').n).toBe(0)
    },
  )
})

it('credits the session bonus once when two finishing nextItem calls race (practice)', async () => {
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
