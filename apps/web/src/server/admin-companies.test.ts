import { readFileSync, readdirSync } from 'node:fs'
import { DatabaseSync } from 'node:sqlite'
import { drizzle } from 'drizzle-orm/sqlite-proxy'
import { afterAll, afterEach, beforeAll, beforeEach, expect, it, vi } from 'vitest'
import { z } from 'zod'
import { dbSchema } from '@/db'
import { getAuth } from '@/server/auth'
import { getStaffSession } from './admin'
import { getCompanies, getCompany } from './admin-companies'

const boundary = vi.hoisted(() => ({ db: null as unknown, headers: new Headers(), status: 200 }))

// Only the request transport and database binding are replaced. Authorization,
// validation, queries, Better Auth and its admin plugin execute for real.
vi.mock('@tanstack/react-start', () => ({
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
}))

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
    sqlite.prepare('INSERT INTO model_calls (id, learner_id, org_id, purpose, model, latency_ms, cost_usd, ok, created_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)').run(org, id, org, 'items', 'muse-spark-1.3', 1, org === 'alpha' ? 0.125 : 9, 1, NOW)
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
})
afterEach(() => { sqlite.exec('ROLLBACK'); vi.useRealTimers() })
afterAll(() => sqlite.close())

it('refuses the company functions for non-staff, including a company owner', async () => {
  boundary.headers = new Headers({ cookie: accounts.get('learner')!.cookie })
  for (const call of [() => getCompanies(), () => getCompany({ data: { slug: 'alpha' } })]) {
    boundary.status = 200
    await expect(call()).rejects.toMatchObject({ status: 403, message: 'Staff only' })
    expect(boundary.status).toBe(403)
  }
})

it('returns company members, roles, documents, distinct active learners and scoped spend for staff', async () => {
  await expect(getStaffSession()).resolves.toMatchObject({ id: accounts.get('staff')!.id })
  await expect(getCompanies()).resolves.toEqual([
    { id: 'alpha', name: 'alpha', slug: 'alpha', members: 1, roles: 1, documents: 1, activeLearners: 1, modelSpend: 0.125 },
    { id: 'beta', name: 'beta', slug: 'beta', members: 1, roles: 1, documents: 0, activeLearners: 0, modelSpend: 9 },
    { id: 'empty', name: 'empty', slug: 'empty', members: 0, roles: 0, documents: 0, activeLearners: 0, modelSpend: 0 },
  ])
  await expect(getCompany({ data: { slug: 'alpha' } })).resolves.toMatchObject({
    members: [{ name: 'learner', role: 'owner' }],
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

it('uses company attribution and the same settled 30-day spend for the figure and job bars', async () => {
  const call = sqlite.prepare('INSERT INTO model_calls (id, learner_id, org_id, purpose, model, latency_ms, cost_usd, ok, error, created_at) VALUES (?, ?, ?, ?, ?, 1, ?, ?, ?, ?)')
  const learner = accounts.get('learner')!.id
  const since = NOW - 30 * 86_400_000
  call.run('too-old', learner, 'alpha', 'items', 'muse-spark-1.3', 5, 1, null, since - 1)
  call.run('boundary', null, 'alpha', 'items', 'muse-spark-1.3', 0.5, 1, null, since)
  call.run('fallback', null, 'alpha', 'items', 'muse-spark-open', 0.25, 1, null, NOW)
  call.run('failed', null, 'alpha', 'grade', 'muse-spark-1.3', 0.0625, 0, null, NOW)
  call.run('pending', learner, 'alpha', 'items', 'muse-spark-1.3', 100, 0, 'pending', NOW)
  call.run('personal', learner, null, 'items', 'muse-spark-1.3', 50, 1, null, NOW)
  call.run('other-company', learner, 'beta', 'items', 'muse-spark-1.3', 20, 1, null, NOW)
  call.run('unpriced', null, 'alpha', 'voice', 'muse-voice-transcribe-1.0', null, 1, null, NOW)
  // Attribution must survive the caller leaving the company.
  sqlite.prepare('DELETE FROM member WHERE user_id = ?').run(learner)
  const company = await getCompany({ data: { slug: 'alpha' } })
  expect(company.modelSpend).toBe(0.9375)
  expect(company.spendByJob).toEqual([
    { purpose: 'items', models: ['muse-spark-1.3', 'muse-spark-open'], cost: 0.875 },
    { purpose: 'grade', models: ['muse-spark-1.3'], cost: 0.0625 },
    { purpose: 'voice', models: ['muse-voice-transcribe-1.0'], cost: null },
  ])
  const direct = sqlite.prepare("SELECT SUM(cost_usd) AS total FROM model_calls WHERE org_id = 'alpha' AND created_at >= ? AND created_at <= ? AND NOT (ok = 0 AND COALESCE(error, '') = 'pending')").get(since, NOW)
  expect(company.modelSpend).toBe(direct!.total)
  expect(company.spendByJob.reduce((total, job) => total + (job.cost ?? 0), 0)).toBe(company.modelSpend)
  expect((await getCompanies()).find((c) => c.slug === 'alpha')!.modelSpend).toBe(company.modelSpend)
  await expect(getCompany({ data: { slug: 'empty' } })).resolves.toMatchObject({ modelSpend: null, spendByJob: [] })
})

it('reads membership activity, pending invitations and live role documents without changing them', async () => {
  const learner = accounts.get('learner')!.id
  sqlite.prepare("UPDATE organization SET logo = '/logo.svg' WHERE id = 'alpha'").run()
  sqlite.prepare("UPDATE topics SET status = 'generating' WHERE id = 'role-alpha'").run()
  sqlite.prepare("UPDATE sources SET uploaded_by = ?, size_bytes = 1100000, page_count = 9, version = 3 WHERE id = 'alpha-sop'").run(learner)
  sqlite.prepare('INSERT INTO units (id, topic_id, "order", name, summary) VALUES (?, ?, 0, ?, ?)').run('unit', 'role-alpha', 'Unit', '')
  const concept = sqlite.prepare('INSERT INTO concepts (id, topic_id, unit_id, "order", name, summary, gen_status, source_id) VALUES (?, ?, ?, 0, ?, ?, ?, ?)')
  concept.run('ready', 'role-alpha', 'unit', 'Ready', '', 'ready', 'alpha-sop')
  concept.run('waiting', 'role-alpha', 'unit', 'Waiting', '', 'pending', 'alpha-sop')
  const item = sqlite.prepare('INSERT INTO items (id, concept_id, topic_id, source_id, format, payload_json, status, reviewed_at, created_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)')
  item.run('live', 'ready', 'role-alpha', 'alpha-sop', 'short', '{}', 'active', null, NOW)
  item.run('reported', 'ready', 'role-alpha', 'alpha-sop', 'short', '{}', 'reported', NOW, NOW)
  item.run('retired', 'ready', 'role-alpha', 'alpha-sop', 'short', '{}', 'retired', null, NOW)
  sqlite.prepare('INSERT INTO sessions (id, learner_id, topic_id, kind, started_at) VALUES (?, ?, ?, ?, ?)').run('newest', learner, 'alpha', 'session', NOW + 1)
  for (const status of ['accepted', 'canceled']) {
    sqlite.prepare('INSERT INTO invitation (id, organization_id, email, status, inviter_id, job_role_id, invitee_name, expires_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?)')
      .run(status, 'alpha', status + '@staff.test', status, learner, 'alpha', status, NOW + 86400000)
  }
  const source = sqlite.prepare('INSERT INTO sources (id, topic_id, kind, title, body_text, retired_at, deleted_at, created_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?)')
  source.run('retired-doc', 'role-alpha', 'text', 'Retired', '', NOW, null, NOW)
  source.run('deleted-doc', 'role-alpha', 'text', 'Deleted', '', null, NOW, NOW)
  const changes = sqlite.prepare('SELECT total_changes() AS n').get()!.n
  const company = await getCompany({ data: { slug: 'alpha' } })
  expect(company).toMatchObject({ owner: 'learner', logo: '/logo.svg', createdAt: new Date(NOW),
    members: [{ joinedAt: new Date(NOW), lastActive: NOW + 1 }],
    invitations: [{ id: 'private-invite', name: 'Invitee', email: 'invitee@staff.test' }],
    roles: [{ conceptsTotal: 2, conceptsReady: 1, preparing: true, liveQuestions: 2, people: 1 }],
    documents: [{ id: 'alpha-sop', uploaderName: 'learner', chars: 16, sizeBytes: 1100000, pageCount: 9, version: 3, unreviewed: 1, generating: true }],
  })
  expect(sqlite.prepare('SELECT total_changes() AS n').get()!.n).toBe(changes)
  // Publishing the curriculum marks the topic ready before its concept questions finish.
  sqlite.prepare("UPDATE topics SET status = 'ready' WHERE id = 'role-alpha'").run()
  await expect(getCompany({ data: { slug: 'alpha' } })).resolves.toMatchObject({ roles: [{ topicStatus: 'ready', preparing: true }] })
})
