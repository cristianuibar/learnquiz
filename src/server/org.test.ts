import { readFileSync, readdirSync } from 'node:fs'
import { DatabaseSync } from 'node:sqlite'
import { drizzle } from 'drizzle-orm/sqlite-proxy'
import { afterAll, afterEach, beforeAll, beforeEach, expect, it, vi } from 'vitest'
import { getSessionUser } from '@/server/session'
import { createCompany, createRole, getOrgOverview, getPeople, listRoles } from './org'

const holder = vi.hoisted(() => ({ db: null as unknown, createOrganization: vi.fn() }))

// Fake the request/auth boundaries; keep validation, authorization and SQL real.
vi.mock('@tanstack/react-start', () => ({
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
  const custom = await createRole({ data: { slug: 'alpha', name: 'Team lead', benchmark: 0.9, onboardingDays: 45 } })
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
  sqlite.prepare('INSERT INTO invitation (id, organization_id, email, expires_at, inviter_id, job_role_id, invitee_name) VALUES (?, ?, ?, ?, ?, ?, ?)')
    .run('waiting', 'org-a', 'waiting@x.test', Date.now() + day, 'owner', 'legacy-role', 'Waiting')
  const attempt = sqlite.prepare('INSERT INTO attempts (id, learner_id, item_id, concept_id, at, answer_json, correct, score, confidence, response_ms, rating, p_known_before, p_known_after) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, 1000, 1, 0.5, 0.4)')
  attempt.run('critical-error', 'member', 'scan-item', 'scan', start + day, '"skip scan"', 0, 0, 'sure')
  attempt.run('ordinary-error', 'member', 'pick-item', 'pick', start + day, '"skip ticket"', 0, 0, 'sure')
  attempt.run('foreign-error', 'member', 'foreign-item', 'foreign', start + day, '"skip safety"', 0, 0, 'sure')
  const people = await getPeople({ data: { slug: 'alpha' } })
  expect(people.members).toEqual([
    expect.objectContaining({ name: 'owner', training: null }),
    expect.objectContaining({ name: 'admin', training: { stage: 'proficient', daysToProficiency: 4, criticalConfidentErrors: 0 } }),
    expect.objectContaining({ name: 'member', training: { stage: 'onboarding', daysToProficiency: null, criticalConfidentErrors: 1 } }),
  ])
  expect(people.invites).toEqual([expect.objectContaining({ name: 'Waiting', expired: false })])
  expect(await getOrgOverview({ data: { slug: 'alpha' } })).toMatchObject({ training: { proficientEmployees: 1, daysToProficiency: 4 } })

  attempt.run('corrected', 'member', 'scan-item', 'scan', start + 2 * day, '"scan"', 1, 1, 'sure')
  sqlite.prepare('UPDATE learner_concept SET p_known = 0.5 WHERE learner_id = ? AND concept_id = ?').run('admin', 'scan')
  expect((await getPeople({ data: { slug: 'alpha' } })).members).toEqual([
    expect.objectContaining({ name: 'owner', training: null }),
    expect.objectContaining({ name: 'admin', training: { stage: 'onboarding', daysToProficiency: null, criticalConfidentErrors: 0 } }),
    expect.objectContaining({ name: 'member', training: { stage: 'onboarding', daysToProficiency: null, criticalConfidentErrors: 0 } }),
  ])
  expect(await getOrgOverview({ data: { slug: 'alpha' } })).toMatchObject({ training: { proficientEmployees: 0, daysToProficiency: null } })
})

it('rolls back the role when its draft topic cannot be stored', async () => {
  sqlite.exec("CREATE TEMP TRIGGER reject_topic BEFORE INSERT ON topics WHEN NEW.title = 'Unavailable' BEGIN SELECT RAISE(ABORT, 'Topic unavailable'); END")
  await expect(createRole({ data: { slug: 'alpha', name: 'Unavailable' } })).rejects.toThrow()
  expect(sqlite.prepare('SELECT id FROM job_roles WHERE name = ?').all('Unavailable')).toEqual([])
})
