import { readFileSync, readdirSync } from 'node:fs'
import { DatabaseSync } from 'node:sqlite'
import { drizzle } from 'drizzle-orm/sqlite-proxy'
import { afterAll, afterEach, beforeAll, beforeEach, expect, it, vi } from 'vitest'
import { getSessionUser } from '@/server/session'
import { getInvite } from './org'
import { serveInviteLogo } from './org-logo'

const holder = vi.hoisted(() => ({ db: null as unknown, media: { get: vi.fn() } }))

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
vi.mock('@/server/auth', () => ({ getAuth: () => ({}) }))
vi.mock('@/server/env', () => ({ getEnv: () => ({ BETTER_AUTH_URL: 'http://127.0.0.1:8800', MEDIA: holder.media }) }))

let sqlite: DatabaseSync

beforeAll(() => {
  sqlite = new DatabaseSync(':memory:')
  sqlite.exec('PRAGMA foreign_keys = ON')
  for (const file of readdirSync('drizzle').filter((f) => f.endsWith('.sql')).sort()) {
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
  holder.db = drizzle(async (sql, params, method) => query(sql, params, method))
  sqlite.prepare('INSERT INTO user (id, name, email) VALUES (?, ?, ?)').run('inviter', 'Inviter', 'inviter@x.test')
})

const email = 'dana@northwind.test'
const future = Date.now() + 86_400_000

beforeEach(() => {
  sqlite.exec('BEGIN')
  vi.mocked(getSessionUser).mockResolvedValue(null as never)
  sqlite.prepare('INSERT INTO organization (id, name, slug, created_at) VALUES (?, ?, ?, ?)').run('org-n', 'Northwind Logistics', 'northwind', 1)
  sqlite.prepare('INSERT INTO job_roles (id, org_id, name, created_at) VALUES (?, ?, ?, ?)').run('role-w', 'org-n', 'Warehouse picker', 1)
  seedInvite(future)
})

function seedInvite(expiresAt: number) {
  sqlite.prepare('DELETE FROM invitation').run()
  sqlite
    .prepare('INSERT INTO invitation (id, organization_id, email, status, expires_at, inviter_id, job_role_id, invitee_name) VALUES (?, ?, ?, ?, ?, ?, ?, ?)')
    .run('inv-1', 'org-n', email, 'pending', expiresAt, 'inviter', 'role-w', 'Dana Reyes')
}

afterEach(() => sqlite.exec('ROLLBACK'))
afterAll(() => sqlite.close())

const base = { company: 'Northwind Logistics', email, name: 'Dana Reyes', roleName: 'Warehouse picker', status: 'pending', otherAccount: false, accent: null, logoUrl: null }

it('returns the invite with role name and no brand colour by default', async () => {
  await expect(getInvite({ data: { id: 'inv-1' } })).resolves.toEqual(base)
})

it.each([
  ['#0E5A73', '#0E5A73'],
  ['#00AA00', null],
  ['#FFFF00', null],
])('accent %s resolves to %s', async (accent, expected) => {
  sqlite.prepare('INSERT INTO org_settings (org_id, company_name, working_hours_json, accent) VALUES (?, ?, ?, ?)').run('org-n', 'Northwind Logistics', '{}', accent)
  await expect(getInvite({ data: { id: 'inv-1' } })).resolves.toEqual({ ...base, accent: expected })
})

it('reports a pending invite past its expiry as expired', async () => {
  seedInvite(Date.now() - 1000)
  await expect(getInvite({ data: { id: 'inv-1' } })).resolves.toEqual({ ...base, status: 'expired' })
})

it('flags a viewer signed in with a different email', async () => {
  vi.mocked(getSessionUser).mockResolvedValue({ id: 'u', email: 'someone@else.test', isAnonymous: false } as never)
  await expect(getInvite({ data: { id: 'inv-1' } })).resolves.toEqual({ ...base, otherAccount: true })
})

it('does not flag the same email in a different case', async () => {
  vi.mocked(getSessionUser).mockResolvedValue({ id: 'u', email: 'DANA@Northwind.test', isAnonymous: false } as never)
  await expect(getInvite({ data: { id: 'inv-1' } })).resolves.toEqual(base)
})

it('returns null for an unknown id', async () => {
  await expect(getInvite({ data: { id: 'missing' } })).resolves.toBeNull()
})

const png = new Uint8Array([0x89, 0x50, 0x4e, 0x47])

function seedLogo(logoKey: string | null) {
  sqlite.prepare('INSERT INTO org_settings (org_id, company_name, working_hours_json, logo_key) VALUES (?, ?, ?, ?)').run('org-n', 'Northwind Logistics', '{}', logoKey)
  holder.media.get.mockImplementation(async (key: string) => (key === logoKey ? { body: png, httpMetadata: { contentType: 'image/png' } } : null))
}

it('serves the company logo for an invite of any status before sign-in', async () => {
  seedLogo('org-logos/org-n/a.png')
  await expect(getInvite({ data: { id: 'inv-1' } })).resolves.toEqual({ ...base, logoUrl: '/api/invites/inv-1/logo?v=org-logos%2Forg-n%2Fa.png' })
  for (const status of ['pending', 'canceled']) {
    sqlite.prepare('UPDATE invitation SET status = ?').run(status)
    const response = await serveInviteLogo('inv-1')
    expect(response.status).toBe(200)
    expect(response.headers.get('Content-Type')).toBe('image/png')
    expect(response.headers.get('X-Content-Type-Options')).toBe('nosniff')
    expect(response.headers.get('Content-Security-Policy')).toBe("default-src 'none'; sandbox")
    expect(new Uint8Array(await response.arrayBuffer())).toEqual(png)
  }
})

it('returns 404 for a company without a logo and for an unknown invite', async () => {
  seedLogo(null)
  await expect(getInvite({ data: { id: 'inv-1' } })).resolves.toEqual(base)
  expect((await serveInviteLogo('inv-1')).status).toBe(404)
  sqlite.prepare('UPDATE org_settings SET logo_key = ?').run('org-logos/org-n/a.png')
  holder.media.get.mockResolvedValue({ body: png, httpMetadata: { contentType: 'image/png' } })
  expect((await serveInviteLogo('missing')).status).toBe(404)
})
