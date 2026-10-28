import { readFileSync, readdirSync } from 'node:fs'
import { DatabaseSync } from 'node:sqlite'
import { drizzle } from 'drizzle-orm/sqlite-proxy'
import { beforeAll, expect, it, vi } from 'vitest'
import type { Db } from '@/db'
import * as authSchema from '@/db/auth-schema'
import { getSessionUser } from '@/server/session'
import { checkMembership, requireStaff } from './authz'

vi.mock('@/server/env', () => ({})) // cloudflare:workers does not exist under vitest
vi.mock('@/server/session', () => ({ getSessionUser: vi.fn() }))

let db: Db
beforeAll(() => {
  const sqlite = new DatabaseSync(':memory:')
  for (const file of readdirSync('drizzle').filter((f) => f.endsWith('.sql')).sort()) {
    sqlite.exec(readFileSync(`drizzle/${file}`, 'utf8').replaceAll('--> statement-breakpoint', ''))
  }
  const now = Date.now()
  for (const id of ['owner-a', 'admin-a', 'member-a', 'owner-b', 'stranger']) {
    sqlite.prepare('INSERT INTO user (id, name, email) VALUES (?, ?, ?)').run(id, id, `${id}@x.test`)
  }
  for (const [id, slug] of [['org-a', 'alpha'], ['org-b', 'beta']]) {
    sqlite.prepare('INSERT INTO organization (id, name, slug, created_at) VALUES (?, ?, ?, ?)').run(id, slug, slug, now)
  }
  for (const [user, org, role] of [['owner-a', 'org-a', 'owner'], ['admin-a', 'org-a', 'admin'], ['member-a', 'org-a', 'member'], ['owner-b', 'org-b', 'owner']]) {
    sqlite.prepare('INSERT INTO member (id, organization_id, user_id, role, created_at) VALUES (?, ?, ?, ?, ?)').run(`${user}-${org}`, org, user, role, now)
  }
  db = drizzle(
    async (sql, params, method) => {
      const stmt = sqlite.prepare(sql)
      stmt.setReturnArrays(true)
      if (method === 'run') return { rows: [] }
      // `get` wants one row array, or nothing when none matched.
      return { rows: (method === 'get' ? stmt.get(...params) : stmt.all(...params)) as never }
    },
    { schema: authSchema },
  ) as unknown as Db
})

it.each([
  ['owner-a', 'alpha', true, true],
  ['admin-a', 'org-a', true, true],
  ['member-a', 'alpha', false, true],
  ['member-a', 'alpha', true, false], // a plain member is not a company admin
  ['owner-a', 'beta', false, false], // another company's slug
  ['owner-a', 'org-b', true, false], // another company's id
  ['stranger', 'alpha', false, false],
])('%s asking for %s (adminOnly %s) is allowed: %s', async (userId, org, adminOnly, allowed) => {
  const result = checkMembership(db, userId, org, adminOnly)
  if (allowed) await expect(result).resolves.toMatchObject({ org: { id: expect.stringMatching(/^org-/) } })
  else await expect(result).rejects.toMatchObject({ status: 403 })
})

it.each([
  [null, 401],
  [{ role: 'user' }, 403],
  [{ role: null }, 403],
])('requireStaff refuses %j with %s', async (user, status) => {
  vi.mocked(getSessionUser).mockResolvedValue(user as never)
  await expect(requireStaff()).rejects.toMatchObject({ status })
})

it('requireStaff lets the admin role through', async () => {
  vi.mocked(getSessionUser).mockResolvedValue({ role: 'admin' } as never)
  await expect(requireStaff()).resolves.toMatchObject({ role: 'admin' })
})
