import { readFileSync, readdirSync } from 'node:fs'
import { DatabaseSync } from 'node:sqlite'
import { drizzle } from 'drizzle-orm/sqlite-proxy'
import { afterAll, afterEach, beforeAll, beforeEach, expect, it, vi } from 'vitest'
import * as schema from '@/db/schema'
import * as authSchema from '@/db/auth-schema'

const state = vi.hoisted(() => ({ db: null as unknown, user: 'owner-a' as string | null, active: null as string | null, anonymous: false, bucket: { put: vi.fn(), get: vi.fn(), delete: vi.fn() } }))

// Fake only the server transport, session and Cloudflare bindings. Validators,
// membership checks, SQL and the settings/logo handlers execute for real.
vi.mock('@tanstack/react-start', () => ({
  createServerFn: () => {
    const builder = (validate: (value: unknown) => unknown = (value) => value) => ({
      validator: (schema: { parse?: (value: unknown) => unknown } | ((value: unknown) => unknown)) => builder(typeof schema === 'function' ? schema : (value) => schema.parse!(value)),
      handler: (handler: (input: { data: unknown }) => unknown) => (input?: { data: unknown }) => handler({ data: validate(input?.data) }),
    })
    return builder()
  },
}))
vi.mock('@tanstack/react-start/server', () => ({ getRequestHeaders: () => new Headers() }))
vi.mock('@/db', () => ({ getDb: () => state.db }))
vi.mock('@/server/env', () => ({ getEnv: () => ({ MEDIA: state.bucket }) }))
vi.mock('@/server/session', () => ({ getSessionUser: async () => state.user ? { id: state.user, isAnonymous: state.anonymous } : null }))
vi.mock('@/server/auth', () => ({ getAuth: () => ({ api: { getSession: async () => state.user ? { user: { id: state.user, isAnonymous: state.anonymous }, session: { activeOrganizationId: state.active } } : null } }) }))

import { getCompanyBranding, getCompanySettings, saveCompanySettings } from './org-settings'
import { serveCompanyLogo } from './org-logo'

let sqlite: DatabaseSync
beforeAll(() => {
  sqlite = new DatabaseSync(':memory:')
  for (const file of readdirSync('drizzle').filter((f) => f.endsWith('.sql')).sort()) {
    sqlite.exec(readFileSync(`drizzle/${file}`, 'utf8').replaceAll('--> statement-breakpoint', ''))
  }
  for (const id of ['owner-a', 'admin-a', 'member-a', 'owner-b', 'personal']) {
    sqlite.prepare('INSERT INTO user (id, name, email) VALUES (?, ?, ?)').run(id, id, `${id}@example.test`)
  }
  for (const [id, slug] of [['org-a', 'alpha'], ['org-b', 'beta']]) {
    sqlite.prepare('INSERT INTO organization (id, name, slug, created_at) VALUES (?, ?, ?, ?)').run(id, slug, slug, 1)
  }
  for (const [user, org, role] of [['owner-a', 'org-a', 'owner'], ['admin-a', 'org-a', 'admin'], ['member-a', 'org-a', 'member'], ['owner-b', 'org-b', 'owner']]) {
    sqlite.prepare('INSERT INTO member (id, organization_id, user_id, role, created_at) VALUES (?, ?, ?, ?, ?)').run(user, org, user, role, 1)
  }
  const run = (sql: string, params: unknown[], method: string) => {
    const statement = sqlite.prepare(sql)
    statement.setReturnArrays(true)
    const args = params as (string | number | null)[]
    if (method === 'run') { statement.run(...args); return { rows: [] } }
    return { rows: (method === 'get' ? statement.get(...args) : statement.all(...args)) as unknown[] }
  }
  state.db = drizzle(async (sql, params, method) => run(sql, params, method), async (queries) => {
    sqlite.exec('SAVEPOINT batch')
    try {
      const results = queries.map((query) => run(query.sql, query.params, query.method))
      sqlite.exec('RELEASE batch')
      return results
    } catch (error) { sqlite.exec('ROLLBACK TO batch; RELEASE batch'); throw error }
  }, { schema: { ...schema, ...authSchema } })
})
beforeEach(() => {
  sqlite.exec('BEGIN')
  state.user = 'owner-a'
  state.active = null
  state.anonymous = false
  vi.resetAllMocks()
  state.bucket.put.mockResolvedValue({})
  state.bucket.delete.mockResolvedValue(undefined)
})
afterEach(() => sqlite.exec('ROLLBACK'))
afterAll(() => sqlite.close())

const logo = () => new File([Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+afoUAAAAASUVORK5CYII=', 'base64')], 'logo.png', { type: 'image/png' })
function form() {
  const data = new FormData()
  for (const [key, value] of Object.entries({ slug: 'alpha', name: 'Alpha Training', timezone: 'Europe/London', start: '08:30', end: '17:30', accent: '#543189' })) data.set(key, value)
  for (const day of [1, 2, 3, 4, 5]) data.append('days', String(day))
  return data
}
const settings = () => getCompanySettings({ data: { slug: 'alpha' } })

it('loads defaults, upserts settings for owners and admins, and returns branding to employees', async () => {
  expect(await settings()).toMatchObject({ name: 'alpha', timezone: 'UTC', workingHours: { days: [1, 2, 3, 4, 5], start: '09:00', end: '17:00' }, hasLogo: false })
  const input = form()
  input.set('logo', logo())
  await saveCompanySettings({ data: input })
  const key = state.bucket.put.mock.calls[0][0]
  expect(key).toMatch(/^org-logos\/org-a\//)
  expect(await settings()).toEqual({ slug: 'alpha', name: 'Alpha Training', timezone: 'Europe/London', workingHours: { days: [1, 2, 3, 4, 5], start: '08:30', end: '17:30' }, accent: '#543189', hasLogo: true, logoUrl: `/api/org/org-a/logo?v=${encodeURIComponent(key)}` })
  state.user = 'admin-a'
  input.delete('logo')
  input.set('timezone', 'America/New_York')
  await saveCompanySettings({ data: input })
  expect((await settings()).timezone).toBe('America/New_York')
  expect(sqlite.prepare('SELECT count(*) AS n FROM org_settings').get()).toEqual({ n: 1 })
  state.user = 'member-a'
  expect(await getCompanyBranding()).toEqual({ name: 'Alpha Training', accent: '#543189', logoUrl: `/api/org/org-a/logo?v=${encodeURIComponent(key)}` })
  state.user = 'personal'
  expect(await getCompanyBranding()).toBeNull()
  state.user = 'member-a'
  state.active = 'org-b'
  expect(await getCompanyBranding()).toBeNull()
})

it.each([['member-a', 403], ['owner-b', 403], ['personal', 403], [null, 401]] as const)('refuses settings reads and writes by %s', async (user, status) => {
  state.user = user
  const input = form()
  input.set('logo', logo())
  await expect(settings()).rejects.toMatchObject({ status })
  await expect(saveCompanySettings({ data: input })).rejects.toMatchObject({ status })
  expect(state.bucket.put).not.toHaveBeenCalled()
  expect(sqlite.prepare('SELECT count(*) AS n FROM org_settings').get()).toEqual({ n: 0 })
})

it('rejects unsafe uploads, inaccessible accents and invalid schedules before storage or writes', async () => {
  const cases: [string, string | File][] = [
    ['logo', new File(['<svg onload="alert(1)"></svg>'], 'logo.svg', { type: 'image/svg+xml' })],
    ['logo', new File(['<html>not a PNG</html>'], 'logo.png', { type: 'image/png' })],
    ['logo', new File([new Uint8Array(2 * 1024 * 1024 + 1)], 'large.png', { type: 'image/png' })],
    ['accent', '#ffffff'], ['accent', 'red; color: red'], ['timezone', 'Not/A_Zone'], ['end', '08:00'], ['days', '8'],
  ]
  for (const [key, value] of cases) {
    const input = form()
    input.set(key, value)
    await expect(saveCompanySettings({ data: input }), `${key}: ${typeof value === 'string' ? value : value.name}`).rejects.toMatchObject({ status: 400 })
  }
  expect(state.bucket.put).not.toHaveBeenCalled()
  expect(sqlite.prepare('SELECT count(*) AS n FROM org_settings').get()).toEqual({ n: 0 })
})

it('rejects a reserved green accent with the reason and ignores a stored one', async () => {
  const input = form()
  input.set('accent', '#1E7F4F')
  await expect(saveCompanySettings({ data: input })).rejects.toMatchObject({ status: 400, message: expect.stringContaining('Green and red are reserved for answer feedback.') })
  expect(sqlite.prepare('SELECT count(*) AS n FROM org_settings').get()).toEqual({ n: 0 })
  const seed = (accent: string) => sqlite.prepare('INSERT OR REPLACE INTO org_settings (org_id, company_name, timezone, working_hours_json, accent) VALUES (?, ?, ?, ?, ?)').run('org-a', 'Alpha Training', 'UTC', JSON.stringify({ days: [1], start: '09:00', end: '17:00' }), accent)
  seed('#1E7F4F')
  expect(await getCompanyBranding()).toMatchObject({ accent: null })
  seed('#543189')
  expect(await getCompanyBranding()).toMatchObject({ accent: '#543189' })
})

it('serves the saved logo only to company members and supports removal', async () => {
  const input = form()
  input.set('logo', logo())
  await saveCompanySettings({ data: input })
  const key = state.bucket.put.mock.calls[0][0]
  state.bucket.get.mockResolvedValue({ body: await logo().arrayBuffer(), httpMetadata: { contentType: 'image/png' } })
  state.user = 'member-a'
  const response = await serveCompanyLogo('org-a')
  expect(response.status).toBe(200)
  expect(response.headers.get('Content-Type')).toBe('image/png')
  expect(response.headers.get('Cache-Control')).toBe('private, no-store')
  expect(await response.arrayBuffer()).toEqual(await logo().arrayBuffer())
  state.bucket.get.mockClear()
  state.user = 'owner-b'
  expect((await serveCompanyLogo('org-a')).status).toBe(403)
  state.user = null
  expect((await serveCompanyLogo('org-a')).status).toBe(401)
  expect(state.bucket.get).not.toHaveBeenCalled()
  state.user = 'owner-a'
  input.delete('logo')
  input.set('removeLogo', 'on')
  input.set('accent', '')
  await saveCompanySettings({ data: input })
  expect(state.bucket.delete).toHaveBeenCalledWith(key)
  expect(await getCompanyBranding()).toEqual({ name: 'Alpha Training', logoUrl: null, accent: null })
  expect((await serveCompanyLogo('org-a')).status).toBe(404)
})

it('preserves existing settings when storage or the database fails during logo replacement', async () => {
  const input = form()
  input.set('logo', logo())
  await saveCompanySettings({ data: input })
  const oldKey = state.bucket.put.mock.calls[0][0]
  input.set('name', 'Unsaved name')
  state.bucket.put.mockRejectedValueOnce(new Error('Storage unavailable'))
  await expect(saveCompanySettings({ data: input })).rejects.toThrow('Storage unavailable')
  expect((await settings()).name).toBe('Alpha Training')
  expect(state.bucket.delete).not.toHaveBeenCalled()
  sqlite.exec("CREATE TEMP TRIGGER fail_company_update BEFORE UPDATE ON organization BEGIN SELECT RAISE(ABORT, 'Database unavailable'); END")
  try {
    await expect(saveCompanySettings({ data: input })).rejects.toThrow()
    const newKey = state.bucket.put.mock.calls.at(-1)![0]
    expect(state.bucket.delete).toHaveBeenCalledExactlyOnceWith(newKey)
    expect(sqlite.prepare('SELECT logo_key FROM org_settings WHERE org_id = ?').get('org-a')).toEqual({ logo_key: oldKey })
    expect((await settings()).name).toBe('Alpha Training')
  } finally { sqlite.exec('DROP TRIGGER fail_company_update') }
})
