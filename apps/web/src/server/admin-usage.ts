import { createServerFn } from '@tanstack/react-start'
import { and, desc, eq, gte, lt, sql, type SQL } from 'drizzle-orm'
import { z } from 'zod'
import { getDb } from '@/db'
import { organization } from '@/db/auth-schema'
import { modelCalls } from '@/db/schema'
import { requireStaff } from '@/server/authz'
import { httpError } from '@/server/helpers'

export type UsageStats = { calls: number; failures: number; p50: number | null; p95: number | null; cost: number | null; unpriced: number }
export type ModelUsage = {
  from: string; to: string; asOf: number
  totals: UsageStats
  days: (UsageStats & { day: string; partial: boolean })[]
  latency: { total: { p50: number | null; p95: number | null }; days: { day: string; partial: boolean; p50: number | null; p95: number | null }[] }
  jobs: (UsageStats & { purpose: string; model: string })[]
  companies: (UsageStats & { orgId: string | null; name: string | null; slug: string | null })[]
  failures: { id: string; createdAt: number; purpose: string; model: string; orgId: string | null; name: string | null; slug: string | null; error: string | null }[]
}

const DAY = 86_400_000
const dateOnly = z.object({ from: z.string(), to: z.string(), job: z.string().min(1).max(64).optional() })

function parseDay(value: string, label: string) {
  const ms = /^\d{4}-\d{2}-\d{2}$/.test(value) ? Date.parse(`${value}T00:00:00Z`) : NaN
  if (Number.isNaN(ms) || new Date(ms).toISOString().slice(0, 10) !== value) throw httpError(`${label} must be a valid date (YYYY-MM-DD)`, 400)
  return ms
}

// Pending placeholders are in-flight calls, not results. Failures are every other ok = 0 row.
const settled = sql`not (${modelCalls.ok} = 0 and coalesce(${modelCalls.error}, '') = 'pending')`

// Latency percentiles are nearest-rank, computed per group with window functions (portable to D1 and node:sqlite).
// `keys` maps output names to constant SQL expressions over model_calls that define the group.
// Returns the unexecuted query and a row mapper so every read can share one db.batch() snapshot.
function usageBy<K extends string>(db: ReturnType<typeof getDb>, start: number, end: number, keys: Record<K, SQL>, where?: SQL) {
  const names = Object.keys(keys) as K[]
  const partition = sql.join(Object.values(keys), sql`, `)
  const select = sql.join(names.map((name) => sql`${keys[name]} as ${sql.raw(name)}`), sql`, `)
  const inner = sql`select ${select}, ${modelCalls.latencyMs} as latency_ms, ${modelCalls.ok} as ok, ${modelCalls.costUsd} as cost_usd,
    row_number() over (partition by ${partition} order by ${modelCalls.latencyMs}) as rn, count(*) over (partition by ${partition}) as n
    from ${modelCalls} where ${modelCalls.createdAt} >= ${start} and ${modelCalls.createdAt} < ${end} and ${settled}${where ? sql` and ${where}` : sql``}`
  const aggregates = sql`count(*) as calls, sum(case when ok = 0 then 1 else 0 end) as failures,
    min(case when rn * 100 >= 50 * n then latency_ms end) as p50, min(case when rn * 100 >= 95 * n then latency_ms end) as p95,
    sum(cost_usd) as cost, sum(case when cost_usd is null then 1 else 0 end) as unpriced`
  const columns = [...names, 'calls', 'failures', 'p50', 'p95', 'cost', 'unpriced']
  const query = db.all<Record<string, unknown> | unknown[]>(sql`select ${sql.join(names.map((name) => sql.raw(name)), sql`, `)}, ${aggregates}
    from (${inner}) group by ${sql.join(names.map((name) => sql.raw(name)), sql`, `)}`)
  // D1 returns objects; the sqlite-proxy test driver returns positional arrays.
  const rows = (result: unknown) => (result as (Record<string, unknown> | unknown[])[])
    .map((row) => (Array.isArray(row) ? Object.fromEntries(columns.map((name, i) => [name, row[i]])) : row) as Row<K>)
  return { query, rows }
}
type Row<K extends string> = UsageStats & Record<K, string | null>

const empty: UsageStats = { calls: 0, failures: 0, p50: null, p95: null, cost: null, unpriced: 0 }
const stats = ({ calls, failures, p50, p95, cost, unpriced }: UsageStats): UsageStats => ({ calls, failures, p50, p95, cost, unpriced })

export const getModelUsage = createServerFn({ method: 'GET' })
  .validator(dateOnly)
  .handler(async ({ data }): Promise<ModelUsage> => {
    await requireStaff()
    const asOf = Date.now()
    const start = parseDay(data.from, 'from')
    const last = parseDay(data.to, 'to')
    const today = asOf - (asOf % DAY)
    if (start > last) throw httpError('from must not be after to', 400)
    if (last > today) throw httpError('to must not be in the future', 400)
    const span = (last - start) / DAY + 1
    if (span > 365) throw httpError('Range is limited to 365 days', 400)
    const end = last + DAY

    const db = getDb()
    const byDayKey = { day: sql`strftime('%Y-%m-%d', ${modelCalls.createdAt} / 1000, 'unixepoch')` }
    const jobOnly = sql`${modelCalls.purpose} = ${data.job ?? ''}`
    const totalsQ = usageBy(db, start, end, { k: sql`1` })
    const dayQ = usageBy(db, start, end, byDayKey)
    const jobsQ = usageBy(db, start, end, { purpose: sql`${modelCalls.purpose}`, model: sql`${modelCalls.model}` })
    const companiesQ = usageBy(db, start, end, {
      org_id: sql`${modelCalls.orgId}`,
      name: sql`(select ${organization.name} from ${organization} where ${organization.id} = ${modelCalls.orgId})`,
      slug: sql`(select ${organization.slug} from ${organization} where ${organization.id} = ${modelCalls.orgId})`,
    })
    const jobDayQ = usageBy(db, start, end, byDayKey, jobOnly)
    const jobTotalQ = usageBy(db, start, end, { k: sql`1` }, jobOnly)
    const failuresQ = db.select({ id: modelCalls.id, createdAt: modelCalls.createdAt, purpose: modelCalls.purpose, model: modelCalls.model, orgId: modelCalls.orgId,
      name: organization.name, slug: organization.slug, error: modelCalls.error })
      .from(modelCalls).leftJoin(organization, eq(organization.id, modelCalls.orgId))
      .where(and(gte(modelCalls.createdAt, start), lt(modelCalls.createdAt, end), eq(modelCalls.ok, false), sql`coalesce(${modelCalls.error}, '') <> 'pending'`))
      .orderBy(desc(modelCalls.createdAt), desc(modelCalls.id)).limit(50)
    // One batch is one D1 round trip read from one snapshot, so a pending call that settles mid-request
    // cannot be counted by some sections and missed by others.
    const [failures, ...usage] = await db.batch([failuresQ, totalsQ.query, dayQ.query, jobsQ.query, companiesQ.query,
      ...(data.job ? [jobDayQ.query, jobTotalQ.query] : [])])
    const totals = totalsQ.rows(usage[0])
    const dayRows = dayQ.rows(usage[1])
    const jobs = jobsQ.rows(usage[2])
    const companies = companiesQ.rows(usage[3])
    const jobDayRows = data.job ? jobDayQ.rows(usage[4]) : null
    const jobTotal = data.job ? jobTotalQ.rows(usage[5]) : null

    const byDay = new Map(dayRows.map((row) => [row.day as string, row]))
    const days = Array.from({ length: span }, (_, i) => {
      const day = new Date(start + i * DAY).toISOString().slice(0, 10)
      return { day, partial: start + i * DAY === today, ...stats(byDay.get(day) ?? empty) }
    })
    const byJobDay = jobDayRows && new Map(jobDayRows.map((row) => [row.day as string, row]))
    const latencyDays = days.map(({ day, partial, p50, p95 }) => ({ day, partial, ...(byJobDay ? { p50: byJobDay.get(day)?.p50 ?? null, p95: byJobDay.get(day)?.p95 ?? null } : { p50, p95 }) }))
    const { p50, p95 } = jobTotal ? (jobTotal[0] ?? empty) : (totals[0] ?? empty)
    const latency = { total: { p50, p95 }, days: latencyDays }
    return {
      from: data.from, to: data.to, asOf,
      totals: stats(totals[0] ?? empty),
      days,
      latency,
      jobs: jobs.map((row) => ({ purpose: row.purpose as string, model: row.model as string, ...stats(row) })).sort((a, b) => b.calls - a.calls),
      companies: companies.map((row) => ({ orgId: row.org_id as string | null, name: row.name as string | null, slug: row.slug as string | null, ...stats(row) }))
        .sort((a, b) => (b.cost ?? -1) - (a.cost ?? -1)),
      failures,
    }
  })
