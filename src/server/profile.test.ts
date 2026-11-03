import { readFileSync, readdirSync } from 'node:fs'
import { DatabaseSync } from 'node:sqlite'
import { drizzle } from 'drizzle-orm/sqlite-proxy'
import { afterAll, afterEach, beforeAll, beforeEach, expect, it, vi } from 'vitest'
import { getProfile } from './profile'

// Fake only the transport, request auth and Cloudflare database binding. Both
// authorization helpers, the profile handler and its SQL run for real.
const holder = vi.hoisted(() => ({ db: null as unknown, user: null as { id: string; name: string; isAnonymous: boolean } | null }))
vi.mock('@/db', () => ({ getDb: () => holder.db }))
vi.mock('@/server/env', () => ({}))
vi.mock('@/server/auth', () => ({ getAuth: () => ({ api: { getSession: async () => holder.user ? { user: holder.user } : null } }) }))
vi.mock('@tanstack/react-start/server', () => ({ getRequestHeaders: () => new Headers() }))
vi.mock('@tanstack/react-start', () => ({
  createServerFn: () => ({ validator: (schema: { parse: (data: unknown) => unknown }) => ({
    handler: (fn: (input: { data: unknown }) => unknown) => (input: { data: unknown }) => fn({ data: schema.parse(input.data) }),
  }) }),
}))

const DAY = 86_400_000
const start = Date.UTC(2026, 10, 2)
const now = start + 6 * DAY + DAY / 2
let raw: DatabaseSync

beforeAll(() => {
  raw = new DatabaseSync(':memory:')
  for (const file of readdirSync('drizzle').filter((f) => f.endsWith('.sql')).sort()) {
    raw.exec(readFileSync(`drizzle/${file}`, 'utf8').replaceAll('--> statement-breakpoint', ''))
  }
  holder.db = drizzle(async (sql, params, method) => {
    const stmt = raw.prepare(sql)
    stmt.setReturnArrays(true)
    return { rows: (method === 'get' ? stmt.get(...params) : stmt.all(...params)) as never }
  })
  for (const id of ['admin-a', 'learner-a', 'colleague-a', 'learner-b', 'new-learner']) {
    raw.prepare('INSERT INTO user (id, name, email) VALUES (?, ?, ?)').run(id, id, `${id}@example.test`)
  }
  for (const org of ['a', 'b']) {
    raw.prepare('INSERT INTO organization (id, name, slug, created_at) VALUES (?, ?, ?, ?)').run(`org-${org}`, org, `company-${org}`, start)
  }
  for (const [id, org, role] of [['admin-a', 'a', 'admin'], ['learner-a', 'a', 'member'], ['colleague-a', 'a', 'member'], ['learner-b', 'b', 'member']]) {
    raw.prepare('INSERT INTO member (id, organization_id, user_id, role, created_at) VALUES (?, ?, ?, ?, ?)').run(id, `org-${org}`, id, role, start)
  }
})

beforeEach(() => {
  raw.exec('BEGIN')
  vi.useFakeTimers({ toFake: ['Date'] })
  vi.setSystemTime(now)
  holder.user = { id: 'learner-a', name: 'Learner A', isAnonymous: false }
})
afterEach(() => { raw.exec('ROLLBACK'); vi.useRealTimers() })
afterAll(() => raw.close())

function seedWeek() {
  const topic = raw.prepare('INSERT INTO topics (id, learner_id, title, status, created_at) VALUES (?, ?, ?, ?, ?)')
  topic.run('old', 'learner-a', 'Old topic', 'ready', start - DAY)
  topic.run('training', 'learner-a', 'Workplace safety', 'ready', start)
  topic.run('generating', 'learner-a', 'Not ready', 'generating', now)
  topic.run('private', 'learner-b', 'Private topic', 'ready', now)
  for (const [id, order, name] of [['basics', 0, 'Foundations'], ['practice', 1, 'In practice']] as const) {
    raw.prepare('INSERT INTO units (id, topic_id, "order", name) VALUES (?, ?, ?, ?)').run(id, 'training', order, name)
  }
  for (const [id, unit, name, critical, mastery] of [['c1', 'basics', 'Emergency exits', 1, 0.8], ['c2', 'practice', 'Reporting hazards', 0, 0.7]] as const) {
    raw.prepare('INSERT INTO concepts (id, topic_id, unit_id, "order", name, summary, critical) VALUES (?, ?, ?, ?, ?, ?, ?)').run(id, 'training', unit, 0, name, '', critical)
    raw.prepare('INSERT INTO learner_concept (learner_id, concept_id, p_known, updated_at) VALUES (?, ?, ?, ?)').run('learner-a', id, mastery, now)
  }
  const progression = [
    ['c1', 'i1', false, 'sure', 0.2, 0.4],
    ['c1', 'i1', true, 'sure', 0.4, 0.5],
    ['c2', 'i2', false, 'guess', 0.2, 0.35],
    ['c2', 'i2', true, 'unsure', 0.35, 0.5],
    ['c1', 'i3', false, 'sure', 0.5, 0.7],
    ['c1', 'i4', true, 'sure', 0.7, 0.8],
    ['c2', 'i2', true, 'unsure', 0.5, 0.7],
  ] as const
  for (const [day, [concept, item, correct, confidence, before, after]] of progression.entries()) {
    const at = start + day * DAY + 3600_000
    raw.prepare('INSERT INTO attempts (id, learner_id, session_id, item_id, concept_id, at, answer_json, correct, score, confidence, response_ms, rating, p_known_before, p_known_after) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)')
      .run(`a${day}`, 'learner-a', `s${day}`, item, concept, at, '"answer"', Number(correct), Number(correct), confidence, 1000, 3, before, after)
    raw.prepare('INSERT INTO sessions (id, learner_id, topic_id, kind, started_at, ended_at) VALUES (?, ?, ?, ?, ?, ?)').run(`s${day}`, 'learner-a', 'training', 'session', at, at + 1000)
  }
  raw.exec(`INSERT INTO sessions (id, learner_id, topic_id, kind, started_at) VALUES ('open', 'learner-a', 'training', 'session', ${now});
    INSERT INTO sessions (id, learner_id, topic_id, kind, started_at, ended_at) VALUES ('foreign', 'learner-b', 'training', 'session', ${start}, ${now});
    INSERT INTO attempts (id, learner_id, item_id, concept_id, at, answer_json, correct, score, confidence, response_ms, rating, p_known_before, p_known_after)
      VALUES ('foreign', 'learner-b', 'i3', 'c1', ${now}, '"answer"', 1, 1, 'sure', 1000, 3, 0.7, 1);`)
}

it.each([
  ['learner-a', { org: 'company-a', learnerId: 'colleague-a' }, 403],
  ['learner-a', { org: 'company-b', learnerId: 'learner-b' }, 403],
  ['admin-a', { org: 'company-a', learnerId: 'learner-b' }, 403],
  ['admin-a', { org: 'company-b', learnerId: 'learner-b' }, 403],
  [null, {}, 401],
])('isolates profiles: %s requesting %j is refused with %s', async (actor, data, status) => {
  holder.user = actor ? { id: actor, name: actor, isAnonymous: false } : null
  await expect(getProfile({ data })).rejects.toMatchObject({ status })
})

it('returns the latest ready topic and a week of the caller’s own mastery, corrections and completed sessions', async () => {
  seedWeek()
  const profile = await getProfile({ data: {} })
  expect(profile.topic).toEqual({ id: 'training', title: 'Workplace safety' })
  expect(profile.benchmark).toBe(0.85)
  expect(profile.units.map((u) => [u.name, u.concepts.map((c) => [c.name, c.pKnown, c.critical])])).toEqual([
    ['Foundations', [['Emergency exits', 0.8, true]]], ['In practice', [['Reporting hazards', 0.7, false]]],
  ])
  expect(profile.weekly.map((d) => Math.round(d.mastery * 1000))).toEqual([300, 350, 425, 500, 600, 650, 750])
  expect(profile.weekly.map((d) => [d.attempts, d.sessions])).toEqual(Array.from({ length: 7 }, () => [1, 1]))
  expect(profile.sessionCounts).toEqual({ week: 7, total: 7 })
  expect(profile.confidentErrors).toEqual([
    { id: 'a4', conceptId: 'c1', concept: 'Emergency exits', at: start + 4 * DAY + 3600_000, correctedAt: null },
    { id: 'a0', conceptId: 'c1', concept: 'Emergency exits', at: start + 3600_000, correctedAt: start + DAY + 3600_000 },
  ])
  expect(profile.proficiency).toEqual({ achievedAt: null, days: null, estimatedDays: 2, projectedAt: now + 2 * DAY })
  holder.user = { id: 'admin-a', name: 'Admin', isAnonymous: false }
  expect(await getProfile({ data: { org: 'company-a', learnerId: 'learner-a' } })).toEqual(profile)
})

it('uses the assigned role benchmark and recorded time to proficiency', async () => {
  seedWeek()
  raw.prepare('INSERT INTO job_roles (id, org_id, name, benchmark, created_at) VALUES (?, ?, ?, ?, ?)').run('role', 'org-a', 'Safety officer', 0.95, start)
  raw.prepare('INSERT INTO member_role_assignments (user_id, org_id, job_role_id, assigned_at) VALUES (?, ?, ?, ?)').run('learner-a', 'org-a', 'role', start)
  const profile = await getProfile({ data: {} })
  expect(profile.role).toBe('Safety officer')
  expect(profile.benchmark).toBe(0.95)
  expect(profile.proficiency.estimatedDays).toBe(3)
  raw.prepare('UPDATE member_role_assignments SET proficient_at = ?').run(start + 3 * DAY)
  expect((await getProfile({ data: {} })).proficiency).toEqual({ achievedAt: start + 3 * DAY, days: 3, estimatedDays: null, projectedAt: null })
})

it('uses a ready role curriculum and falls back to the latest personal topic while it is a draft', async () => {
  seedWeek()
  raw.prepare('INSERT INTO job_roles (id, org_id, name, benchmark, created_at) VALUES (?, ?, ?, ?, ?)').run('role', 'org-a', 'Safety officer', 0.95, start)
  raw.prepare('INSERT INTO member_role_assignments (user_id, org_id, job_role_id, assigned_at) VALUES (?, ?, ?, ?)').run('learner-a', 'org-a', 'role', start)
  raw.exec("UPDATE topics SET learner_id = NULL, job_role_id = 'role', status = 'draft' WHERE id = 'training'")
  expect((await getProfile({ data: {} })).topic).toEqual({ id: 'old', title: 'Old topic' })
  raw.exec("UPDATE topics SET status = 'ready' WHERE id = 'training'")
  const profile = await getProfile({ data: {} })
  expect(profile.topic).toEqual({ id: 'training', title: 'Workplace safety' })
  expect(profile.benchmark).toBe(0.95)
  expect(profile.units[0].concepts[0]).toMatchObject({ name: 'Emergency exits', pKnown: 0.8, critical: true })
  expect(profile.sessionCounts).toEqual({ week: 7, total: 7 })
  holder.user = { id: 'admin-a', name: 'Admin', isAnonymous: false }
  expect(await getProfile({ data: { org: 'company-a', learnerId: 'learner-a' } })).toEqual(profile)
})

it.each(['recent attempts', 'older attempts', 'no attempts', 'later lapse'])('recognizes mastery at role start with %s', async (history) => {
  seedWeek()
  raw.exec("UPDATE learner_concept SET p_known = 0.9; UPDATE attempts SET p_known_after = 0.9 WHERE id IN ('a5', 'a6')")
  const assignedAt = now - 3600_000
  if (history === 'older attempts') {
    raw.prepare('UPDATE topics SET created_at = created_at - ?').run(7 * DAY)
    raw.prepare('UPDATE attempts SET at = at - ?').run(7 * DAY)
  } else if (history === 'no attempts') {
    raw.exec('DELETE FROM attempts')
  } else if (history === 'later lapse') {
    raw.prepare('INSERT INTO attempts (id, learner_id, item_id, concept_id, at, answer_json, correct, score, confidence, response_ms, rating, p_known_before, p_known_after) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)')
      .run('lapse', 'learner-a', 'i2', 'c2', now, '"answer"', 0, 0, 'sure', 1000, 1, 0.9, 0.2)
    raw.exec("UPDATE learner_concept SET p_known = 0.2 WHERE concept_id = 'c2'")
  }
  raw.prepare('INSERT INTO job_roles (id, org_id, name, benchmark, created_at) VALUES (?, ?, ?, ?, ?)').run('role', 'org-a', 'Safety officer', 0.85, start)
  raw.prepare('INSERT INTO member_role_assignments (user_id, org_id, job_role_id, assigned_at) VALUES (?, ?, ?, ?)').run('learner-a', 'org-a', 'role', start)
  // A later invitation can move the assignment past existing mastery.
  raw.prepare('UPDATE member_role_assignments SET assigned_at = ?').run(assignedAt)
  expect((await getProfile({ data: {} })).proficiency).toEqual({ achievedAt: assignedAt, days: 0, estimatedDays: null, projectedAt: null })
})

it('requires proficiency at role start rather than an earlier mastery that was lost', async () => {
  seedWeek()
  raw.exec("UPDATE learner_concept SET p_known = 0.9; UPDATE attempts SET p_known_after = 0.9 WHERE id IN ('a5', 'a6')")
  raw.prepare('INSERT INTO attempts (id, learner_id, item_id, concept_id, at, answer_json, correct, score, confidence, response_ms, rating, p_known_before, p_known_after) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)')
    .run('lapse', 'learner-a', 'i2', 'c2', now - 3600_000, '"answer"', 0, 0, 'sure', 1000, 1, 0.9, 0.2)
  raw.exec("UPDATE learner_concept SET p_known = 0.2 WHERE concept_id = 'c2'")
  raw.prepare('INSERT INTO job_roles (id, org_id, name, benchmark, created_at) VALUES (?, ?, ?, ?, ?)').run('role', 'org-a', 'Safety officer', 0.85, start)
  raw.prepare('INSERT INTO member_role_assignments (user_id, org_id, job_role_id, assigned_at) VALUES (?, ?, ?, ?)').run('learner-a', 'org-a', 'role', now)
  expect((await getProfile({ data: {} })).proficiency.achievedAt).toBeNull()
})

it('records proficiency only after every concept meets the benchmark, including unpracticed concepts', async () => {
  seedWeek()
  raw.exec("UPDATE learner_concept SET p_known = 0.9; UPDATE attempts SET p_known_after = 0.9 WHERE id IN ('a5', 'a6')")
  expect((await getProfile({ data: {} })).proficiency).toEqual({ achievedAt: start + 6 * DAY + 3600_000, days: 7, estimatedDays: null, projectedAt: null })
  raw.exec("INSERT INTO concepts (id, topic_id, unit_id, \"order\", name, summary) VALUES ('unseen', 'training', 'practice', 1, 'First aid', '')")
  const profile = await getProfile({ data: {} })
  expect(profile.proficiency.achievedAt).toBeNull()
  expect(profile.units[1].concepts[1]).toMatchObject({ name: 'First aid', pKnown: 0 })
})

it('records role proficiency by mean and critical concepts, and surfaces only critical confident errors', async () => {
  seedWeek()
  raw.exec("UPDATE learner_concept SET p_known = 0.95 WHERE concept_id = 'c1'; UPDATE learner_concept SET p_known = 0.7 WHERE concept_id = 'c2'; UPDATE attempts SET p_known_after = 0.95 WHERE id = 'a5'; UPDATE attempts SET confidence = 'sure' WHERE id = 'a2'")
  raw.prepare('INSERT INTO job_roles (id, org_id, name, benchmark, created_at) VALUES (?, ?, ?, ?, ?)').run('role', 'org-a', 'Safety officer', 0.8, start)
  raw.prepare('INSERT INTO member_role_assignments (user_id, org_id, job_role_id, assigned_at) VALUES (?, ?, ?, ?)').run('learner-a', 'org-a', 'role', start)
  const profile = await getProfile({ data: {} })
  expect(profile.proficiency).toEqual({ achievedAt: start + 6 * DAY + 3600_000, days: 7, estimatedDays: null, projectedAt: null })
  expect(profile.confidentErrors.map((e) => [e.id, e.conceptId])).toEqual([['a4', 'c1'], ['a0', 'c1']])
})

it('has no projection before training and refuses a target without a company', async () => {
  holder.user = { id: 'new-learner', name: 'New learner', isAnonymous: false }
  const profile = await getProfile({ data: {} })
  expect(profile.topic).toBeNull()
  expect(profile.units).toEqual([])
  expect(profile.weekly.map((d) => [d.mastery, d.attempts, d.sessions])).toEqual(Array.from({ length: 7 }, () => [0, 0, 0]))
  expect(profile.proficiency.projectedAt).toBeNull()
  expect(() => getProfile({ data: { learnerId: 'learner-a' } as never })).toThrow()
})
