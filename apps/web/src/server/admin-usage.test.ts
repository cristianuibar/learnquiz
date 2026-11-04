import { readFileSync, readdirSync } from 'node:fs'
import { DatabaseSync } from 'node:sqlite'
import { drizzle } from 'drizzle-orm/d1'
import { afterAll, afterEach, beforeAll, beforeEach, expect, it, vi } from 'vitest'
import { z } from 'zod'
import { dbSchema } from '@/db'
import { getAuth } from '@/server/auth'
import { getModelUsage } from './admin-usage'

const boundary = vi.hoisted(() => ({ db: null as unknown, concurrentWrite: null as (() => void) | null, headers: new Headers(), status: 200, background: [] as unknown[] }))

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
  runInBackground: (task: unknown) => { boundary.background.push(task) },
}))
// The queue itself is covered by concept-gen.test.ts; here only the wake-up is observed.
vi.mock('@/server/concept-gen', () => ({ drainConceptQueue: async () => 'drained' }))

let sqlite: DatabaseSync
const accounts = new Map<string, { id: string; cookie: string; password: string }>()
const NOW = new Date('2026-11-02T12:00:00Z').getTime()
const DAY = 86_400_000

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
  // A minimal D1 binding over node:sqlite, so the real drizzle-orm/d1 session (including batch binding) runs.
  // A concurrent writer lands between round trips that read model_calls, as another Worker could on D1.
  const afterUsageRead = (query: string) => {
    if (!query.includes('model_calls')) return
    const write = boundary.concurrentWrite
    boundary.concurrentWrite = null
    write?.()
  }
  type Statement = { sql: string; params: unknown[] }
  const read = ({ sql, params }: Statement, arrays: boolean) => {
    const statement = sqlite.prepare(sql)
    statement.setReturnArrays(arrays)
    return statement.all(...params as never[])
  }
  const exec = (stmt: Statement) => ({ results: read(stmt, false), success: true, meta: {} })
  const statement = (stmt: Statement) => ({
    ...stmt,
    bind: (...params: unknown[]) => statement({ sql: stmt.sql, params }),
    all: async () => { const result = exec(stmt); afterUsageRead(stmt.sql); return result },
    run: async () => { const result = exec(stmt); afterUsageRead(stmt.sql); return result },
    first: async () => { const [row] = read(stmt, false); afterUsageRead(stmt.sql); return row ?? null },
    raw: async () => { const rows = read(stmt, true); afterUsageRead(stmt.sql); return rows },
  })
  const d1 = {
    prepare: (sql: string) => statement({ sql, params: [] }),
    // A D1 batch runs as one implicit transaction, so every statement reads the same snapshot.
    batch: async (statements: Statement[]) => {
      sqlite.exec('BEGIN')
      const results = statements.map(exec)
      sqlite.exec('COMMIT')
      statements.forEach((stmt) => afterUsageRead(stmt.sql))
      return results
    },
  }
  boundary.db = drizzle(d1 as never, { schema: dbSchema })

  for (const name of ['staff', 'learner']) {
    const password = crypto.randomUUID()
    const response = await authRequest('sign-up/email', { name, email: `${name}@usage.test`, password })
    expect(response.status).toBe(200)
    const { user } = await response.json() as { user: { id: string } }
    const cookie = response.headers.getSetCookie().map((value) => value.split(';')[0]).join('; ')
    accounts.set(name, { id: user.id, cookie, password })
  }
  sqlite.prepare("UPDATE user SET role = 'admin' WHERE id = ?").run(accounts.get('staff')!.id)
  for (const id of ['alpha', 'beta']) sqlite.prepare('INSERT INTO organization (id, name, slug, created_at) VALUES (?, ?, ?, ?)').run(id, `${id} Co`, id, NOW)

  const learner = accounts.get('learner')!.id
  // id, org, purpose, latency, cost, ok, error, createdAt
  const rows: [string, string | null, string, number, number | null, number, string | null, number][] = [
    ['a1', 'alpha', 'items', 100, 0.1, 1, null, NOW - 3 * DAY],
    ['a2', 'alpha', 'items', 200, 0.2, 1, null, NOW - 2 * DAY],
    ['a3', 'alpha', 'items', 300, 0.3, 1, null, NOW],
    ['a4', 'alpha', 'grade', 400, 0.4, 1, null, NOW],
    ['b1', 'beta', 'items', 50, 0.7, 1, null, NOW - 2 * DAY],
    ['b2', 'beta', 'items', 700, null, 0, 'upstream boom', NOW - 1000],
    ['n1', null, 'grade', 10, 0.5, 1, null, NOW - DAY],
    ['p1', 'alpha', 'items', 9999, null, 0, 'pending', NOW],
    ['old', 'alpha', 'items', 5, 100, 1, null, NOW - 40 * DAY],
  ]
  for (const [id, org, purpose, latency, cost, ok, error, createdAt] of rows) {
    sqlite.prepare('INSERT INTO model_calls (id, learner_id, org_id, purpose, model, latency_ms, cost_usd, ok, error, created_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)')
      .run(id, learner, org, purpose, 'm1', latency, cost, ok, error, createdAt)
  }
})

beforeEach(() => {
  boundary.headers = new Headers({ cookie: accounts.get('staff')!.cookie })
  vi.useFakeTimers({ toFake: ['Date'] })
  vi.setSystemTime(NOW)
})
afterEach(() => { vi.useRealTimers() })
afterAll(() => sqlite.close())

const range = { from: '2026-10-20', to: '2026-11-02' }

it('aggregates settled calls for staff and agrees with a direct SQL sum', async () => {
  const usage = await getModelUsage({ data: range })
  const direct = sqlite.prepare(`SELECT count(*) AS calls, sum(cost_usd) AS cost, sum(cost_usd IS NULL) AS unpriced FROM model_calls
    WHERE created_at >= ? AND created_at < ? AND NOT (ok = 0 AND error = 'pending')`).get(Date.parse('2026-10-20T00:00:00Z'), Date.parse('2026-11-03T00:00:00Z')) as { calls: number; cost: number; unpriced: number }
  expect(direct.calls).toBe(7)
  expect(usage.totals.calls).toBe(direct.calls)
  expect(usage.totals.cost).toBeCloseTo(direct.cost, 10)
  expect(usage.totals.cost).toBeCloseTo(2.2, 10)
  expect(usage.totals.unpriced).toBe(1)
  expect(usage.totals.failures).toBe(1)
  expect(usage.asOf).toBe(NOW)
  expect(usage.companies.reduce((sum, c) => sum + c.calls, 0)).toBe(7)
  expect(usage.jobs.reduce((sum, j) => sum + j.calls, 0)).toBe(7)
  expect(usage.days.reduce((sum, d) => sum + d.calls, 0)).toBe(7)
  expect(usage.days).toHaveLength(14)
  expect(usage.days.at(-1)).toMatchObject({ day: '2026-11-02', partial: true, calls: 3 })
  expect(usage.days[0]).toMatchObject({ day: '2026-10-20', partial: false, calls: 0, p50: null, cost: null })

  expect(usage.companies.map((c) => [c.orgId, c.name, c.slug, c.calls])).toEqual([['alpha', 'alpha Co', 'alpha', 4], ['beta', 'beta Co', 'beta', 2], [null, null, null, 1]])
  const alpha = usage.companies.find((c) => c.orgId === 'alpha')!
  expect(alpha).toMatchObject({ calls: 4, p50: 200, p95: 400, unpriced: 0 })
  expect(alpha.cost).toBeCloseTo(1, 10)
  expect(usage.companies.find((c) => c.orgId === null)).toMatchObject({ name: null, slug: null, calls: 1, p50: 10, p95: 10 })
  expect(usage.companies.find((c) => c.orgId === 'beta')).toMatchObject({ calls: 2, failures: 1, unpriced: 1, p50: 50, p95: 700 })
  expect(usage.jobs[0]).toMatchObject({ purpose: 'items', model: 'm1', calls: 5 })
  expect(usage.failures).toEqual([{ id: 'b2', createdAt: NOW - 1000, purpose: 'items', model: 'm1', orgId: 'beta', name: 'beta Co', slug: 'beta', error: 'upstream boom' }])
})

it('reads every section from one snapshot when a pending call settles mid-request', async () => {
  boundary.concurrentWrite = () => sqlite.prepare("UPDATE model_calls SET ok = 1, error = NULL, cost_usd = 0.05 WHERE id = 'p1'").run()
  try {
    const usage = await getModelUsage({ data: range })
    expect(boundary.concurrentWrite).toBeNull()
    expect(usage.totals.calls).toBe(7)
    expect(usage.companies.reduce((sum, c) => sum + c.calls, 0)).toBe(usage.totals.calls)
    expect(usage.jobs.reduce((sum, j) => sum + j.calls, 0)).toBe(usage.totals.calls)
    expect(usage.days.reduce((sum, d) => sum + d.calls, 0)).toBe(usage.totals.calls)
    expect((await getModelUsage({ data: range })).totals.calls).toBe(8)
  } finally {
    boundary.concurrentWrite = null
    sqlite.prepare("UPDATE model_calls SET ok = 0, error = 'pending', cost_usd = NULL WHERE id = 'p1'").run()
  }
})

it('returns a per-day latency series, filtered to one job when given', async () => {
  const all = await getModelUsage({ data: range })
  expect(all.latency.days.map((d) => [d.day, d.partial, d.p50, d.p95])).toEqual(all.days.map((d) => [d.day, d.partial, d.p50, d.p95]))
  const grade = await getModelUsage({ data: { ...range, job: 'grade' } })
  expect(all.latency.total).toEqual({ p50: all.totals.p50, p95: all.totals.p95 })
  expect(grade.latency.total).toEqual({ p50: 10, p95: 400 })
  expect(grade.latency.days).toHaveLength(grade.days.length)
  expect(grade.latency.days.filter((d) => d.p95 !== null).map((d) => [d.day, d.p50, d.p95])).toEqual([['2026-11-01', 10, 10], ['2026-11-02', 400, 400]])
  expect(grade.latency.days.filter((d) => d.p95 === null).every((d) => d.p50 === null)).toBe(true)
  expect(grade.days).toEqual(all.days)
  expect(grade.totals).toEqual(all.totals)
})

it('refuses non-staff', async () => {
  boundary.headers = new Headers({ cookie: accounts.get('learner')!.cookie })
  await expect(getModelUsage({ data: range })).rejects.toMatchObject({ status: 403, message: 'Staff only' })
})

it('rejects invalid ranges with 400', async () => {
  for (const data of [
    { from: '2026-11-01', to: '2026-11-03' },
    { from: '2025-10-01', to: '2026-11-02' },
    { from: '2026-11-02', to: '2026-11-01' },
    { from: '2026-02-30', to: '2026-03-01' },
  ]) await expect(getModelUsage({ data })).rejects.toMatchObject({ status: 400 })
})
