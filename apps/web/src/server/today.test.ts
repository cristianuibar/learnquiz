import { DatabaseSync } from 'node:sqlite'
import { readFileSync, readdirSync } from 'node:fs'
import { drizzle } from 'drizzle-orm/sqlite-proxy'
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest'
import type { z } from 'zod'

// Only the server-fn transport, the session and Cloudflare bindings are faked; getToday runs for real
// against an in-memory SQLite database speaking the drizzle proxy protocol.
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

vi.mock('@/server/session', () => ({
  getLearnerId: vi.fn(async () => 'u1'),
  requireLearnerId: vi.fn(async () => 'u1'),
  getSessionUser: async () => ({ id: 'u1', isAnonymous: false }),
}))

vi.mock('cloudflare:workers', () => ({ env: {} }))

import { SESSION_SIZE } from './play'
import { getToday } from './today'

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
beforeEach(() => {
  raw.exec('BEGIN')
  vi.useFakeTimers({ toFake: ['Date'] })
  vi.setSystemTime(new Date('2026-11-03T12:00:00Z'))
})
afterEach(() => { raw.exec('ROLLBACK'); vi.useRealTimers() })
afterAll(() => { raw.close() })

const DAY = 86_400_000
const NOW = Date.parse('2026-11-03T12:00:00Z')
const DAY_START = Math.floor(NOW / DAY) * DAY

const run = (sql: string, ...p: (string | number | null)[]) => { raw.prepare(sql).run(...p) }

function personal(streak = 0, lastSessionAt: number | null = null) {
  run('INSERT INTO topics (id, learner_id, title, status, created_at) VALUES (?, ?, ?, ?, ?)', 't1', 'u1', 'Algebra', 'ready', 1)
  run('INSERT INTO learner_topic (learner_id, topic_id, level, rating, last_session_at, streak_count, streak_freeze_available, xp) VALUES (?, ?, ?, ?, ?, ?, ?, ?)',
    'u1', 't1', 1, 1500, lastSessionAt, streak, 1, 70)
}

function role({ assignedAt = NOW, days = 30, status = 'active', topicStatus = 'ready' } = {}) {
  run('INSERT INTO user (id, name, email) VALUES (?, ?, ?)', 'u1', 'Learner', 'learner@example.test')
  run('INSERT INTO organization (id, name, slug, created_at) VALUES (?, ?, ?, ?)', 'org-a', 'Alpha Co', 'alpha', 1)
  run('INSERT INTO member (id, organization_id, user_id, role, created_at) VALUES (?, ?, ?, ?, ?)', 'm1', 'org-a', 'u1', 'member', 1)
  run('INSERT INTO job_roles (id, org_id, name, benchmark, onboarding_days, status, created_at) VALUES (?, ?, ?, ?, ?, ?, ?)', 'role', 'org-a', 'Analyst', 0.7, days, status, 1)
  run('INSERT INTO member_role_assignments (user_id, org_id, job_role_id, assigned_at) VALUES (?, ?, ?, ?)', 'u1', 'org-a', 'role', assignedAt)
  run('INSERT INTO topics (id, learner_id, job_role_id, title, status, created_at) VALUES (?, ?, ?, ?, ?, ?)', 't1', null, 'role', 'Analyst onboarding', topicStatus, 1)
}

function unit(id: string, order: number, unlocked = true) {
  run('INSERT INTO units (id, topic_id, "order", name) VALUES (?, ?, ?, ?)', id, 't1', order, `Unit ${id}`)
  if (unlocked) run('INSERT INTO learner_unit (learner_id, unit_id, unlocked_at) VALUES (?, ?, ?)', 'u1', id, 1)
}

let conceptOrder = 0
function concept(id: string, unitId: string, genStatus = 'ready') {
  run('INSERT INTO concepts (id, topic_id, unit_id, "order", name, summary, gen_status) VALUES (?, ?, ?, ?, ?, ?, ?)', id, 't1', unitId, conceptOrder++, id, '', genStatus)
}

function item(id: string, conceptId: string, { format = 'cloze', due = NOW + DAY, status = 'active' } = {}) {
  run('INSERT INTO items (id, concept_id, topic_id, format, payload_json, difficulty_prior, status, created_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?)', id, conceptId, 't1', format, '{}', 1, status, 1)
  run('INSERT INTO learner_item (learner_id, item_id, due, stability, difficulty, state) VALUES (?, ?, ?, ?, ?, ?)', 'u1', id, due, 1, 5, 2)
}

const learn = (conceptId: string, p: number) =>
  run('INSERT INTO learner_concept (learner_id, concept_id, p_known, n_attempts, updated_at) VALUES (?, ?, ?, ?, ?)', 'u1', conceptId, p, 1, 1)

let attemptSeq = 0
function attempt(itemId: string, conceptId: string, at: number, sessionId: string | null = null, correct = 1) {
  run('INSERT INTO attempts (id, learner_id, session_id, item_id, concept_id, at, answer_json, correct, score, confidence, response_ms, rating, p_known_before, p_known_after) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)',
    `a${attemptSeq++}`, 'u1', sessionId, itemId, conceptId, at, '{}', correct, 1, 'sure', 1000, 3, 0.1, 0.2)
}

function session(id: string, kind: string, endedAt: number | null, attempts: number, correct = attempts) {
  run('INSERT INTO sessions (id, learner_id, topic_id, kind, started_at, ended_at) VALUES (?, ?, ?, ?, ?, ?)', id, 'u1', 't1', kind, DAY_START, endedAt)
  for (let i = 0; i < attempts; i++) attempt('i1', 'c1', DAY_START + 1000 + i, id, i < correct ? 1 : 0)
}

const place = () => run('INSERT INTO placements (id, learner_id, topic_id, log_json, created_at) VALUES (?, ?, ?, ?, ?)', 'p1', 'u1', 't1', '[]', 1)

// One unlocked unit, concept c1 and active item i1 (due tomorrow).
function basics() {
  unit('un1', 0)
  concept('c1', 'un1')
  item('i1', 'c1')
}

describe('getToday', () => {
  it('returns a personal topic with no role and a first-run plan', async () => {
    personal(4, NOW)
    basics()
    expect(await getToday()).toEqual({
      topic: { id: 't1', title: 'Algebra', placed: false, placeable: true, due: 0, xp: 70, streak: 4 },
      role: null,
      plan: {
        state: 'first', start: 'placement', nextUnit: null, reviewsLeft: 0, reviewsCleared: 0, sessionDone: false,
        sessionSize: SESSION_SIZE, playable: true, nextReviewAt: NOW + DAY,
      },
    })
    expect(SESSION_SIZE).toBe(12)
  })

  it('has no topic and no plan for a learner without a ready topic', async () => {
    expect(await getToday()).toEqual({ topic: null, role: null, plan: null })
  })

  it('reports a placed personal topic with the next frontier unit and a session start', async () => {
    personal()
    basics()
    place()
    const { topic, plan } = await getToday()
    expect(topic).toMatchObject({ placed: true, placeable: true })
    expect(plan).toMatchObject({ start: 'session', nextUnit: 'Unit un1', state: 'first', playable: true })
  })

  it('shows the preparing role with no topic or plan while the role topic is not ready', async () => {
    role({ topicStatus: 'generating' })
    run('INSERT INTO topics (id, learner_id, title, status, created_at) VALUES (?, ?, ?, ?, ?)', 'p-topic', 'u1', 'Mine', 'ready', 2)
    const today = await getToday()
    expect(today.topic).toBeNull()
    expect(today.plan).toBeNull()
    expect(today.role).toMatchObject({ name: 'Analyst', company: 'Alpha Co', topicTitle: 'Analyst onboarding', preparing: true })
  })

  it('prefers the role topic over a personal one and reports the role facts', async () => {
    role({ assignedAt: NOW - 2 * DAY })
    basics()
    expect(await getToday()).toMatchObject({
      topic: { id: 't1', title: 'Analyst onboarding', placeable: true, placed: false },
      role: { name: 'Analyst', company: 'Alpha Co', topicTitle: 'Analyst onboarding', preparing: false, mastery: null, benchmark: 0.7, day: 3, days: 30, building: null },
      plan: { state: 'first', start: 'placement' },
    })
  })

  it('gives an archived role no role and falls back to the personal topic', async () => {
    role({ status: 'archived', topicStatus: 'ready' })
    run("UPDATE topics SET learner_id = NULL WHERE id = 't1'")
    run('INSERT INTO topics (id, learner_id, title, status, created_at) VALUES (?, ?, ?, ?, ?)', 'p-topic', 'u1', 'Mine', 'ready', 2)
    const today = await getToday()
    expect(today.role).toBeNull()
    expect(today.topic).toMatchObject({ id: 'p-topic', title: 'Mine' })
    expect(today.plan).not.toBeNull()
  })

  it('picks the newest ready personal topic', async () => {
    personal()
    run('INSERT INTO topics (id, learner_id, title, status, created_at) VALUES (?, ?, ?, ?, ?)', 't2', 'u1', 'Newer', 'ready', 5)
    run('INSERT INTO topics (id, learner_id, title, status, created_at) VALUES (?, ?, ?, ?, ?)', 't3', 'u1', 'Newest unready', 'generating', 9)
    expect((await getToday()).topic).toMatchObject({ id: 't2', title: 'Newer' })
  })

  describe('start and placeability', () => {
    it('starts with a session for an unplaced role topic with no stored non-short items', async () => {
      role()
      unit('un1', 0)
      concept('c1', 'un1')
      item('i1', 'c1', { format: 'short' })
      const { topic, plan } = await getToday()
      expect(topic).toMatchObject({ placed: false, placeable: false })
      expect(plan).toMatchObject({ start: 'session' })
    })

    it('treats retired items as not placeable for a role topic', async () => {
      role()
      basics()
      run("UPDATE items SET status = 'retired'")
      expect((await getToday()).topic).toMatchObject({ placeable: false })
    })

    it('starts with a placement for an unplaced role topic holding a stored non-short item', async () => {
      role()
      basics()
      const { topic, plan } = await getToday()
      expect(topic).toMatchObject({ placed: false, placeable: true })
      expect(plan).toMatchObject({ start: 'placement', nextUnit: null, playable: true })
    })
  })

  describe('streak', () => {
    it.each([
      ['today', 0, 4],
      ['yesterday', DAY, 4],
      ['two days ago', 2 * DAY, 0],
      ['three days ago', 3 * DAY, 0],
    ])('reads the stored streak of 4 as per last session %s', async (_when, ago, streak) => {
      personal(4, NOW - ago)
      expect((await getToday()).topic?.streak).toBe(streak)
    })

    it('reads 0 when there has been no session', async () => {
      personal(4, null)
      expect((await getToday()).topic?.streak).toBe(0)
    })
  })

  describe('reviews', () => {
    it('counts 4 reviews left and 2 cleared today, with the earliest future due as the next review', async () => {
      personal()
      unit('un1', 0)
      concept('c1', 'un1')
      place()
      for (let i = 1; i <= 4; i++) item(`d${i}`, 'c1', { due: NOW - i * 1000 })
      item('k1', 'c1', { due: NOW + 3 * DAY })
      item('k2', 'c1', { due: NOW + 2 * DAY })
      for (const id of ['k1', 'k2']) {
        attempt(id, 'c1', DAY_START - 3600_000)
        attempt(id, 'c1', DAY_START + 3600_000)
      }
      // Answered only today (first sight) or only before today: neither is a cleared review.
      item('n1', 'c1', { due: NOW + 5 * DAY })
      attempt('n1', 'c1', DAY_START + 7200_000)
      item('o1', 'c1', { due: NOW + 6 * DAY })
      attempt('o1', 'c1', DAY_START - 7200_000)
      const { topic, plan } = await getToday()
      expect(topic?.due).toBe(4)
      expect(plan).toMatchObject({ reviewsLeft: 4, reviewsCleared: 2, nextReviewAt: NOW + 2 * DAY, state: 'normal' })
    })

    it('caps reviews left at 8', async () => {
      personal()
      basics()
      for (let i = 0; i < 11; i++) item(`d${i}`, 'c1', { due: NOW - 1000 })
      const { topic, plan } = await getToday()
      expect(topic?.due).toBe(11)
      expect(plan?.reviewsLeft).toBe(8)
    })

    it('leaves short answers a role session cannot serve out of due and next review', async () => {
      role()
      unit('un1', 0)
      concept('c1', 'un1')
      place()
      item('d1', 'c1', { due: NOW - 1000 })
      item('s1', 'c1', { format: 'short', due: NOW - 1000 })
      item('s2', 'c1', { format: 'short', due: NOW + DAY })
      item('k1', 'c1', { due: NOW + 2 * DAY })
      const { topic, plan } = await getToday()
      expect(topic?.due).toBe(1)
      expect(plan).toMatchObject({ reviewsLeft: 1, nextReviewAt: NOW + 2 * DAY })
    })

    it('has no next review when nothing is scheduled in the future', async () => {
      personal()
      unit('un1', 0)
      concept('c1', 'un1')
      item('i1', 'c1', { due: NOW - 1 })
      item('i2', 'c1', { due: NOW + 9 * DAY, status: 'retired' })
      expect((await getToday()).plan?.nextReviewAt).toBeNull()
    })
  })

  describe('session of the day', () => {
    it.each([
      ['a 10-answer session ended today', 'session', DAY_START + 1, 10, true],
      ['a 10-answer placement ended today', 'placement', DAY_START + 1, 10, true],
      ['a 9-answer session ended today', 'session', DAY_START + 1, 9, false],
      ['a 10-answer mini session ended today', 'mini', DAY_START + 1, 10, false],
      ['a 10-answer session ended yesterday', 'session', DAY_START - 1, 10, false],
      ['a 10-answer session still open', 'session', null, 10, false],
    ])('%s', async (_name, kind, endedAt, attempts, done) => {
      personal()
      basics()
      place()
      session('s1', kind, endedAt, attempts)
      expect((await getToday()).plan).toMatchObject({ sessionDone: done, state: done ? 'done' : 'normal' })
    })
  })

  describe('back to basics', () => {
    it.each([
      ['three weak sessions', [3, 3, 3], true, 'basics', 'Unit un2'],
      ['two weak sessions', [3, 3], true, 'normal', 'Unit un1'],
      ['a good recent session', [3, 3, 9], true, 'normal', 'Unit un1'],
      ['three weak sessions with the weak unit locked', [3, 3, 3], false, 'normal', 'Unit un1'],
    ])('%s', async (_name, corrects, un2Unlocked, state, nextUnit) => {
      personal()
      unit('un1', 0)
      unit('un2', 1, un2Unlocked)
      concept('c1', 'un1')
      concept('c2', 'un2')
      item('i1', 'c1')
      item('i2', 'c2')
      learn('c1', 0.8)
      place()
      corrects.forEach((c, i) => session(`s${i}`, 'session', DAY_START - (i + 1) * DAY, 10, c))
      expect((await getToday()).plan).toMatchObject({ start: 'session', state, nextUnit })
    })

    it('skips an unlocked unit whose only document was retired', async () => {
      personal()
      unit('un0', 0)
      unit('un1', 1)
      run('INSERT INTO sources (id, topic_id, kind, title, body_text, retired_at, created_at) VALUES (?, ?, ?, ?, ?, ?, ?)', 'src-old', 't1', 'text', 'Old', 'Old.', 1, 1)
      concept('c0', 'un0')
      run("UPDATE concepts SET source_id = 'src-old' WHERE id = 'c0'")
      concept('c1', 'un1')
      item('i1', 'c1')
      place()
      ;[3, 3, 3].forEach((c, i) => session(`s${i}`, 'session', DAY_START - (i + 1) * DAY, 10, c))
      expect((await getToday()).plan).toMatchObject({ start: 'session', state: 'basics', nextUnit: 'Unit un1' })
    })
  })

  describe('building', () => {
    it.each([
      ['28 of 42 concepts ready', 0, { ready: 28, total: 42 }],
      ['a failed concept left out', 3, { ready: 28, total: 42 }],
    ])('reports %s', async (_name, failed, building) => {
      role()
      unit('un1', 0)
      for (let i = 0; i < 42; i++) concept(`c${i}`, 'un1', i < 28 ? 'ready' : i < 35 ? 'pending' : 'generating')
      for (let i = 0; i < failed; i++) concept(`f${i}`, 'un1', 'failed')
      expect((await getToday()).role?.building).toEqual(building)
    })

    it('is null when no concept is pending or generating', async () => {
      role()
      unit('un1', 0)
      concept('c1', 'un1')
      concept('f1', 'un1', 'failed')
      expect((await getToday()).role?.building).toBeNull()
    })
  })

  describe('role mastery', () => {
    it('averages every concept including unmet ones as zero', async () => {
      role()
      unit('un1', 0)
      concept('c1', 'un1')
      concept('c2', 'un1')
      item('i1', 'c1')
      learn('c1', 0.8)
      attempt('i1', 'c1', NOW - 1000)
      const { role: r, plan } = await getToday()
      expect(plan?.state).toBe('normal')
      expect(r?.mastery).toBeCloseTo(0.4, 10)
    })

    it('leaves concepts of a retired document out of the average', async () => {
      role()
      unit('un1', 0)
      concept('c1', 'un1')
      concept('c2', 'un1')
      run('INSERT INTO sources (id, topic_id, kind, title, body_text, retired_at, created_at) VALUES (?, ?, ?, ?, ?, ?, ?)', 'old', 't1', 'text', 'Old', 'Old.', 1, 1)
      run("UPDATE concepts SET source_id = 'old' WHERE id = 'c2'")
      item('i1', 'c1')
      learn('c1', 0.8)
      attempt('i1', 'c1', NOW - 1000)
      expect((await getToday()).role?.mastery).toBeCloseTo(0.8, 10)
    })
  })

  describe('onboarding day', () => {
    it.each([
      ['over the onboarding length', 100 * DAY, 30, 30],
      ['just assigned', 0, 30, 1],
      ['15.5 days in', 15.5 * DAY, 30, 16],
      ['assigned in the future', -2 * DAY, 30, 1],
    ])('is clamped when %s', async (_name, ago, days, day) => {
      role({ assignedAt: NOW - ago, days })
      expect((await getToday()).role).toMatchObject({ day, days })
    })
  })

  describe('playable', () => {
    it('is false for a placed personal topic with nothing due and an empty frontier', async () => {
      personal()
      place()
      expect((await getToday()).plan).toMatchObject({ start: 'session', playable: false, nextUnit: null })
    })

    it('is false when every unit is locked', async () => {
      personal()
      place()
      unit('un1', 0, false)
      concept('c1', 'un1')
      expect((await getToday()).plan?.playable).toBe(false)
    })

    it('is false when the only frontier concept is already known', async () => {
      personal()
      place()
      basics()
      learn('c1', 0.99)
      expect((await getToday()).plan).toMatchObject({ playable: false, nextUnit: null })
    })

    it('is true for a placed personal topic with a frontier concept', async () => {
      personal()
      place()
      unit('un1', 0)
      concept('c1', 'un1')
      expect((await getToday()).plan).toMatchObject({ playable: true, nextUnit: 'Unit un1' })
    })

    it('is true when something is due even without a frontier', async () => {
      personal()
      place()
      unit('un1', 0, false)
      concept('c1', 'un1')
      item('i1', 'c1', { due: NOW - 1 })
      expect((await getToday()).plan).toMatchObject({ playable: true, reviewsLeft: 1 })
    })

    it('takes the first unlocked unit by order as the next unit', async () => {
      personal()
      place()
      unit('un2', 2)
      unit('un1', 1)
      concept('c2', 'un2')
      concept('c1', 'un1')
      expect((await getToday()).plan?.nextUnit).toBe('Unit un1')
    })

    it.each([
      ['in the fourth frontier concept', 4, 'cloze', true],
      ['only in the fifth frontier concept', 5, 'cloze', false],
      ['only as a short-answer item in the first concept', 1, 'short', false],
    ])('for a placed role topic with an item %s', async (_name, position, format, playable) => {
      role()
      place()
      unit('un1', 0)
      for (let i = 1; i <= 5; i++) concept(`c${i}`, 'un1')
      item('y', `c${position}`, { format })
      expect((await getToday()).plan?.playable).toBe(playable)
    })

    it('is true for an unplaced placeable topic', async () => {
      role()
      basics()
      expect((await getToday()).plan).toMatchObject({ start: 'placement', playable: true })
    })
  })
})
