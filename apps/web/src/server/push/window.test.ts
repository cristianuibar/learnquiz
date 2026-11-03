import { readFileSync, readdirSync } from 'node:fs'
import { DatabaseSync } from 'node:sqlite'
import { drizzle } from 'drizzle-orm/sqlite-proxy'
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it } from 'vitest'
import type { Db } from '@/db'
import { capPolicy, effectiveWindow, inWindow, pushContext } from './window'

const company = { timezone: 'Europe/London', workingHours: { days: [1, 2, 3, 4, 5], start: '09:00', end: '17:00' } }
const weekdays = [1, 2, 3, 4, 5]
const prefs = (startMinute: number, endMinute: number) => ({ startMinute, endMinute, timezone: 'Asia/Tokyo' })
const win = (startMinute: number, endMinute: number, source: 'learner' | 'company') => ({ startMinute, endMinute, days: weekdays, timezone: 'Europe/London', source })

describe('effectiveWindow', () => {
  it.each([
    ['member without prefs', company, null, win(540, 1020, 'company')],
    ['narrower prefs win', company, prefs(600, 960), win(600, 960, 'learner')],
    ['wider prefs are clamped', company, prefs(420, 1140), win(540, 1020, 'company')],
    ['partial overlap', company, prefs(480, 720), win(540, 720, 'learner')],
    ['disjoint falls back to the company', company, prefs(1100, 1200), win(540, 1020, 'company')],
    ['non-member with prefs', null, prefs(480, 600), { startMinute: 480, endMinute: 600, days: weekdays, timezone: 'Asia/Tokyo', source: 'learner' }],
    ['non-member default', null, null, { startMinute: 540, endMinute: 1020, days: weekdays, timezone: 'UTC', source: 'default' }],
  ] as const)('%s', (_name, c, p, expected) => {
    expect(effectiveWindow(c as never, p as never)).toEqual(expected)
  })
})

describe('inWindow', () => {
  const utc = { startMinute: 540, endMinute: 1020, days: weekdays, timezone: 'UTC', source: 'default' as const }
  const newYork = { ...utc, timezone: 'America/New_York' }
  it.each([
    ['inside', utc, '2026-11-02T12:00:00Z', true],
    ['at start', utc, '2026-11-02T09:00:00Z', true],
    ['before start', utc, '2026-11-02T08:59:00Z', false],
    ['at end is exclusive', utc, '2026-11-02T17:00:00Z', false],
    ['weekend excluded', utc, '2026-11-07T12:00:00Z', false],
    ['New York after DST ends, 14:00Z is 09:00', newYork, '2026-11-02T14:00:00Z', true],
    ['New York, 13:59Z is 08:59', newYork, '2026-11-02T13:59:00Z', false],
    ['New York, 22:00Z is 17:00', newYork, '2026-11-02T22:00:00Z', false],
    ['New York, Saturday 03:00Z is still Friday 23:00 (local weekday)', { ...newYork, endMinute: 1439 }, '2026-11-07T04:00:00Z', true],
  ] as const)('%s', (_name, w, at, expected) => {
    expect(inWindow(w, Date.parse(at))).toBe(expected)
  })
})

describe('capPolicy', () => {
  const day = 86_400_000
  const assignedAt = Date.parse('2026-10-01T00:00:00Z')
  const role = { assignedAt, onboardingDays: 30, proficientAt: null }
  it.each([
    ['day 1', role, assignedAt, 6, 'onboarding'],
    ['last onboarding ms', role, assignedAt + 30 * day - 1, 6, 'onboarding'],
    ['after 30 days', role, assignedAt + 30 * day, 3, 'steady'],
    ['proficient within 30 days', { ...role, proficientAt: assignedAt + day }, assignedAt + 2 * day, 3, 'steady'],
    ['no role', null, assignedAt, 3, 'steady'],
  ] as const)('%s', (_name, r, now, dailyCap, phase) => {
    expect(capPolicy(r, now)).toEqual({ dailyCap, steadyCap: 3, phase })
  })
})

describe('pushContext', () => {
  let raw: DatabaseSync
  let db: Db
  const run = (sql: string, ...args: (string | number | null)[]) => raw.prepare(sql).run(...args)
  const hours = JSON.stringify({ days: [1, 2, 3], start: '08:00', end: '16:00' })
  const addOrg = (id: string, createdAt: number) => {
    run('INSERT INTO organization (id, name, slug, created_at) VALUES (?, ?, ?, 0)', id, id, id)
    run('INSERT INTO member (id, organization_id, user_id, created_at) VALUES (?, ?, ?, ?)', `m-${id}`, id, 'u1', createdAt)
  }
  const addSettings = (org: string) => run('INSERT INTO org_settings (org_id, company_name, timezone, working_hours_json) VALUES (?, ?, ?, ?)', org, org, 'Asia/Tokyo', hours)
  const addRole = (id: string, org: string, status: string, assignedAt: number) => {
    run('INSERT INTO job_roles (id, org_id, name, onboarding_days, status, created_at) VALUES (?, ?, ?, 14, ?, 0)', id, org, id, status)
    run('INSERT INTO member_role_assignments (user_id, org_id, job_role_id, assigned_at, proficient_at) VALUES (?, ?, ?, ?, 99)', 'u1', org, id, assignedAt)
  }

  beforeAll(() => {
    raw = new DatabaseSync(':memory:')
    for (const file of readdirSync('drizzle').filter((f) => f.endsWith('.sql')).sort()) {
      raw.exec(readFileSync(`drizzle/${file}`, 'utf8').replaceAll('--> statement-breakpoint', ''))
    }
    run('INSERT INTO user (id, name, email) VALUES (?, ?, ?)', 'u1', 'u1', 'u1@example.test')
    db = drizzle(async (sql, params, method) => {
      const stmt = raw.prepare(sql)
      stmt.setReturnArrays(true)
      const args = params as (string | number | null)[]
      if (method === 'run') { stmt.run(...args); return { rows: [] } }
      return { rows: (method === 'get' ? stmt.get(...args) : stmt.all(...args)) as never }
    }) as unknown as Db
  })
  beforeEach(() => { raw.exec('BEGIN') })
  afterEach(() => { raw.exec('ROLLBACK') })
  afterAll(() => raw.close())

  it('returns nothing for a non-member', async () => {
    expect(await pushContext(db, 'u1')).toEqual({ company: null, role: null })
  })

  it('defaults a member without org_settings to UTC office hours', async () => {
    addOrg('o1', 1)
    expect(await pushContext(db, 'u1')).toEqual({
      company: { timezone: 'UTC', workingHours: { days: [1, 2, 3, 4, 5], start: '09:00', end: '17:00' } },
      role: null,
    })
  })

  it('reads org_settings and the active role assignment', async () => {
    addOrg('o1', 1)
    addSettings('o1')
    addRole('r1', 'o1', 'active', 1000)
    expect(await pushContext(db, 'u1')).toEqual({
      company: { timezone: 'Asia/Tokyo', workingHours: { days: [1, 2, 3], start: '08:00', end: '16:00' } },
      role: { assignedAt: 1000, onboardingDays: 14, proficientAt: 99 },
    })
  })

  it('has no role when the assigned role is archived', async () => {
    addOrg('o1', 1)
    addSettings('o1')
    addRole('r1', 'o1', 'archived', 1000)
    expect((await pushContext(db, 'u1')).role).toBeNull()
  })

  it('prefers the org of the newest active assignment over the earliest membership', async () => {
    addOrg('o1', 1)
    addOrg('o2', 2)
    addSettings('o2')
    addRole('r2', 'o2', 'active', 5000)
    expect(await pushContext(db, 'u1')).toMatchObject({ company: { timezone: 'Asia/Tokyo' }, role: { assignedAt: 5000 } })
  })
})
