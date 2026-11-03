import { DatabaseSync } from 'node:sqlite'
import { readFileSync, readdirSync } from 'node:fs'
import { drizzle } from 'drizzle-orm/sqlite-proxy'
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest'
import { ZodError, type z } from 'zod'

// Only external boundaries are faked: the server-fn transport, auth, the model client and Cloudflare bindings.
// Handlers run for real against an in-memory SQLite database speaking the drizzle proxy protocol.
const holder = vi.hoisted(() => ({ db: null as unknown }))

vi.mock('@tanstack/react-start', () => ({
  createServerFn: () => ({
    handler: (fn: unknown) => fn,
    validator: (schema: z.ZodType | ((data: unknown) => unknown)) => ({
      handler: (fn: (input: { data: unknown }) => unknown) => ({ data }: { data: unknown }) => fn({ data: typeof schema === 'function' ? schema(data) : schema.parse(data) }),
    }),
  }),
}))

vi.mock('@/db', () => ({ getDb: () => holder.db }))

vi.mock('@/server/session', () => ({ requireLearnerId: vi.fn(async () => 'u1'), getSessionUser: async () => ({ id: 'u1', isAnonymous: false }) }))

vi.mock('@/lib/llm/client', async (importOriginal) => {
  const client = await importOriginal<typeof import('@/lib/llm/client')>()
  return {
    ...client,
    chatJson: vi.fn(async () => ({ line: 'You know the basics and will grow from here.' })),
    chatJsonWithModel: vi.fn(async () => ({ data: { line: 'You know the basics and will grow from here.' }, model: 'muse-spark-1.3' })),
  }
})

vi.mock('cloudflare:workers', () => ({ env: { LLM_PROFILE: 'ollama', LLM_MODEL: 'muse-spark-1.3', LLM_BASE_URL: 'https://llm.example/v1' } }))

import { answerItem } from './play'

type Method = 'run' | 'all' | 'values' | 'get'

function makeDb() {
  const raw = new DatabaseSync(':memory:')
  for (const file of readdirSync('drizzle').filter((f) => f.endsWith('.sql')).sort()) {
    raw.exec(readFileSync(`drizzle/${file}`, 'utf8').replaceAll('--> statement-breakpoint', ''))
  }

  const runOne = (sqlText: string, params: unknown[], method: Method): { rows: unknown[] } => {
    if (params.length > 100) throw new Error('D1 supports at most 100 bound parameters per statement')
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
afterEach(() => { raw.exec('ROLLBACK'); vi.restoreAllMocks() })
afterAll(() => { raw.close() })

const scalar = (raw: DatabaseSync, sqlText: string, ...params: (string | number)[]) =>
  (raw.prepare(sqlText).get(...params) as unknown as Record<string, unknown> | undefined) ?? {}

const base = { stem: 'Pick.', accepted_answers: [], model_answer: '', explanation: 'Because.', difficulty: 1, source_quote: null, grounded: false, bloom: 'apply' }
const opts = (correct: string[]) => ['a', 'b', 'c', 'd'].map((id) => ({ id, text: `Option ${id}`, is_correct: correct.includes(id), feedback: `Why ${id}.` }))
const payloads = {
  multi: { ...base, format: 'multi', options: opts(['a', 'c']) },
  order: { ...base, format: 'order', options: opts(['a', 'b', 'c', 'd']) },
}

// One item under test first, then two fillers so the session body has room to re-insert a miss.
function seed(format: 'multi' | 'order') {
  raw.prepare('INSERT INTO topics (id, learner_id, title, goal, status, created_at) VALUES (?, ?, ?, ?, ?, ?)').run('t1', 'u1', 'Algebra', null, 'ready', 1)
  raw.prepare('INSERT INTO learner_topic (learner_id, topic_id, level, rating, last_session_at, streak_count, streak_freeze_available, xp) VALUES (?, ?, ?, ?, ?, ?, ?, ?)')
    .run('u1', 't1', 1, 1500, null, 0, 1, 0)
  raw.prepare('INSERT INTO units (id, topic_id, "order", name) VALUES (?, ?, ?, ?)').run('un1', 't1', 0, 'Basics')
  raw.prepare('INSERT INTO learner_unit (learner_id, unit_id, unlocked_at) VALUES (?, ?, ?)').run('u1', 'un1', 1)
  raw.prepare('INSERT INTO concepts (id, topic_id, unit_id, "order", name, summary) VALUES (?, ?, ?, ?, ?, ?)').run('c1', 't1', 'un1', 0, 'Variables', '')
  const item = raw.prepare('INSERT INTO items (id, concept_id, topic_id, format, payload_json, difficulty_prior, created_at) VALUES (?, ?, ?, ?, ?, ?, ?)')
  const schedule = raw.prepare('INSERT INTO learner_item (learner_id, item_id, due, stability, difficulty, state) VALUES (?, ?, ?, ?, ?, ?)')
  const filler = JSON.stringify({ ...base, format: 'cloze', stem: 'x = ____', options: [], accepted_answers: ['1'], model_answer: '1' })
  item.run('i1', 'c1', 't1', format, JSON.stringify(payloads[format]), 1, Date.now())
  item.run('i2', 'c1', 't1', 'cloze', filler, 1, Date.now())
  item.run('i3', 'c1', 't1', 'cloze', filler, 1, Date.now())
  for (const id of ['i1', 'i2', 'i3']) schedule.run('u1', id, Date.now() + 86_400_000, 1, 5, 2)
  const queue = ['i1', 'i2', 'i3']
  const plan = { queue, position: 0, answered: false, reinserted: [], reasons: { due: 3, frontier: 0, closers: 0 }, unitStart: {} }
  raw.prepare('INSERT INTO sessions (id, learner_id, topic_id, kind, item_ids_json, plan_json, started_at) VALUES (?, ?, ?, ?, ?, ?, ?)')
    .run('s1', 'u1', 't1', 'session', JSON.stringify(queue), JSON.stringify(plan), 1)
}

const ask = (answer: Record<string, unknown>, confidence: 'sure' | 'unsure' | 'guess' = 'sure') =>
  answerItem({ data: { sessionId: 's1', itemId: 'i1', answer, confidence, responseMs: 1000 } } as never)

describe('multi-select answers', () => {
  beforeEach(() => seed('multi'))

  it('grades a partial pick as P, scores it 0.5 and re-asks it without flagging a confident miss', async () => {
    const reveal = await ask({ optionIds: ['a'] })
    expect(reveal).toMatchObject({ state: 'P', correct: false, detail: { kind: 'multi', found: 1, extra: 0, total: 2 }, returnsThisSession: true })
    expect(scalar(raw, 'SELECT score, correct FROM attempts WHERE session_id = ?', 's1')).toEqual({ score: 0.5, correct: 0 })
    expect(scalar(raw, 'SELECT last_wrong_confident_at FROM learner_item WHERE item_id = ?', 'i1').last_wrong_confident_at).toBeNull()
    expect(JSON.parse(scalar(raw, 'SELECT plan_json FROM sessions WHERE id = ?', 's1').plan_json as string).reinserted).toContain('i1')
  })

  it('grades the exact set as A', async () => {
    expect(await ask({ optionIds: ['a', 'c'] })).toMatchObject({ state: 'A', correct: true })
  })

  it('rejects more than five option ids at the validator', async () => {
    // The mocked transport validates synchronously; api-v1 answers a validation error with a 400.
    expect(() => ask({ optionIds: ['a', 'b', 'c', 'd', 'e', 'f', 'g', 'h', 'i'] })).toThrow(ZodError)
  })
})

describe('ordering answers', () => {
  beforeEach(() => seed('order'))

  it('grades the exact order as correct with every position right', async () => {
    const reveal = await ask({ order: ['a', 'b', 'c', 'd'] })
    expect(reveal).toMatchObject({ state: 'A', correct: true, detail: { kind: 'order', rightPositions: 4 } })
  })

  it('grades one swap as wrong with two positions right', async () => {
    const reveal = await ask({ order: ['b', 'a', 'c', 'd'] }, 'unsure')
    expect(reveal).toMatchObject({ state: 'C', correct: false, detail: { kind: 'order', rightPositions: 2 } })
  })

  it.each([[['a', 'a', 'b', 'c']], [['a', 'b', 'c']]])('rejects the non-permutation %j with a 400', async (order) => {
    await expect(ask({ order })).rejects.toMatchObject({ status: 400 })
  })
})
