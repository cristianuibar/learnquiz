import { readFileSync, readdirSync } from 'node:fs'
import { DatabaseSync } from 'node:sqlite'
import { drizzle } from 'drizzle-orm/sqlite-proxy'
import { afterAll, afterEach, beforeAll, beforeEach, expect, it, vi } from 'vitest'
import { z } from 'zod'
import { dbSchema } from '@/db'
import { DailyCapError } from '@/lib/llm/client'
import { getAuth } from '@/server/auth'
import { getSessionUser } from '@/server/session'
import { createRole, getOrgOverview, listRoles } from '@/server/org'
import { getPeople } from '@/server/people'
import { getContentFlags, getStaffSession, resolveFlag } from './admin'
import { getGenerationJobs, retryJobs } from './admin-jobs'
import { listUsers, setUserBan } from './admin-users'

const boundary = vi.hoisted(() => ({ db: null as unknown, headers: new Headers(), status: 200, background: [] as unknown[], chatJson: (() => new Promise(() => {})) as () => Promise<unknown> }))

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
// A role build that reaches the model never answers, so a started build stays in its claimed state.
vi.mock('@/lib/llm/client', async (original) => ({ ...await original<typeof import('@/lib/llm/client')>(), chatJson: () => boundary.chatJson() }))
vi.mock('@/server/concept-gen', async (original) => ({ ...await original<typeof import('@/server/concept-gen')>(), drainConceptQueue: async () => 'drained' }))

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
  boundary.chatJson = () => new Promise(() => {})
})
afterEach(() => { sqlite.exec('ROLLBACK'); vi.useRealTimers() })
afterAll(() => sqlite.close())

it('refuses every admin function for non-staff, including a company owner', async () => {
  boundary.headers = new Headers({ cookie: accounts.get('learner')!.cookie })
  for (const call of [
    () => getStaffSession(),
    () => listUsers({ data: { search: '', offset: 0 } }),
    () => setUserBan({ data: { userId: accounts.get('outsider')!.id, banned: true, reason: 'x' } }),
    () => setUserBan({ data: { userId: accounts.get('outsider')!.id, banned: false } }),
    () => getGenerationJobs({ data: { filter: 'notReady', offset: 0 } }),
    () => retryJobs({ data: { ids: ['concept:x'] } }),
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

it('searches users and bans, revokes sessions, blocks sign-in and unbans', async () => {
  const learner = accounts.get('learner')!
  await expect(listUsers({ data: { search: 'learner@', offset: 0 } })).resolves.toMatchObject({ users: [{ id: learner.id }], total: 1 })
  await expect(listUsers({ data: { search: 'outsider', offset: 0 } })).resolves.toMatchObject({ users: [{ id: accounts.get('outsider')!.id }], total: 1 })
  await expect(listUsers({ data: { search: 'learner@', offset: 25 } })).resolves.toEqual({ users: [], total: 1 })
  sqlite.prepare('INSERT INTO member (id, organization_id, user_id, role, created_at) VALUES (?, ?, ?, ?, ?)').run('learner-beta', 'beta', learner.id, 'member', NOW)
  await setUserBan({ data: { userId: learner.id, banned: true, reason: 'Test suspension' } })
  const blocked = await authRequest('sign-in/email', { email: 'learner@staff.test', password: learner.password })
  expect(blocked.status).toBe(403)
  expect(await blocked.json()).toEqual({ code: 'BANNED_USER', message: 'Your account has been suspended. To get access back, contact your company admin at alpha or beta.' })
  const outsider = accounts.get('outsider')!
  sqlite.prepare('DELETE FROM member WHERE user_id = ?').run(outsider.id)
  await setUserBan({ data: { userId: outsider.id, banned: true, reason: 'Left the company' } })
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

it('refuses to ban yourself and keeps the staff account and session intact', async () => {
  const staff = accounts.get('staff')!
  boundary.status = 200
  await expect(setUserBan({ data: { userId: staff.id, banned: true, reason: 'x' } })).rejects.toMatchObject({ status: 403 })
  expect(boundary.status).toBe(403)
  expect(sqlite.prepare('SELECT banned FROM user WHERE id = ?').get(staff.id)).toEqual({ banned: 0 })
  await expect(getStaffSession()).resolves.toMatchObject({ id: staff.id })
})

it('requires a reason to ban', async () => {
  const learner = accounts.get('learner')!
  for (const reason of [undefined, '   ']) {
    boundary.status = 200
    await expect(setUserBan({ data: { userId: learner.id, banned: true, reason } })).rejects.toMatchObject({ status: 400 })
    expect(boundary.status).toBe(400)
  }
  expect(sqlite.prepare('SELECT banned FROM user WHERE id = ?').get(learner.id)).toEqual({ banned: 0 })
})

it('filters users by role and status together and reports each user\'s company', async () => {
  const [staff, learner, outsider] = ['staff', 'learner', 'outsider'].map((name) => accounts.get(name)!.id)
  await setUserBan({ data: { userId: learner, banned: true, reason: 'Test suspension' } })
  const ids = async (filter: object) => (await listUsers({ data: { search: '', offset: 0, ...filter } })).users.map((u) => u.id).sort()
  expect(await ids({ role: 'admin' })).toEqual([staff])
  expect(await ids({ role: 'user' })).toEqual([learner, outsider].sort())
  expect(await ids({ status: 'banned' })).toEqual([learner])
  expect(await ids({ status: 'active' })).toEqual([staff, outsider].sort())
  expect(await ids({ role: 'user', status: 'active' })).toEqual([outsider])
  const { users, total } = await listUsers({ data: { search: '', offset: 0 } })
  expect(total).toBe(3)
  expect(users.find((u) => u.id === learner)).toMatchObject({ admin: false, banned: true, banReason: 'Test suspension', company: { name: 'alpha', role: 'owner' } })
  expect(users.find((u) => u.id === staff)).toMatchObject({ admin: true, banned: false, company: null })
})

it('sorts users alphabetically by name in either direction, newest first by default', async () => {
  const [staff, learner, outsider] = ['staff', 'learner', 'outsider'].map((name) => accounts.get(name)!.id)
  // Zoe joined after Ada, so only a name sort puts Ada first.
  const named = [[staff, 'Mia', 2000], [learner, 'ada', 1000], [outsider, 'Zoe', 3000]] as const
  for (const [id, name, at] of named) sqlite.prepare('UPDATE user SET name = ?, created_at = ? WHERE id = ?').run(name, at, id)
  const names = async (order: object) => (await listUsers({ data: { search: '', offset: 0, ...order } })).users.map((u) => u.name)
  expect(await names({})).toEqual(['Zoe', 'Mia', 'ada'])
  expect(await names({ sort: 'name', dir: 'ascending' })).toEqual(['ada', 'Mia', 'Zoe'])
  expect(await names({ sort: 'name', dir: 'descending' })).toEqual(['Zoe', 'Mia', 'ada'])
  expect(await names({ sort: 'joined', dir: 'ascending' })).toEqual(['ada', 'Mia', 'Zoe'])
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

function seedJobs() {
  seedContent()
  const concept = sqlite.prepare('INSERT INTO concepts (id, topic_id, unit_id, "order", name, summary, gen_status, gen_error, gen_started_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)')
  concept.run('c-pending-late', 'gen-topic', 'gen-unit', 7, 'Pending late', 'x', 'pending', null, null)
  concept.run('c-pending-early', 'gen-topic', 'gen-unit', 3, 'Pending early', 'x', 'pending', null, null)
  concept.run('c-generating', 'gen-topic', 'gen-unit', 5, 'Generating one', 'x', 'generating', null, NOW - 3)
  concept.run('c-failed-late', 'gen-topic', 'gen-unit', 9, 'Failed late', 'x', 'failed', 'Timed out', NOW - 8)
  sqlite.prepare('INSERT INTO job_roles (id, org_id, name, created_at) VALUES (?, ?, ?, ?)').run('bad-role', 'beta', 'Packer', NOW)
  sqlite.prepare('INSERT INTO topics (id, org_id, job_role_id, title, status, created_at) VALUES (?, ?, ?, ?, ?, ?)').run('bad-topic', 'beta', 'bad-role', 'Packer', 'failed', NOW)
  sqlite.prepare('INSERT INTO sources (id, topic_id, kind, title, body_text, created_at) VALUES (?, ?, ?, ?, ?, ?)').run('bad-doc', 'bad-topic', 'text', 'SOP', 'Text', NOW)
  sqlite.prepare('INSERT INTO sources (id, topic_id, kind, title, body_text, created_at, deleted_at) VALUES (?, ?, ?, ?, ?, ?, ?)').run('bad-doc-gone', 'bad-topic', 'text', 'Old', 'Text', NOW, NOW)
}

it('lists failed, generating, pending and ready jobs in queue order with counts and filters', async () => {
  seedJobs()
  const notReady = await getGenerationJobs({ data: { filter: 'notReady', offset: 0 } })
  expect(notReady.counts).toEqual({ failed: 3, generating: 2, pending: 2, ready: 1 })
  expect(notReady.total).toBe(7)
  expect(notReady.updatedAt).toBe(NOW)
  expect(notReady.rows.map((r) => r.id)).toEqual([
    'concept:c-failed', 'concept:c-failed-late', 'curriculum:bad-topic', 'concept:c-generating', 'curriculum:gen-topic', 'concept:c-pending-early', 'concept:c-pending-late',
  ])
  expect(notReady.rows[0]).toEqual({ id: 'concept:c-failed', kind: 'concept', company: 'beta', role: 'Picker', target: 'Scan the SKU', state: 'failed', startedAt: NOW - 9, error: 'Only 1 of 4 questions passed the self-check.' })
  expect(notReady.rows[2]).toEqual({ id: 'curriculum:bad-topic', kind: 'curriculum', company: 'beta', role: 'Packer', target: '1 document', state: 'failed', startedAt: null, error: null })
  expect(notReady.rows[4]).toMatchObject({ id: 'curriculum:gen-topic', target: '0 documents', state: 'generating', startedAt: NOW - 5 })
  const failed = await getGenerationJobs({ data: { filter: 'failed', offset: 0 } })
  expect(failed.total).toBe(3)
  expect(failed.rows.map((r) => r.id)).toEqual(['concept:c-failed', 'concept:c-failed-late', 'curriculum:bad-topic'])
  const ready = await getGenerationJobs({ data: { filter: 'ready', offset: 0 } })
  expect(ready.total).toBe(1)
  expect(ready.rows.map((r) => r.id)).toEqual(['concept:c-ready'])
  const second = await getGenerationJobs({ data: { filter: 'notReady', offset: 5 } })
  expect(second.rows.map((r) => r.id)).toEqual(['concept:c-pending-early', 'concept:c-pending-late'])
  await expect(getGenerationJobs({ data: { filter: 'notReady', offset: 100 } })).resolves.toMatchObject({ rows: [], total: 7 })
})

it('retries a failed concept once without waking the queue per concept', async () => {
  seedContent()
  sqlite.prepare('INSERT INTO job_roles (id, org_id, name, created_at) VALUES (?, ?, ?, ?)').run('bad-role', 'beta', 'Packer', NOW)
  sqlite.prepare('INSERT INTO topics (id, org_id, job_role_id, title, status, created_at) VALUES (?, ?, ?, ?, ?, ?)').run('bad-topic', 'beta', 'bad-role', 'Packer', 'failed', NOW)
  await expect(getStaffSession()).resolves.toEqual({ id: accounts.get('staff')!.id, name: 'staff', email: 'staff@staff.test', failedJobs: 2 })
  await expect(retryJobs({ data: { ids: ['concept:c-failed', 'concept:c-failed'] } })).resolves.toEqual({ queued: 1, skipped: 0, failed: 0 })
  expect(sqlite.prepare('SELECT gen_status, gen_error, gen_started_at FROM concepts WHERE id = ?').get('c-failed')).toEqual({ gen_status: 'pending', gen_error: null, gen_started_at: null })
  expect(boundary.background).toHaveLength(1)
  await expect(retryJobs({ data: { ids: ['concept:c-failed'] } })).resolves.toEqual({ queued: 0, skipped: 1, failed: 0 })
  expect(boundary.background).toHaveLength(1)
  await expect(retryJobs({ data: { ids: ['concept:missing', 'other:thing'] } })).resolves.toEqual({ queued: 0, skipped: 2, failed: 0 })
  await expect(getStaffSession()).resolves.toMatchObject({ failedJobs: 1 })
  const { rows } = await getGenerationJobs({ data: { filter: 'pending', offset: 0 } })
  expect(rows).toEqual([expect.objectContaining({ id: 'concept:c-failed', state: 'pending', error: null, startedAt: null })])
})

function seedAlphaRoleBuild(documents: string[]) {
  sqlite.prepare('INSERT INTO job_roles (id, org_id, name, created_at) VALUES (?, ?, ?, ?)').run('retry-role', 'alpha', 'Retry role', NOW)
  sqlite.prepare('INSERT INTO topics (id, org_id, job_role_id, title, status, created_at) VALUES (?, ?, ?, ?, ?, ?)').run('retry-topic', 'alpha', 'retry-role', 'Retry role', 'failed', NOW)
  documents.forEach((body, i) => sqlite.prepare('INSERT INTO sources (id, topic_id, kind, title, body_text, created_at) VALUES (?, ?, ?, ?, ?, ?)').run(`retry-doc-${i}`, 'retry-topic', 'text', `Doc ${i}`, body, NOW))
}
const topicStatus = () => (sqlite.prepare('SELECT status FROM topics WHERE id = ?').get('retry-topic') as { status: string }).status

it('rebuilds a failed role curriculum once for the company owner', async () => {
  seedAlphaRoleBuild(['Step one: scan the box.'])
  const ids = ['curriculum:retry-topic']
  // The claimed build runs inside the request and never settles (the model hangs); the losing call settles with a skip.
  const a = retryJobs({ data: { ids } })
  const b = retryJobs({ data: { ids } })
  await expect(Promise.race([a, b])).resolves.toEqual({ queued: 0, skipped: 1, failed: 0 })
  expect(topicStatus()).toBe('generating')
  await expect(retryJobs({ data: { ids } })).resolves.toEqual({ queued: 0, skipped: 1, failed: 0 })
  expect(boundary.background).toHaveLength(0)
})

it('counts a role build whose model call fails as failed, not queued', async () => {
  seedAlphaRoleBuild(['Step one: scan the box.'])
  boundary.chatJson = () => Promise.reject(new Error('timeout'))
  await expect(retryJobs({ data: { ids: ['curriculum:retry-topic'] } })).resolves.toEqual({ queued: 0, skipped: 0, failed: 1 })
  expect(topicStatus()).toBe('failed')
})

it('counts a role build refused by the owner daily cap as skipped, not failed', async () => {
  seedAlphaRoleBuild(['Step one: scan the box.'])
  sqlite.prepare('INSERT INTO job_roles (id, org_id, name, created_at) VALUES (?, ?, ?, ?)').run('capped-role', 'alpha', 'Capped role', NOW)
  sqlite.prepare('INSERT INTO topics (id, org_id, job_role_id, title, status, created_at) VALUES (?, ?, ?, ?, ?, ?)').run('capped-topic', 'alpha', 'capped-role', 'Capped role', 'failed', NOW)
  sqlite.prepare('INSERT INTO sources (id, topic_id, kind, title, body_text, created_at) VALUES (?, ?, ?, ?, ?, ?)').run('capped-doc', 'capped-topic', 'text', 'Doc', 'Step one: seal the box.', NOW)
  // Both builds pass the pre-claim cap check; the model client then refuses the second reservation (one call left).
  let calls = 0
  boundary.chatJson = () => Promise.reject(calls++ ? new DailyCapError() : new Error('timeout'))
  await expect(retryJobs({ data: { ids: ['curriculum:retry-topic', 'curriculum:capped-topic'] } })).resolves.toEqual({ queued: 0, skipped: 1, failed: 1 })
})

it('lists an abandoned role build as failed and lets it be retried', async () => {
  seedAlphaRoleBuild(['Step one: scan the box.'])
  sqlite.prepare("UPDATE topics SET status = 'generating', gen_started_at = ? WHERE id = 'retry-topic'").run(NOW - 11 * 60_000)
  const { rows } = await getGenerationJobs({ data: { filter: 'failed', offset: 0 } })
  expect(rows).toContainEqual(expect.objectContaining({ id: 'curriculum:retry-topic', state: 'failed' }))
  expect(topicStatus()).toBe('failed')
  void retryJobs({ data: { ids: ['curriculum:retry-topic'] } })
  await vi.waitFor(() => expect(topicStatus()).toBe('generating'))
})

it('skips a failed role build without usable documents or an owner', async () => {
  seedAlphaRoleBuild(['Step one.', '  '])
  await expect(retryJobs({ data: { ids: ['curriculum:retry-topic'] } })).resolves.toEqual({ queued: 0, skipped: 1, failed: 0 })
  expect(topicStatus()).toBe('failed')
  sqlite.prepare('UPDATE sources SET body_text = ?').run('Filled in.')
  sqlite.prepare("UPDATE member SET role = 'member' WHERE organization_id = 'alpha'").run()
  await expect(retryJobs({ data: { ids: ['curriculum:retry-topic'] } })).resolves.toEqual({ queued: 0, skipped: 1, failed: 0 })
  expect(topicStatus()).toBe('failed')
  expect(boundary.background).toHaveLength(0)
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
