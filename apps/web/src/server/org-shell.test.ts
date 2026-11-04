import { readFileSync, readdirSync } from 'node:fs'
import { DatabaseSync } from 'node:sqlite'
import { drizzle } from 'drizzle-orm/sqlite-proxy'
import { afterAll, beforeAll, expect, it, vi } from 'vitest'
import { getSessionUser } from '@/server/session'
import { getPortalShell } from './org-shell'

const holder = vi.hoisted(() => ({ db: null as unknown }))

vi.mock('@tanstack/react-start', () => ({
  createServerFn: () => ({
    handler: () => () => undefined,
    validator: (schema: { parse: (data: unknown) => unknown }) => ({
      handler: (fn: (input: { data: unknown }) => unknown) => (input: { data: unknown }) => fn({ data: schema.parse(input.data) }),
    }),
  }),
}))
vi.mock('@tanstack/react-start/server', () => ({ getRequestHeaders: () => new Headers(), setResponseStatus: () => {} }))
vi.mock('@/db', () => ({ getDb: () => holder.db }))
vi.mock('@/server/session', () => ({ getSessionUser: vi.fn() }))
vi.mock('@/server/auth', () => ({ getAuth: () => ({}) }))
vi.mock('@/server/env', () => ({ getEnv: () => ({ BETTER_AUTH_URL: 'http://127.0.0.1:8800' }) }))

let sqlite: DatabaseSync

beforeAll(() => {
  sqlite = new DatabaseSync(':memory:')
  sqlite.exec('PRAGMA foreign_keys = ON')
  for (const file of readdirSync('drizzle').filter((f) => f.endsWith('.sql')).sort()) {
    sqlite.exec(readFileSync(`drizzle/${file}`, 'utf8').replaceAll('--> statement-breakpoint', ''))
  }
  for (const id of ['owner', 'admin', 'member', 'staff']) {
    sqlite.prepare('INSERT INTO user (id, name, email) VALUES (?, ?, ?)').run(id, `Name ${id}`, `${id}@x.test`)
  }
  sqlite.prepare('INSERT INTO organization (id, name, slug, created_at) VALUES (?, ?, ?, ?)').run('org-a', 'Alpha', 'alpha', 1)
  for (const [id, role] of [['owner', 'owner'], ['admin', 'admin'], ['member', 'member']]) {
    sqlite.prepare('INSERT INTO member (id, organization_id, user_id, role, created_at) VALUES (?, ?, ?, ?, ?)').run(id, 'org-a', id, role, 1)
  }
  sqlite.prepare('INSERT INTO org_settings (org_id, company_name, working_hours_json, logo_key) VALUES (?, ?, ?, ?)').run('org-a', 'Alpha', '{}', 'logo 1')
  holder.db = drizzle(async (sql, params, method) => {
    const stmt = sqlite.prepare(sql)
    stmt.setReturnArrays(true)
    const args = params as (string | number | null)[]
    if (method === 'run') {
      stmt.run(...args)
      return { rows: [] }
    }
    return { rows: (method === 'get' ? stmt.get(...args) : stmt.all(...args)) as never }
  })
})

afterAll(() => sqlite.close())

it('shapes the portal shell for each kind of viewer', async () => {
  const as = (id: string | null, role?: string) => vi.mocked(getSessionUser).mockResolvedValue((id ? { id, name: `Name ${id}`, role, isAnonymous: false } : null) as never)
  const logoUrl = '/api/org/org-a/logo?v=logo%201'
  const base = { orgId: 'org-a', name: 'Alpha', slug: 'alpha' }

  as('owner')
  await expect(getPortalShell({ data: { slug: 'alpha' } })).resolves.toEqual({ ...base, logoUrl, userName: 'Name owner', role: 'owner', readOnly: false })
  as('admin')
  await expect(getPortalShell({ data: { slug: 'alpha' } })).resolves.toEqual({ ...base, logoUrl, userName: 'Name admin', role: 'admin', readOnly: false })
  as('staff', 'admin')
  await expect(getPortalShell({ data: { slug: 'alpha' } })).resolves.toEqual({ ...base, logoUrl: null, userName: 'Name staff', role: null, readOnly: true })
  as('member')
  await expect(getPortalShell({ data: { slug: 'alpha' } })).rejects.toMatchObject({ status: 403 })
  as(null)
  await expect(getPortalShell({ data: { slug: 'alpha' } })).rejects.toMatchObject({ status: 401 })
})
