import { readFileSync, readdirSync } from 'node:fs'
import { DatabaseSync } from 'node:sqlite'
import { drizzle } from 'drizzle-orm/sqlite-proxy'
import { afterAll, afterEach, beforeAll, beforeEach, expect, it, vi } from 'vitest'
import { z } from 'zod'
import { dbSchema } from '@/db'
import { getAuth } from '@/server/auth'
import { getSessionUser } from '@/server/session'
import { createRole, getOrgOverview, listRoles } from '@/server/org'
import { getPeople } from '@/server/people'
import { getCompanies, getCompany, getContentFlags, getGenerationJobs, getStaffSession, listUsers, resolveFlag, retryJobConcept, setUserBan } from './admin'

const boundary = vi.hoisted(() => ({ db: null as unknown, headers: new Headers(), status: 200, background: [] as unknown[] }))

// Only the request transport and database binding are replaced. Authorization,
// validation, queries, Better Auth and its admin plugin execute for real.
vi.mock('@tanstack/react-start', () => ({
  createServerOnlyFn: (fn: unknown) => fn,
  createServerFn: () => {
    let validator: z.ZodType | undefined
    const builder = {
      validator: (schema: z.ZodType) => { validator = schema; return builder },
      handler: (handler: (options: { data: unknown }) => unknown) =>
        (options?: { data: unknown }) => handler({ data: validator ? validator.parse(options?.data) : undefined }),
    }
    return builder
  },
}))
vi.mock('@tanstack/react-start/server', () => ({ getRequestHeaders: () => boundary.headers, setCookie: () => {}, setResponseStatus: (status: number) => { boundary.status = status } }))
vi.mock('@/db', async (original) => ({ ...await original<typeof import('@/db')>(), getDb: () => boundary.db }))
vi.mock('@/server/env', () => ({ getEnv: () => ({ BETTER_AUTH_URL: 'http://localhost:3000', BETTER_AUTH_SECRET: 'staff-tests-only-secret-at-least-32-characters' }),
  runInBackground: (task: unknown) => { boundary.background.push(task) },
}))
// The queue itself is covered by concept-gen.test.ts; here only the wake-up is observed.
vi.mock('@/server/concept-gen', () => ({ drainConceptQueue: async () => 'drained' }))

let sqlite: DatabaseSync
const accounts = new Map<string, { id: string; cookie: string; password: string }>()
const NOW = new Date('2026-11-02T12:00:00Z').getTime()

async function authRequest(path: string, body: object, cookie?: string) {
  return getAuth().handler(new Request(`http://localhost:3000/api/auth/${path}`, {
    method: 'POST', headers: { 'content-type': 'application/json', origin: 'http://localhost:3000', ...(cookie ? { cookie } : {}) }, body: JSON.stringify(body),
  }))
}

beforeAll(async () => {
  sqlite = new DatabaseSync(':memory:')
  for (const file of readdirSync('drizzle').filter((file) => file.endsWith('.sql')).sort()) {
    sqlite.exec(readFileSync(`drizzle/${file}`, 'utf8').replaceAll('--> statement-breakpoint', ''))
  }
  boundary.db = drizzle(async (query, params, method) => {
    const statement = sqlite.prepare(query)
    statement.setReturnArrays(true)
    if (method === 'run') { statement.run(...params); return { rows: [] } }
    return { rows: (method === 'get' ? statement.get(...params) : statement.all(...params)) as never }
  }, { schema: dbSchema })

  for (const name of ['staff', 'learner', 'outsider']) {
    const password = crypto.randomUUID()
    const response = await authRequest('sign-up/email', { name, email: `${name}@staff.test`, password })
    expect(response.status).toBe(200)
    const { user } = await response.json() as { user: { id: string } }
    const cookie = response.headers.getSetCookie().map((value) => value.split(';')[0]).join('; ')
    accounts.set(name, { id: user.id, cookie, password })
  }
  sqlite.prepare("UPDATE user SET role = 'admin' WHERE id = ?").run(accounts.get('staff')!.id)
  for (const id of ['alpha', 'beta', 'empty']) {
    sqlite.prepare('INSERT INTO organization (id, name, slug, created_at) VALUES (?, ?, ?, ?)').run(id, id, id, NOW)
  }
  for (const [name, org, role] of [['learner', 'alpha', 'owner'], ['outsider', 'beta', 'member']]) {
    const id = accounts.get(name)!.id
    sqlite.prepare('INSERT INTO member (id, organization_id, user_id, role, created_at) VALUES (?, ?, ?, ?, ?)').run(name, org, id, role, NOW)
    sqlite.prepare('INSERT INTO job_roles (id, org_id, name, created_at) VALUES (?, ?, ?, ?)').run(org, org, `${org} role`, NOW)
    sqlite.prepare('INSERT INTO topics (id, job_role_id, title, status, created_at) VALUES (?, ?, ?, ?, ?)').run(`role-${org}`, org, `${org} role`, 'draft', NOW)
    sqlite.prepare('INSERT INTO member_role_assignments (user_id, org_id, job_role_id, assigned_at) VALUES (?, ?, ?, ?)').run(id, org, org, NOW)
    sqlite.prepare('INSERT INTO topics (id, learner_id, title, created_at) VALUES (?, ?, ?, ?)').run(org, id, `${org} topic`, NOW)
    sqlite.prepare('INSERT INTO sources (id, topic_id, kind, title, body_text, created_at) VALUES (?, ?, ?, ?, ?, ?)').run(org, org, 'text', `${org} document`, 'Private source text', NOW)
    sqlite.prepare('INSERT INTO model_calls (id, learner_id, purpose, model, latency_ms, cost_usd, ok, created_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?)').run(org, id, 'items', 'test', 1, org === 'alpha' ? 0.125 : 9, 1, NOW)
  }
  // Role topics have no learner; only alpha's role has an SOP. Personal documents above are not company documents.
  sqlite.prepare('INSERT INTO sources (id, topic_id, kind, title, body_text, created_at) VALUES (?, ?, ?, ?, ?, ?)').run('alpha-sop', 'role-alpha', 'text', 'alpha SOP', 'Role source text', NOW)
  const learner = accounts.get('learner')!.id
  for (const [id, startedAt] of [['recent', NOW], ['also-recent', NOW], ['old', NOW - 31 * 86_400_000]] as const) {
    sqlite.prepare('INSERT INTO sessions (id, learner_id, topic_id, kind, started_at) VALUES (?, ?, ?, ?, ?)')
      .run(id, id === 'old' ? accounts.get('outsider')!.id : learner, id === 'old' ? 'beta' : 'alpha', 'session', startedAt)
  }
  sqlite.prepare('INSERT INTO invitation (id, organization_id, email, inviter_id, job_role_id, invitee_name, expires_at) VALUES (?, ?, ?, ?, ?, ?, ?)')
    .run('private-invite', 'alpha', 'invitee@staff.test', learner, 'alpha', 'Invitee', NOW + 86_400_000)
})

beforeEach(() => {
  sqlite.exec('BEGIN')
  boundary.headers = new Headers({ cookie: accounts.get('staff')!.cookie })
  vi.useFakeTimers({ toFake: ['Date'] })
  vi.setSystemTime(NOW)
  boundary.background = []
})
afterEach(() => { sqlite.exec('ROLLBACK'); vi.useRealTimers() })
afterAll(() => sqlite.close())

it('refuses every admin function for non-staff, including a company owner', async () => {
  boundary.headers = new Headers({ cookie: accounts.get('learner')!.cookie })
  for (const call of [
    () => getStaffSession(),
    () => getCompanies(),
    () => getCompany({ data: { slug: 'alpha' } }),
    () => listUsers({ data: { search: '', field: 'email', offset: 0 } }),
    () => setUserBan({ data: { userId: accounts.get('outsider')!.id, banned: true } }),
    () => setUserBan({ data: { userId: accounts.get('outsider')!.id, banned: false } }),
    () => getGenerationJobs(),
    () => retryJobConcept({ data: { conceptId: 'x' } }),
    () => getContentFlags(),
    () => resolveFlag({ data: { flagId: 'x' } }),
  ]) {
    boundary.status = 200
    await expect(call()).rejects.toMatchObject({ status: 403, message: 'Staff only' })
    expect(boundary.status).toBe(403)
  }
  boundary.headers = new Headers()
  await expect(getStaffSession()).rejects.toMatchObject({ status: 401 })
})

it('returns company members, roles, documents, distinct active learners and scoped spend for staff', async () => {
  await expect(getStaffSession()).resolves.toMatchObject({ id: accounts.get('staff')!.id })
  await expect(getCompanies()).resolves.toEqual([
    { id: 'alpha', name: 'alpha', slug: 'alpha', members: 1, roles: 1, documents: 1, activeLearners: 1, modelSpend: 0.125 },
    { id: 'beta', name: 'beta', slug: 'beta', members: 1, roles: 1, documents: 0, activeLearners: 0, modelSpend: 9 },
    { id: 'empty', name: 'empty', slug: 'empty', members: 0, roles: 0, documents: 0, activeLearners: 0, modelSpend: 0 },
  ])
  await expect(getCompany({ data: { slug: 'alpha' } })).resolves.toMatchObject({
    members: [{ name: 'learner', role: 'owner', jobRole: 'alpha role' }],
    roles: [{ id: 'alpha', name: 'alpha role', status: 'active', topicStatus: 'draft' }],
    documents: [{ id: 'alpha-sop', title: 'alpha SOP', role: 'alpha role' }],
    activeLearners: 1, modelSpend: 0.125,
  })
  sqlite.prepare('INSERT INTO job_roles (id, org_id, name, created_at) VALUES (?, ?, ?, ?)').run('ready-role', 'empty', 'Ready role', NOW)
  sqlite.prepare('INSERT INTO topics (id, job_role_id, title, status, created_at) VALUES (?, ?, ?, ?, ?)').run('ready-topic', 'ready-role', 'Ready role', 'ready', NOW)
  await expect(getCompany({ data: { slug: 'empty' } })).resolves.toMatchObject({ roles: [{ id: 'ready-role', status: 'active', topicStatus: 'ready' }] })
  await expect(getCompany({ data: { slug: 'beta' } })).resolves.toMatchObject({ documents: [] })
  await expect(getCompany({ data: { slug: 'missing' } })).rejects.toMatchObject({ status: 404 })
})

it('allows staff to read the company portal without invite secrets or company write access', async () => {
  await expect(getOrgOverview({ data: { slug: 'alpha' } })).resolves.toMatchObject({ name: 'alpha', roles: [{ id: 'alpha', name: 'alpha role' }], readOnly: true })
  await expect(getPeople({ data: { slug: 'alpha' } })).resolves.toMatchObject({ readOnly: true, people: [{ kind: 'member', email: 'learner@staff.test' }] })
  await expect(listRoles({ data: { slug: 'alpha' } })).rejects.toMatchObject({ status: 403 })
  await expect(createRole({ data: { slug: 'alpha', name: 'Staff-created role' } })).rejects.toMatchObject({ status: 403 })
  const response = await authRequest('organization/invite-member', {
    organizationId: 'alpha', email: 'another@staff.test', role: 'member', jobRoleId: 'alpha', inviteeName: 'Another',
  }, accounts.get('staff')!.cookie)
  expect(response.status).toBe(400)
  expect(await response.json()).toMatchObject({ code: 'MEMBER_NOT_FOUND' })
  boundary.headers = new Headers({ cookie: accounts.get('learner')!.cookie })
  await expect(getPeople({ data: { slug: 'alpha' } })).resolves.toMatchObject({ readOnly: false, people: expect.arrayContaining([expect.objectContaining({ kind: 'invite', invitationId: 'private-invite' })]) })
  await expect(getOrgOverview({ data: { slug: 'beta' } })).rejects.toMatchObject({ status: 403 })
})

it('gives staff who own a company the full portal for that company', async () => {
  sqlite.prepare('INSERT INTO member (id, organization_id, user_id, role, created_at) VALUES (?, ?, ?, ?, ?)').run('staff-owner', 'alpha', accounts.get('staff')!.id, 'owner', NOW)
  await expect(getPeople({ data: { slug: 'alpha' } })).resolves.toMatchObject({ readOnly: false, people: expect.arrayContaining([expect.objectContaining({ kind: 'invite', invitationId: 'private-invite' })]) })
  await expect(getOrgOverview({ data: { slug: 'alpha' } })).resolves.toMatchObject({ readOnly: false })
  await expect(getPeople({ data: { slug: 'beta' } })).resolves.toMatchObject({ readOnly: true, people: [expect.objectContaining({ kind: 'member', email: 'outsider@staff.test' })] })
})

it('searches users through the admin plugin and bans, revokes sessions, blocks sign-in and unbans', async () => {
  const learner = accounts.get('learner')!
  await expect(listUsers({ data: { search: 'learner@', field: 'email', offset: 0 } })).resolves.toMatchObject({ users: [{ id: learner.id }], total: 1 })
  await expect(listUsers({ data: { search: 'outsider', field: 'name', offset: 0 } })).resolves.toMatchObject({ users: [{ id: accounts.get('outsider')!.id }], total: 1 })
  await expect(listUsers({ data: { search: 'learner@', field: 'email', offset: 25 } })).resolves.toEqual({ users: [], total: 1 })
  sqlite.prepare('INSERT INTO member (id, organization_id, user_id, role, created_at) VALUES (?, ?, ?, ?, ?)').run('learner-beta', 'beta', learner.id, 'member', NOW)
  await setUserBan({ data: { userId: learner.id, banned: true, reason: 'Test suspension' } })
  const blocked = await authRequest('sign-in/email', { email: 'learner@staff.test', password: learner.password })
  expect(blocked.status).toBe(403)
  expect(await blocked.json()).toEqual({ code: 'BANNED_USER', message: 'Your account has been suspended. To get access back, contact your company admin at alpha or beta.' })
  const outsider = accounts.get('outsider')!
  sqlite.prepare('DELETE FROM member WHERE user_id = ?').run(outsider.id)
  await setUserBan({ data: { userId: outsider.id, banned: true } })
  const personal = await authRequest('sign-in/email', { email: 'outsider@staff.test', password: outsider.password })
  expect(await personal.json()).toEqual({ code: 'BANNED_USER', message: 'You have been banned from this application. Please contact support if you believe this is an error.' })
  expect(sqlite.prepare('SELECT banned, ban_reason FROM user WHERE id = ?').get(learner.id)).toEqual({ banned: 1, ban_reason: 'Test suspension' })
  boundary.headers = new Headers({ cookie: learner.cookie })
  await expect(getSessionUser()).resolves.toBeNull()
  boundary.headers = new Headers({ cookie: accounts.get('staff')!.cookie })
  await setUserBan({ data: { userId: learner.id, banned: false } })
  const allowed = await authRequest('sign-in/email', { email: 'learner@staff.test', password: learner.password })
  expect(allowed.status).toBe(200)
  expect(sqlite.prepare('SELECT banned, ban_reason FROM user WHERE id = ?').get(learner.id)).toEqual({ banned: 0, ban_reason: null })
})

// Company topics in beta: a role curriculum that is building, a failed and a ready concept, flagged and retired questions.
function seedContent() {
  sqlite.prepare('INSERT INTO job_roles (id, org_id, name, created_at) VALUES (?, ?, ?, ?)').run('gen-role', 'beta', 'Picker', NOW)
  sqlite.prepare('INSERT INTO topics (id, org_id, job_role_id, title, status, gen_started_at, created_at) VALUES (?, ?, ?, ?, ?, ?, ?)').run('gen-topic', 'beta', 'gen-role', 'Picker', 'generating', NOW - 5, NOW)
  sqlite.prepare('INSERT INTO units (id, topic_id, "order", name, summary) VALUES (?, ?, 0, ?, ?)').run('gen-unit', 'gen-topic', 'Unit', 'Unit')
  const concept = sqlite.prepare('INSERT INTO concepts (id, topic_id, unit_id, "order", name, summary, gen_status, gen_error, gen_started_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)')
  concept.run('c-failed', 'gen-topic', 'gen-unit', 0, 'Scan the SKU', 'Scan.', 'failed', 'Only 1 of 4 questions passed the self-check.', NOW - 9)
  concept.run('c-ready', 'gen-topic', 'gen-unit', 1, 'Seal the box', 'Seal.', 'ready', null, null)
  const item = sqlite.prepare('INSERT INTO items (id, concept_id, topic_id, format, payload_json, status, reviewed_at, created_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?)')
  item.run('i-flagged', 'c-ready', 'gen-topic', 'short', JSON.stringify({ format: 'short', stem: 'What do you scan first?' }), 'active', null, NOW)
  item.run('i-retired', 'c-ready', 'gen-topic', 'short', JSON.stringify({ format: 'short', stem: 'Which tape seals a box?' }), 'retired', NOW, NOW)
  sqlite.prepare('INSERT INTO item_flags (id, item_id, user_id, reason, note, created_at) VALUES (?, ?, ?, ?, ?, ?)')
    .run('flag-1', 'i-flagged', accounts.get('outsider')!.id, 'wrong', 'Answer is off', NOW - 1000)
}

it('lists unfinished company generation for staff and retries a failed concept once', async () => {
  seedContent()
  await expect(getGenerationJobs()).resolves.toEqual({
    concepts: [{ id: 'c-failed', company: 'beta', role: 'Picker', concept: 'Scan the SKU', status: 'failed', error: 'Only 1 of 4 questions passed the self-check.', startedAt: NOW - 9 }],
    roles: [{ id: 'gen-topic', company: 'beta', role: 'Picker', status: 'generating', startedAt: NOW - 5 }],
  })
  sqlite.prepare('INSERT INTO job_roles (id, org_id, name, created_at) VALUES (?, ?, ?, ?)').run('bad-role', 'beta', 'Packer', NOW)
  sqlite.prepare('INSERT INTO topics (id, org_id, job_role_id, title, status, created_at) VALUES (?, ?, ?, ?, ?, ?)').run('bad-topic', 'beta', 'bad-role', 'Packer', 'failed', NOW)
  await expect(getStaffSession()).resolves.toEqual({ id: accounts.get('staff')!.id, name: 'staff', email: 'staff@staff.test', failedJobs: 2 })
  await expect(retryJobConcept({ data: { conceptId: 'c-failed' } })).resolves.toEqual({ ok: true })
  expect(sqlite.prepare('SELECT gen_status, gen_error, gen_started_at FROM concepts WHERE id = ?').get('c-failed')).toEqual({ gen_status: 'pending', gen_error: null, gen_started_at: null })
  expect(boundary.background).toHaveLength(1)
  await expect(retryJobConcept({ data: { conceptId: 'c-failed' } })).rejects.toMatchObject({ status: 404, message: 'Failed concept not found' })
  await expect(getStaffSession()).resolves.toMatchObject({ failedJobs: 1 })
  await expect(getGenerationJobs()).resolves.toMatchObject({ concepts: [{ id: 'c-failed', status: 'pending', error: null, startedAt: null }] })
})

it('lists open question reports, resolves them once and lists retired questions', async () => {
  seedContent()
  await expect(getContentFlags()).resolves.toEqual({
    flags: [{ id: 'flag-1', stem: 'What do you scan first?', concept: 'Seal the box', company: 'beta', reason: 'wrong', note: 'Answer is off', createdAt: NOW - 1000 }],
    retired: [{ id: 'i-retired', stem: 'Which tape seals a box?', concept: 'Seal the box', company: 'beta', role: 'Picker' }],
  })
  await expect(resolveFlag({ data: { flagId: 'flag-1' } })).resolves.toEqual({ ok: true })
  expect(sqlite.prepare('SELECT resolved_at FROM item_flags WHERE id = ?').get('flag-1')).toEqual({ resolved_at: NOW })
  await expect(getContentFlags()).resolves.toMatchObject({ flags: [] })
  vi.setSystemTime(NOW + 60_000)
  await expect(resolveFlag({ data: { flagId: 'flag-1' } })).resolves.toEqual({ ok: true })
  expect(sqlite.prepare('SELECT resolved_at FROM item_flags WHERE id = ?').get('flag-1')).toEqual({ resolved_at: NOW })
  await expect(resolveFlag({ data: { flagId: 'missing' } })).rejects.toMatchObject({ status: 404, message: 'Flag not found' })
})
