import { readFileSync, readdirSync } from 'node:fs'
import { DatabaseSync } from 'node:sqlite'
import { drizzle } from 'drizzle-orm/sqlite-proxy'
import { afterAll, afterEach, beforeAll, beforeEach, expect, it, vi } from 'vitest'
import { errorMessage, fieldErrors } from '@/components/inline-error'
import { getSessionUser } from '@/server/session'
import { createCompany, createRole, getOrgOverview, listRoles } from './org'
import { getPeople } from '@/server/people'

const holder = vi.hoisted(() => ({ db: null as unknown, createOrganization: vi.fn() }))

// Fake the request/auth boundaries; keep validation, authorization and SQL real.
vi.mock('@tanstack/react-start', () => ({
  createServerOnlyFn: (fn: unknown) => fn,
  createServerFn: () => ({
    validator: (schema: { parse: (data: unknown) => unknown }) => ({
      handler: (fn: (input: { data: unknown }) => unknown) => (input: { data: unknown }) => fn({ data: schema.parse(input.data) }),
    }),
  }),
}))
vi.mock('@tanstack/react-start/server', () => ({ getRequestHeaders: () => new Headers() }))
vi.mock('@/db', () => ({ getDb: () => holder.db }))
vi.mock('@/server/session', () => ({ getSessionUser: vi.fn() }))
vi.mock('@/server/auth', () => ({ getAuth: () => ({ api: { createOrganization: holder.createOrganization } }) }))
vi.mock('@/server/env', () => ({ getEnv: () => ({ BETTER_AUTH_URL: 'http://127.0.0.1:8800' }) }))

let sqlite: DatabaseSync

beforeAll(() => {
  sqlite = new DatabaseSync(':memory:')
  sqlite.exec('PRAGMA foreign_keys = ON')
  for (const file of readdirSync('drizzle').filter((f) => f.endsWith('.sql')).sort()) {
    if (file === '0005_job_role_topics.sql') {
      for (const id of ['owner', 'admin', 'member', 'other-owner']) {
        sqlite.prepare('INSERT INTO user (id, name, email) VALUES (?, ?, ?)').run(id, id, `${id}@x.test`)
      }
      for (const [id, name, slug] of [['org-a', 'Alpha', 'alpha'], ['org-b', 'Beta', 'beta']]) {
        sqlite.prepare('INSERT INTO organization (id, name, slug, created_at) VALUES (?, ?, ?, ?)').run(id, name, slug, 1)
      }
      for (const [id, org, role] of [['owner', 'org-a', 'owner'], ['admin', 'org-a', 'admin'], ['member', 'org-a', 'member'], ['other-owner', 'org-b', 'owner']]) {
        sqlite.prepare('INSERT INTO member (id, organization_id, user_id, role, created_at) VALUES (?, ?, ?, ?, ?)').run(id, org, id, role, 1)
      }
      for (const [id, org, name] of [['legacy-role', 'org-a', 'Original role'], ['other-role', 'org-b', 'Private role']]) {
        sqlite.prepare('INSERT INTO job_roles (id, org_id, name, created_at) VALUES (?, ?, ?, ?)').run(id, org, name, 1)
      }
      sqlite.prepare('INSERT INTO topics (id, learner_id, title, status, generated_by, created_at) VALUES (?, ?, ?, ?, ?, ?)').run('personal', 'owner', 'Algebra', 'ready', 'muse-spark-1.3', 1)
    }
    sqlite.exec(readFileSync(`drizzle/${file}`, 'utf8').replaceAll('--> statement-breakpoint', ''))
  }
  const query = (sql: string, params: unknown[], method: string) => {
    const stmt = sqlite.prepare(sql)
    stmt.setReturnArrays(true)
    const args = params as (string | number | null)[]
    if (method === 'run') {
      stmt.run(...args)
      return { rows: [] }
    }
    return { rows: (method === 'get' ? stmt.get(...args) : stmt.all(...args)) as never }
  }
  holder.db = drizzle(
    async (sql, params, method) => query(sql, params, method),
    async (batch) => {
      sqlite.exec('SAVEPOINT batch')
      try {
        const result = batch.map((q) => query(q.sql, q.params, q.method))
        sqlite.exec('RELEASE batch')
        return result
      } catch (error) {
        sqlite.exec('ROLLBACK TO batch; RELEASE batch')
        throw error
      }
    },
  )
})

beforeEach(() => {
  sqlite.exec('BEGIN')
  vi.mocked(getSessionUser).mockResolvedValue({ id: 'owner', isAnonymous: false } as never)
  holder.createOrganization.mockImplementation(async ({ body }: { body: { name: string; slug: string } }) => {
    sqlite.prepare('INSERT INTO organization (id, name, slug, created_at) VALUES (?, ?, ?, ?)').run('new-org', body.name, body.slug, 1)
    sqlite.prepare('INSERT INTO member (id, organization_id, user_id, role, created_at) VALUES (?, ?, ?, ?, ?)').run('new-owner', 'new-org', 'owner', 'owner', 1)
    return { id: 'new-org', ...body }
  })
})

afterEach(() => sqlite.exec('ROLLBACK'))
afterAll(() => sqlite.close())

it('creates the first company role with exactly one draft topic', async () => {
  await expect(createCompany({ data: { name: 'New company', roleName: 'Support specialist' } })).resolves.toEqual({ slug: 'new-company' })
  const role = sqlite.prepare('SELECT * FROM job_roles WHERE org_id = ?').get('new-org')!
  expect(role).toMatchObject({ name: 'Support specialist', benchmark: 0.85, onboarding_days: 30 })
  expect(sqlite.prepare('SELECT * FROM topics WHERE title = ?').all('Support specialist')).toEqual([
    expect.objectContaining({ org_id: 'new-org', job_role_id: role.id, learner_id: null, title: 'Support specialist', status: 'draft' }),
  ])
})

it('backfills one draft topic per existing role and preserves personal topics', async () => {
  const org = await listRoles({ data: { slug: 'alpha' } })
  expect(org.roles).toEqual([
    expect.objectContaining({ id: 'legacy-role', name: 'Original role', benchmark: 0.85, onboardingDays: 30, topicStatus: 'draft' }),
  ])
  expect(sqlite.prepare('SELECT org_id, job_role_id, learner_id, title, status FROM topics WHERE job_role_id IS NOT NULL ORDER BY job_role_id').all()).toEqual([
    { org_id: 'org-a', job_role_id: 'legacy-role', learner_id: null, title: 'Original role', status: 'draft' },
    { org_id: 'org-b', job_role_id: 'other-role', learner_id: null, title: 'Private role', status: 'draft' },
  ])
  expect(sqlite.prepare('SELECT * FROM topics WHERE id = ?').get('personal')).toMatchObject({ learner_id: 'owner', org_id: null, job_role_id: null, title: 'Algebra', status: 'ready', generated_by: 'muse-spark-1.3', created_at: 1 })
})

it.each(['owner', 'admin'])('%s creates and lists roles with defaults or custom targets in their own company', async (id) => {
  vi.mocked(getSessionUser).mockResolvedValue({ id } as never)
  const role = await createRole({ data: { slug: 'alpha', name: 'Support specialist' } })
  const custom = await createRole({ data: { slug: 'alpha', name: 'Team lead', benchmark: 90, onboardingDays: 45 } })
  const org = await listRoles({ data: { slug: 'alpha' } })
  expect(org).toMatchObject({ name: 'Alpha', slug: 'alpha' })
  expect(org.roles).toHaveLength(3)
  expect(org.roles).toEqual(expect.arrayContaining([
    expect.objectContaining({ id: role.id, name: 'Support specialist', benchmark: 0.85, onboardingDays: 30, topicStatus: 'draft' }),
    expect.objectContaining({ id: custom.id, name: 'Team lead', benchmark: 0.9, onboardingDays: 45, topicStatus: 'draft' }),
  ]))
  expect(sqlite.prepare('SELECT job_role_id, learner_id, status FROM topics WHERE job_role_id = ?').all(role.id)).toEqual([
    { job_role_id: role.id, learner_id: null, status: 'draft' },
  ])
  expect(() => sqlite.prepare('INSERT INTO topics (id, job_role_id, title, status, created_at) VALUES (?, ?, ?, ?, ?)').run('duplicate', role.id, 'Duplicate', 'draft', 1)).toThrow(/UNIQUE/)
})

it.each([
  ['member', 403],
  ['other-owner', 403],
  [null, 401],
] as const)('refuses company functions for %s with %s without writing a role', async (id, status) => {
  vi.mocked(getSessionUser).mockResolvedValue(id ? { id } as never : null)
  await expect.soft(listRoles({ data: { slug: 'alpha' } })).rejects.toMatchObject({ status })
  await expect.soft(createRole({ data: { slug: 'alpha', name: 'Unauthorized role' } })).rejects.toMatchObject({ status })
  await expect.soft(getPeople({ data: { slug: 'alpha' } })).rejects.toMatchObject({ status })
  await expect.soft(getOrgOverview({ data: { slug: 'alpha' } })).rejects.toMatchObject({ status })
  expect(sqlite.prepare('SELECT id FROM job_roles WHERE name = ?').all('Unauthorized role')).toEqual([])
})

it('reports assigned training stages, unresolved critical errors and company proficiency days', async () => {
  const day = 86_400_000
  const start = Date.now() - 10 * day
  sqlite.prepare("UPDATE topics SET status = 'ready' WHERE job_role_id IN ('legacy-role', 'other-role')").run()
  const topic = sqlite.prepare('SELECT id FROM topics WHERE job_role_id = ?').get('legacy-role')!.id as string
  const foreignTopic = sqlite.prepare('SELECT id FROM topics WHERE job_role_id = ?').get('other-role')!.id as string
  const assignment = sqlite.prepare('INSERT INTO member_role_assignments (user_id, org_id, job_role_id, assigned_at, proficient_at) VALUES (?, ?, ?, ?, ?)')
  assignment.run('member', 'org-a', 'legacy-role', start, null)
  assignment.run('admin', 'org-a', 'legacy-role', start, start + 4 * day)
  assignment.run('other-owner', 'org-b', 'other-role', start, start + day)
  const concept = sqlite.prepare('INSERT INTO concepts (id, topic_id, unit_id, "order", name, summary, critical) VALUES (?, ?, ?, 0, ?, ?, ?)')
  concept.run('scan', topic, 'warehouse', 'Scan each item', 'Scan each item.', 1)
  concept.run('pick', topic, 'warehouse', 'Read the pick ticket', 'Read the pick ticket.', 0)
  concept.run('foreign', foreignTopic, 'other-unit', 'Other company safety', 'Other company safety.', 1)
  concept.run('extra', topic, 'warehouse', 'Label returns', 'Label returns.', 0)
  const known = sqlite.prepare('INSERT INTO learner_concept (learner_id, concept_id, p_known, updated_at) VALUES (?, ?, ?, ?)')
  known.run('member', 'scan', 0.4, start)
  for (const id of ['scan', 'pick']) known.run('admin', id, 0.95, start + 4 * day)
  known.run('admin', 'extra', 0.8, start + 4 * day) // below benchmark, but mean and critical concepts meet it
  known.run('other-owner', 'foreign', 0.99, start + day)
  sqlite.prepare('INSERT INTO invitation (id, organization_id, email, expires_at, created_at, inviter_id, job_role_id, invitee_name) VALUES (?, ?, ?, ?, ?, ?, ?, ?)')
    .run('waiting', 'org-a', 'waiting@x.test', start + 20 * day, start + 5 * day, 'owner', 'legacy-role', 'Waiting')
  const attempt = sqlite.prepare('INSERT INTO attempts (id, learner_id, item_id, concept_id, at, answer_json, correct, score, confidence, response_ms, rating, p_known_before, p_known_after) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, 1000, 1, 0.5, 0.4)')
  attempt.run('critical-error', 'member', 'scan-item', 'scan', start + day, '"skip scan"', 0, 0, 'sure')
  attempt.run('ordinary-error', 'member', 'pick-item', 'pick', start + day, '"skip ticket"', 0, 0, 'sure')
  attempt.run('foreign-error', 'member', 'foreign-item', 'foreign', start + day, '"skip safety"', 0, 0, 'sure')
  const session = sqlite.prepare('INSERT INTO sessions (id, learner_id, topic_id, kind, started_at) VALUES (?, ?, ?, ?, ?)')
  const now = Date.now()
  session.run('s-old', 'member', topic, 'session', now - 3 * day)
  session.run('s-new', 'member', topic, 'session', now - day)
  session.run('s-foreign', 'admin', foreignTopic, 'session', now - 100)
  session.run('s-personal', 'admin', 'personal', 'session', now - 50)
  attempt.run('week-critical', 'member', 'scan-item-2', 'scan', now - day, '"x"', 0, 0, 'unsure')
  attempt.run('week-ordinary', 'member', 'pick-item-2', 'pick', now - day, '"x"', 0, 0, 'sure')
  attempt.run('old-critical', 'member', 'scan-item-3', 'scan', now - 8 * day, '"x"', 0, 0, 'sure')
  const waiting = { kind: 'invite', invitationId: 'waiting', name: 'Waiting', email: 'waiting@x.test', jobRole: 'Original role', jobRoleId: 'legacy-role', status: 'invited', invitedAt: start + 5 * day, expiresAt: start + 20 * day }
  expect((await getPeople({ data: { slug: 'alpha' } })).people).toEqual([
    { kind: 'member', userId: 'admin', name: 'admin', email: 'admin@x.test', jobRole: 'Original role', status: 'proficient', day: 11, onboardingDays: 30, proficientInDays: 4, lastActiveAt: null, mastery: 90, benchmark: 85, openCriticalErrors: 0 },
    { kind: 'member', userId: 'member', name: 'member', email: 'member@x.test', jobRole: 'Original role', status: 'active', day: 11, onboardingDays: 30, proficientInDays: null, lastActiveAt: now - day, mastery: 13, benchmark: 85, openCriticalErrors: 2 },
    waiting,
  ])
  expect(await getOrgOverview({ data: { slug: 'alpha' } })).toMatchObject({ training: { employees: 3, proficientEmployees: 1, daysToProficiency: 4, criticalErrorsThisWeek: 1, documentsToReview: null } })

  // Expired and accepted invitations are not employees waiting to join.
  sqlite.prepare('INSERT INTO invitation (id, organization_id, email, status, expires_at, inviter_id, job_role_id, invitee_name) VALUES (?, ?, ?, ?, ?, ?, ?, ?)')
    .run('lapsed', 'org-a', 'lapsed@x.test', 'pending', Date.now() - day, 'owner', 'legacy-role', 'Lapsed')
  sqlite.prepare('INSERT INTO invitation (id, organization_id, email, status, expires_at, inviter_id, job_role_id, invitee_name) VALUES (?, ?, ?, ?, ?, ?, ?, ?)')
    .run('joined', 'org-a', 'joined@x.test', 'accepted', Date.now() + day, 'owner', 'legacy-role', 'Joined')
  attempt.run('corrected', 'member', 'scan-item', 'scan', start + 2 * day, '"scan"', 1, 1, 'sure')
  // Mean 0.86 clears the 0.85 benchmark, but the critical concept at 0.60 does not, so progress stays at 0.60 / 0.85.
  sqlite.prepare("UPDATE learner_concept SET p_known = CASE concept_id WHEN 'scan' THEN 0.6 ELSE 0.99 END WHERE learner_id = ?").run('admin')
  const people = (await getPeople({ data: { slug: 'alpha' } })).people
  expect(people).toEqual([
    expect.objectContaining({ kind: 'member', name: 'admin', status: 'active', day: 11, proficientInDays: null, mastery: 86, benchmark: 85, openCriticalErrors: 0 }),
    expect.objectContaining({ kind: 'invite', invitationId: 'lapsed', name: 'Lapsed', status: 'expired', expiresAt: expect.any(Number) }),
    expect.objectContaining({ kind: 'member', name: 'member', status: 'active', day: 11, proficientInDays: null, mastery: 13, benchmark: 85, openCriticalErrors: 1 }),
    expect.objectContaining({ kind: 'invite', invitationId: 'waiting', status: 'invited' }),
  ])
  expect(people.some((p) => p.name === 'owner' || p.name === 'Joined')).toBe(false)
  sqlite.prepare('UPDATE job_roles SET onboarding_days = 5 WHERE id = ?').run('legacy-role')
  expect((await getPeople({ data: { slug: 'alpha' } })).people.filter((p) => p.kind === 'member').map((p) => [p.name, p.day, p.onboardingDays])).toEqual([['admin', 5, 5], ['member', 5, 5]])
  expect(await getOrgOverview({ data: { slug: 'alpha' } })).toMatchObject({ training: { employees: 3, proficientEmployees: 0, daysToProficiency: null, criticalErrorsThisWeek: 1, documentsToReview: null } })
})

it('ignores concepts of a retired document when deciding an employee is proficient', async () => {
  sqlite.prepare("UPDATE topics SET status = 'ready' WHERE job_role_id = 'legacy-role'").run()
  const topic = sqlite.prepare('SELECT id FROM topics WHERE job_role_id = ?').get('legacy-role')!.id as string
  sqlite.prepare('INSERT INTO member_role_assignments (user_id, org_id, job_role_id, assigned_at) VALUES (?, ?, ?, ?)').run('member', 'org-a', 'legacy-role', 1)
  const source = sqlite.prepare("INSERT INTO sources (id, topic_id, kind, title, body_text, created_at, retired_at) VALUES (?, ?, 'text', ?, '', 1, ?)")
  source.run('live-doc', topic, 'Live handbook', null)
  source.run('old-doc', topic, 'Retired handbook', 2)
  const concept = sqlite.prepare('INSERT INTO concepts (id, topic_id, unit_id, "order", name, summary, critical, source_id) VALUES (?, ?, ?, 0, ?, ?, ?, ?)')
  concept.run('live-critical', topic, 'warehouse', 'Scan each item', '', 1, 'live-doc')
  concept.run('live-other', topic, 'warehouse', 'Read the pick ticket', '', 0, 'live-doc')
  concept.run('dead-critical', topic, 'warehouse', 'Old forklift rule', '', 1, 'old-doc')
  const known = sqlite.prepare('INSERT INTO learner_concept (learner_id, concept_id, p_known, updated_at) VALUES (?, ?, ?, 1)')
  known.run('member', 'live-critical', 0.95)
  known.run('member', 'live-other', 0.9)
  // A sure miss on a retired critical concept is no longer an open error, matching the member profile.
  const attempt = sqlite.prepare('INSERT INTO attempts (id, learner_id, item_id, concept_id, at, answer_json, correct, score, confidence, response_ms, rating, p_known_before, p_known_after) VALUES (?, ?, ?, ?, 1, ?, 0, 0, ?, 1000, 1, 0.5, 0.4)')
  attempt.run('dead-error', 'member', 'dead-item', 'dead-critical', '"skip forklift check"', 'sure')
  const people = await getPeople({ data: { slug: 'alpha' } })
  expect(people.people).toEqual([expect.objectContaining({ kind: 'member', name: 'member', status: 'proficient', proficientInDays: null, openCriticalErrors: 0, mastery: 93, benchmark: 85 })])
  expect(await getOrgOverview({ data: { slug: 'alpha' } })).toMatchObject({ training: { employees: 1, proficientEmployees: 1 } })
})

it("returns each member's mastery against their job role benchmark", async () => {
  sqlite.prepare("UPDATE topics SET status = 'ready' WHERE job_role_id = 'legacy-role'").run()
  const topic = sqlite.prepare('SELECT id FROM topics WHERE job_role_id = ?').get('legacy-role')!.id as string
  const assignment = sqlite.prepare('INSERT INTO member_role_assignments (user_id, org_id, job_role_id, assigned_at) VALUES (?, ?, ?, 1)')
  for (const id of ['owner', 'admin', 'member']) assignment.run(id, 'org-a', 'legacy-role')
  const source = sqlite.prepare("INSERT INTO sources (id, topic_id, kind, title, body_text, created_at, retired_at) VALUES (?, ?, 'text', ?, '', 1, ?)")
  source.run('live-doc', topic, 'Live handbook', null)
  source.run('old-doc', topic, 'Retired handbook', 2)
  const concept = sqlite.prepare('INSERT INTO concepts (id, topic_id, unit_id, "order", name, summary, critical, source_id) VALUES (?, ?, ?, 0, ?, ?, 0, ?)')
  for (const id of ['c1', 'c2', 'c3', 'c4', 'c5']) concept.run(id, topic, 'warehouse', id, '', 'live-doc')
  concept.run('dead', topic, 'warehouse', 'Old rule', '', 'old-doc')
  const known = sqlite.prepare('INSERT INTO learner_concept (learner_id, concept_id, p_known, updated_at) VALUES (?, ?, ?, 1)')
  for (const id of ['c1', 'c2', 'c3', 'c4', 'c5']) known.run('admin', id, 1)
  known.run('admin', 'dead', 0) // would pull the mean to 83 if retired concepts counted
  ;[1, 1, 0.5, 0.4, 0.2].forEach((p, i) => known.run('member', `c${i + 1}`, p)) // mean 0.62
  const { people } = await getPeople({ data: { slug: 'alpha' } })
  expect(people.map((p) => p.kind === 'member' ? [p.name, p.mastery, p.benchmark] : null)).toEqual([['admin', 100, 85], ['member', 62, 85], ['owner', 0, 85]])
})

it('rolls back the role when its draft topic cannot be stored', async () => {
  sqlite.exec("CREATE TEMP TRIGGER reject_topic BEFORE INSERT ON topics WHEN NEW.title = 'Unavailable' BEGIN SELECT RAISE(ABORT, 'Topic unavailable'); END")
  await expect(createRole({ data: { slug: 'alpha', name: 'Unavailable' } })).rejects.toThrow()
  expect(sqlite.prepare('SELECT id FROM job_roles WHERE name = ?').all('Unavailable')).toEqual([])
})

it('stores a whole-percentage benchmark as a fraction and rejects decimals as a field error', async () => {
  const role = await createRole({ data: { slug: 'alpha', name: 'Cashier', benchmark: 85 } })
  expect(sqlite.prepare('SELECT benchmark FROM job_roles WHERE id = ?').get(role.id)).toEqual({ benchmark: 0.85 })
  const decimal = await (async () => createRole({ data: { slug: 'alpha', name: 'Decimal', benchmark: 85.5 } }))().catch((e: unknown) => e)
  expect(fieldErrors(decimal)).toEqual({ benchmark: 'Enter a whole percentage from 50 to 100' })
  expect(sqlite.prepare('SELECT id FROM job_roles WHERE name = ?').all('Decimal')).toEqual([])
})

it('turns a whitespace-only role name into a friendly message and per-field error', async () => {
  const role = await (async () => createRole({ data: { slug: 'alpha', name: '   ' } }))().catch((e: unknown) => e)
  expect(errorMessage(role)).toBe('Enter a role name')
  expect(fieldErrors(role)).toEqual({ name: 'Enter a role name' })
  const company = await (async () => createCompany({ data: { name: 'New company', roleName: '   ' } }))().catch((e: unknown) => e)
  expect(errorMessage(company)).toBe('Enter a role name')
  expect(fieldErrors(company)).toEqual({ roleName: 'Enter a role name' })
  expect(sqlite.prepare('SELECT id FROM organization WHERE slug = ?').all('new-company')).toEqual([])
})

it.each([0, 366, 2147483648])('rejects an onboarding period of %s days with a per-field error', async (onboardingDays) => {
  vi.mocked(getSessionUser).mockResolvedValue({ id: 'owner' } as never)
  const role = await (async () => createRole({ data: { slug: 'alpha', name: 'Long onboarding', onboardingDays } }))().catch((e: unknown) => e)
  expect(fieldErrors(role)).toEqual({ onboardingDays: onboardingDays < 1 ? 'Use at least 1 day for the onboarding period' : 'Use at most 365 days for the onboarding period' })
  expect(sqlite.prepare('SELECT id FROM job_roles WHERE name = ?').all('Long onboarding')).toEqual([])
})

it('rejects a role name that matches an existing role after trimming and case folding', async () => {
  await createRole({ data: { slug: 'alpha', name: 'Customer Support' } })
  const duplicate = await (async () => createRole({ data: { slug: 'alpha', name: 'customer support ' } }))().catch((e: unknown) => e)
  expect(duplicate).toMatchObject({ status: 409 })
  expect(fieldErrors(duplicate)).toEqual({ name: 'A role with this name already exists' })
  expect(sqlite.prepare("SELECT name FROM job_roles WHERE lower(trim(name)) = 'customer support'").all()).toEqual([{ name: 'Customer Support' }])
})
