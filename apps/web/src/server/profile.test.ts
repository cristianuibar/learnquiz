import { readFileSync, readdirSync } from 'node:fs'
import { DatabaseSync } from 'node:sqlite'
import { drizzle } from 'drizzle-orm/sqlite-proxy'
import { afterAll, afterEach, beforeAll, beforeEach, expect, it, vi } from 'vitest'
import { getMemberFlags, getProfile } from './profile'

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
const WEEK = 7 * DAY
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
  ['admin-a', { org: 'company-a', learnerId: 'learner-b' }, 404],
  ['admin-a', { org: 'company-b', learnerId: 'learner-b' }, 403],
  [null, {}, 401],
])('isolates profiles: %s requesting %j is refused with %s', async (actor, data, status) => {
  holder.user = actor ? { id: actor, name: actor, isAnonymous: false } : null
  await expect(getProfile({ data })).rejects.toMatchObject({ status })
})

it.each([
  ['admin-a', { org: 'company-a', learnerId: 'learner-b' }, 404],
  ['learner-a', { org: 'company-a', learnerId: 'learner-a' }, 403],
  ['admin-a', { org: 'company-b', learnerId: 'learner-b' }, 403],
])('refuses member flags: %s requesting %j with %s', async (actor, data, status) => {
  holder.user = { id: actor, name: actor, isAnonymous: false }
  await expect(getMemberFlags({ data })).rejects.toMatchObject({ status })
})

it('lists the person’s flags on this company’s questions only, newest first', async () => {
  for (const [org, role] of [['a', 'role-a'], ['b', 'role-b']]) {
    raw.prepare('INSERT INTO job_roles (id, org_id, name, created_at) VALUES (?, ?, ?, ?)').run(role, `org-${org}`, role, start)
    raw.prepare('INSERT INTO topics (id, org_id, job_role_id, title, status, created_at) VALUES (?, ?, ?, ?, ?, ?)').run(`t-${org}`, `org-${org}`, role, 'T', 'ready', start)
    raw.prepare('INSERT INTO units (id, topic_id, "order", name) VALUES (?, ?, ?, ?)').run(`u-${org}`, `t-${org}`, 0, `Unit ${org}`)
    raw.prepare('INSERT INTO concepts (id, topic_id, unit_id, "order", name, summary) VALUES (?, ?, ?, ?, ?, ?)').run(`c-${org}`, `t-${org}`, `u-${org}`, 0, `Concept ${org}`, '')
    raw.prepare('INSERT INTO items (id, concept_id, topic_id, format, payload_json, created_at) VALUES (?, ?, ?, ?, ?, ?)')
      .run(`item-${org}`, `c-${org}`, `t-${org}`, 'short', JSON.stringify({ stem: `Stem ${org}` }), start)
  }
  const flag = raw.prepare('INSERT INTO item_flags (id, item_id, user_id, reason, note, created_at, resolved_at) VALUES (?, ?, ?, ?, ?, ?, ?)')
  flag.run('f-old', 'item-a', 'learner-a', 'unfair-result', 'Too hard', start + 1, start + 5)
  flag.run('f-new', 'item-a', 'learner-a', 'custom-reason', null, start + 2, null)
  flag.run('f-b', 'item-b', 'learner-a', 'unfair-result', null, start + 3, null)
  flag.run('f-other', 'item-a', 'colleague-a', 'unfair-result', null, start + 4, null)
  holder.user = { id: 'admin-a', name: 'Admin', isAnonymous: false }
  const base = { concept: 'Concept a', unit: 'Unit a', stem: 'Stem a', roleId: 'role-a', itemId: 'item-a' }
  expect(await getMemberFlags({ data: { org: 'company-a', learnerId: 'learner-a' } })).toEqual([
    { ...base, id: 'f-new', label: 'custom-reason', note: null, createdAt: start + 2, resolvedAt: null },
    { ...base, id: 'f-old', label: 'The result seems unfair', note: 'Too hard', createdAt: start + 1, resolvedAt: start + 5 },
  ])
})

it('returns the latest ready topic and a week of the caller’s own mastery, corrections and completed sessions', async () => {
  seedWeek()
  const profile = await getProfile({ data: {} })
  expect(profile.topic).toEqual({ id: 'training', title: 'Workplace safety' })
  expect(profile.benchmark).toBe(0.85)
  expect(profile.units.map((u) => [u.name, u.concepts.map((c) => [c.name, c.pKnown, c.critical])])).toEqual([
    ['Foundations', [['Emergency exits', 0.8, true]]], ['In practice', [['Reporting hazards', 0.7, false]]],
  ])
  expect(profile.weeks).toEqual([{ start, mastery: 0.75, sessions: 7, partial: true }])
  expect(profile.mastery).toBe(0.75)
  expect(profile.started).toBe(true)
  // Both units are practiced below the 0.85 benchmark.
  expect(profile.units.map((u) => [u.mastery, u.state, u.concepts.map((c) => [c.measured, c.status])])).toEqual([
    [0.8, 'learning', [[true, 'learning']]], [0.7, 'learning', [[true, 'learning']]],
  ])
  expect(profile.sessionCounts).toEqual({ week: 7, total: 7 })
  expect(profile.confidentErrors).toEqual([
    { id: 'a4', conceptId: 'c1', concept: 'Emergency exits', at: start + 4 * DAY + 3600_000, correctedAt: null },
    { id: 'a0', conceptId: 'c1', concept: 'Emergency exits', at: start + 3600_000, correctedAt: start + DAY + 3600_000 },
  ])
  expect(profile.proficiency).toEqual({ achievedAt: null, days: null, estimatedDays: 2, projectedAt: now + 2 * DAY })
  holder.user = { id: 'admin-a', name: 'Admin', isAnonymous: false }
  expect(await getProfile({ data: { org: 'company-a', learnerId: 'learner-a' } })).toEqual(profile)
})

it.each([
  ['placed and unlocked', true, true, 'estimate'],
  ['placed but not unlocked', true, false, 'locked'],
  ['not placed', false, false, 'not_started'],
])('leaves an unpracticed unit %s with its concepts not started', async (_name, placed, unlocked, state) => {
  seedWeek()
  raw.exec('DELETE FROM attempts')
  if (placed) raw.prepare('INSERT INTO placements (id, learner_id, topic_id, log_json, created_at) VALUES (?, ?, ?, ?, ?)').run('placement', 'learner-a', 'training', '[]', now)
  if (unlocked) raw.prepare('INSERT INTO learner_unit (learner_id, unit_id, unlocked_at) VALUES (?, ?, ?)').run('learner-a', 'basics', now)
  const profile = await getProfile({ data: {} })
  expect(profile.units[0]).toMatchObject({ state, concepts: [{ measured: false, status: 'not_started' }] })
  expect(profile.weeks).toEqual([])
})

it('reports at most six Monday-aligned UTC weeks with sessions counted by end time and only the running week partial', async () => {
  seedWeek()
  raw.exec('DELETE FROM attempts; DELETE FROM sessions')
  const attempt = raw.prepare('INSERT INTO attempts (id, learner_id, item_id, concept_id, at, answer_json, correct, score, confidence, response_ms, rating, p_known_before, p_known_after) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)')
  // The first attempt is eight weeks back, so the series is capped to the latest six weeks.
  for (const [at, concept, before, after] of [
    [start - 8 * WEEK + 2 * DAY, 'c1', 0.1, 0.3],
    [start - 4 * WEEK + 3 * DAY, 'c1', 0.3, 0.5],
    [start - 2 * WEEK + DAY, 'c2', 0.2, 0.6],
    [start + DAY, 'c1', 0.5, 0.9],
  ] as const) attempt.run(`w${at}`, 'learner-a', `i-${at}`, concept, at, '"answer"', 1, 1, 'sure', 1000, 3, before, after)
  const session = raw.prepare('INSERT INTO sessions (id, learner_id, topic_id, kind, started_at, ended_at) VALUES (?, ?, ?, ?, ?, ?)')
  const endings = [
    start - 8 * WEEK + DAY, // before the first of the six weeks
    start - 5 * WEEK + DAY, start - 4 * WEEK - 1,
    start - 3 * WEEK + 2 * DAY,
    start - 2 * WEEK, start - WEEK - 1, start - WEEK - 2,
    start, start + 6 * DAY, now + 1, // the last is still in the future
  ]
  endings.forEach((endedAt, i) => session.run(`e${i}`, 'learner-a', 'training', 'session', endedAt - 1000, endedAt))
  session.run('never-ended', 'learner-a', 'training', 'session', start, null)

  const check = (profile: Awaited<ReturnType<typeof getProfile>>) => {
    expect(profile.weeks.map((w) => [w.start, Math.round(w.mastery * 1000), w.sessions, w.partial])).toEqual([
      [start - 5 * WEEK, 250, 2, false],
      [start - 4 * WEEK, 350, 0, false],
      [start - 3 * WEEK, 350, 1, false],
      [start - 2 * WEEK, 550, 3, false],
      [start - WEEK, 550, 0, false],
      [start, 750, 2, true],
    ])
    expect(profile.weeks).toHaveLength(6)
    for (const w of profile.weeks) {
      expect(new Date(w.start).getUTCDay()).toBe(1)
      expect(w.start % DAY).toBe(0)
    }
    expect(profile.weeks.filter((w) => w.partial)).toEqual([profile.weeks[5]])
  }
  const profile = await getProfile({ data: {} })
  check(profile)
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

it('ends the proficient trend at the week reached when the recent weeks all come after it', async () => {
  seedWeek()
  raw.prepare('INSERT INTO job_roles (id, org_id, name, benchmark, created_at) VALUES (?, ?, ?, ?, ?)').run('role', 'org-a', 'Safety officer', 0.95, start)
  raw.prepare('INSERT INTO member_role_assignments (user_id, org_id, job_role_id, assigned_at, proficient_at) VALUES (?, ?, ?, ?, ?)').run('learner-a', 'org-a', 'role', start, start + 3 * DAY)
  expect((await getProfile({ data: {} })).reachedWeeks).toEqual([{ start, mastery: 0.75, sessions: 7, partial: true }])
  // Viewed nine weeks later, the six recent weeks start after the date reached.
  vi.setSystemTime(start + 9 * WEEK + 2 * DAY)
  const profile = await getProfile({ data: {} })
  expect(profile.weeks.map((w) => w.start)).toEqual([4, 5, 6, 7, 8, 9].map((k) => start + k * WEEK))
  expect(profile.reachedWeeks).toEqual([{ start, mastery: 0.75, sessions: 7, partial: false }])
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

it('leaves concepts of a retired document out of the profile curriculum and proficiency', async () => {
  seedWeek()
  raw.exec("UPDATE learner_concept SET p_known = 0.9; UPDATE attempts SET p_known_after = 0.9 WHERE id IN ('a5', 'a6')")
  raw.exec(`INSERT INTO sources (id, topic_id, kind, title, body_text, created_at, retired_at) VALUES ('old-doc', 'training', 'text', 'Retired', '', 1, 2);
    INSERT INTO concepts (id, topic_id, unit_id, "order", name, summary, critical, source_id) VALUES ('dead', 'training', 'practice', 1, 'Old rule', '', 1, 'old-doc')`)
  const profile = await getProfile({ data: {} })
  expect(profile.proficiency).toEqual({ achievedAt: start + 6 * DAY + 3600_000, days: 7, estimatedDays: null, projectedAt: null })
  expect(profile.units.flatMap((u) => u.concepts.map((c) => c.name))).toEqual(['Emergency exits', 'Reporting hazards'])
})

it('leaves attempts on retired concepts out of the week chart and the day estimate', async () => {
  seedWeek()
  raw.exec(`INSERT INTO sources (id, topic_id, kind, title, body_text, created_at, retired_at) VALUES ('old-doc', 'training', 'text', 'Retired', '', 1, 2);
    INSERT INTO concepts (id, topic_id, unit_id, "order", name, summary, critical, source_id) VALUES ('dead', 'training', 'practice', 1, 'Old rule', '', 1, 'old-doc')`)
  raw.prepare('INSERT INTO attempts (id, learner_id, item_id, concept_id, at, answer_json, correct, score, confidence, response_ms, rating, p_known_before, p_known_after) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)')
    .run('dead-attempt', 'learner-a', 'i9', 'dead', start + 6 * DAY + 7200_000, '"answer"', 0, 0, 'guess', 1000, 3, 0, 0.2)
  const profile = await getProfile({ data: {} })
  expect(profile.weeks).toEqual([{ start, mastery: 0.75, sessions: 7, partial: true }])
  expect(profile.proficiency).toEqual({ achievedAt: null, days: null, estimatedDays: 2, projectedAt: now + 2 * DAY })
  raw.exec("UPDATE learner_concept SET p_known = 0.9; UPDATE attempts SET p_known_after = 0.9 WHERE id IN ('a5', 'a6')")
  expect((await getProfile({ data: {} })).weeks[0].mastery).toBe(0.9)
})

it('has no projection before training and refuses a target without a company', async () => {
  holder.user = { id: 'new-learner', name: 'New learner', isAnonymous: false }
  const profile = await getProfile({ data: {} })
  expect(profile.topic).toBeNull()
  expect(profile.units).toEqual([])
  expect(profile.started).toBe(false)
  expect(profile.weeks).toEqual([])
  expect(profile.mastery).toBe(0)
  expect(profile.proficiency.projectedAt).toBeNull()
  expect(() => getProfile({ data: { learnerId: 'learner-a' } as never })).toThrow()
})

it('reports whether the learner has started the topic, for the learner and the admin alike', async () => {
  seedWeek()
  raw.exec('DELETE FROM attempts')
  const admin = () => { holder.user = { id: 'admin-a', name: 'Admin', isAnonymous: false }; return getProfile({ data: { org: 'company-a', learnerId: 'learner-a' } }) }
  expect((await getProfile({ data: {} })).started).toBe(false)
  expect((await admin()).started).toBe(false)
  holder.user = { id: 'learner-a', name: 'Learner A', isAnonymous: false }
  raw.prepare('INSERT INTO attempts (id, learner_id, item_id, concept_id, at, answer_json, correct, score, confidence, response_ms, rating, p_known_before, p_known_after) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)')
    .run('first', 'learner-a', 'i1', 'c1', now - 3600_000, '"answer"', 1, 1, 'sure', 1000, 3, 0.2, 0.4)
  expect((await getProfile({ data: {} })).started).toBe(true)
  expect((await admin()).started).toBe(true)
})

it.each([[0, 1], [15, 16], [45, 30]])('reports onboarding for a role assigned %i days ago as day %i of 30, the same to an admin', async (ago, day) => {
  seedWeek()
  raw.prepare('INSERT INTO job_roles (id, org_id, name, benchmark, onboarding_days, created_at) VALUES (?, ?, ?, ?, ?, ?)').run('role', 'org-a', 'Safety officer', 0.85, 30, start)
  raw.prepare('INSERT INTO member_role_assignments (user_id, org_id, job_role_id, assigned_at) VALUES (?, ?, ?, ?)').run('learner-a', 'org-a', 'role', now - ago * DAY)
  const profile = await getProfile({ data: {} })
  expect(profile.onboarding).toEqual({ day, days: 30 })
  holder.user = { id: 'admin-a', name: 'Admin', isAnonymous: false }
  expect((await getProfile({ data: { org: 'company-a', learnerId: 'learner-a' } })).onboarding).toEqual({ day, days: 30 })
})

it('has no onboarding for a personal topic', async () => {
  seedWeek()
  expect((await getProfile({ data: {} })).onboarding).toBeNull()
})
