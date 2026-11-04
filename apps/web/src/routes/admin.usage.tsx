import { useId, useRef, useState } from 'react'
import { Link, createFileRoute } from '@tanstack/react-router'
import { z } from 'zod'
import { Page, PageHeader } from '@/components/admin/page'
import { BarChart } from '@/components/admin/charts/bar-chart'
import { LineChart } from '@/components/admin/charts/line-chart'
import { DateRange } from '@/components/admin/date-range'
import { Pager } from '@/components/admin/pager'
import { Stat, StatsCard } from '@/components/admin/stat-figure'
import { DataTable, NullCell, type Column, type SortDirection } from '@/components/admin/data-table'
import { InlineError, RouteError, errorMessage } from '@/components/inline-error'
import { Label } from '@/components/ui/label'
import { Segmented } from '@/components/ui/segmented'
import { Select } from '@/components/ui/select'
import { jobLabel, modelDisplayName } from '@/lib/llm/models'
import { getModelUsage, type ModelUsage, type UsageStats } from '@/server/admin-usage'

const DAY = 86_400_000
const PAGE_SIZE = 25
const RANGES = [7, 30, 90] as const
type Range = (typeof RANGES)[number]
type Company = ModelUsage['companies'][number]
type Failure = ModelUsage['failures'][number]
type Job = ModelUsage['jobs'][number]

const MAX_DAYS = 365
const isoDay = (ms: number) => new Date(ms).toISOString().slice(0, 10)
const today = () => isoDay(Date.now())
const validDay = (v: string | undefined): v is string => !!v && /^\d{4}-\d{2}-\d{2}$/.test(v) && isoDay(Date.parse(`${v}T00:00:00Z`) || 0) === v

const searchSchema = z.object({
  range: z.union([z.literal(7), z.literal(30), z.literal(90)]).catch(30),
  from: z.string().optional().catch(undefined),
  to: z.string().optional().catch(undefined),
})
type Search = { range: Range; from?: string; to?: string }

// A custom range needs both ends as UTC days, in order, not after today and at most 365 days; anything else falls back to 30 days.
function validateSearch(raw: Record<string, unknown>): Search {
  const { range, from, to } = searchSchema.parse(raw)
  if (from === undefined && to === undefined) return { range }
  if (!validDay(from) || !validDay(to) || from > to || to > today() || (dayMs(to) - dayMs(from)) / DAY + 1 > MAX_DAYS) return { range: 30, from: undefined, to: undefined }
  return { range, from, to }
}

export const Route = createFileRoute('/admin/usage')({
  validateSearch,
  loaderDeps: ({ search }) => ({ range: search.range, from: search.from, to: search.to }),
  loader: ({ deps }) => {
    const to = deps.to ?? today()
    const from = deps.from ?? isoDay(dayMs(to) - (deps.range - 1) * DAY)
    return getModelUsage({ data: { from, to } })
  },
  errorComponent: RouteError,
  component: Usage,
})

const dayMs = (day: string) => Date.parse(`${day}T00:00:00Z`)
const monthDay = (ms: number) => new Date(ms).toLocaleDateString('en-US', { month: 'short', day: 'numeric', timeZone: 'UTC' })
const hhmm = (ms: number) => new Date(ms).toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit', hour12: false, timeZone: 'UTC' })
const stamp = (ms: number) => `${monthDay(ms)}, ${new Date(ms).toLocaleTimeString('en-GB', { hour12: false, timeZone: 'UTC' })}`
const count = (n: number) => n.toLocaleString('en-US')
const rate = (s: UsageStats) => (s.calls === 0 ? null : (s.failures / s.calls) * 100)
const seconds = (ms: number) => `${(ms / 1000).toFixed(1)} s`
const money = (n: number) => `$${n.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`

const rateText = (s: UsageStats) => {
  const r = rate(s)
  return r === null ? 'No calls' : `${r.toFixed(1)}%`
}
const percent = (n: number) => `${Number(n.toFixed(1))}%`
const dollars = (n: number) => (Number.isInteger(n) ? `$${count(n)}` : money(n))
const secs = (n: number) => `${Number(n.toFixed(1))} s`
const latencyText = (v: number | null) => (v === null ? 'No calls' : seconds(v))

const rateCell = (s: UsageStats) => {
  const r = rate(s)
  return r === null ? <NullCell label="No calls" /> : `${r.toFixed(1)}%`
}
const latency = (v: number | null) => (v === null ? <NullCell label="No calls" /> : seconds(v))
const cost = (s: UsageStats) => (s.cost === null ? <NullCell label="No price yet" /> : money(s.cost))

function CompanyLink({ name, slug }: { name: string | null; slug: string | null }) {
  if (!slug) return <>No company</>
  return <Link to="/admin/companies/$slug" params={{ slug }} className="rounded-sm underline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-brand">{name ?? slug}</Link>
}

const companyLabel = (c: Company) => c.name ?? 'No company'
const sortValue = (c: Company, key: string): number | string => {
  switch (key) {
    case 'company': return companyLabel(c).toLowerCase()
    case 'calls': return c.calls
    case 'failures': return c.failures
    case 'rate': return rate(c) ?? -1
    case 'p95': return c.p95 ?? -1
    default: return c.cost ?? -1
  }
}

function Usage() {
  const data = Route.useLoaderData()
  const { range, from: customFrom } = Route.useSearch()
  const navigate = Route.useNavigate()
  const jobId = useId()
  // The job filter only refetches the latency series; it belongs to the loaded range and resets with it.
  const [job, setJob] = useState<{ data: ModelUsage; purpose: string; latency: ModelUsage['latency']; error?: string } | null>(null)
  const jobRequest = useRef(0)
  const [sort, setSort] = useState<{ key: string; direction: SortDirection }>({ key: 'cost', direction: 'descending' })
  // The failures page also belongs to the loaded range, so any range change (presets, picker, Back/Forward) starts on page 1.
  const [paged, setPaged] = useState<{ data: ModelUsage; page: number } | null>(null)
  const page = paged?.data === data ? paged.page : 1

  const fromMs = dayMs(data.from)
  const toMs = dayMs(data.to)
  const year = new Date(toMs).getUTCFullYear()
  const span = `${monthDay(fromMs)} – ${monthDay(toMs)}, ${year}`
  const spanWords = `${monthDay(fromMs)} to ${monthDay(toMs)}, ${year}`
  const isPartial = data.days.at(-1)?.partial === true
  const partial = isPartial ? `${monthDay(toMs)} counts up to ${hhmm(data.asOf)}.` : ''
  const { totals } = data
  const dayCount = `${data.days.length} ${data.days.length === 1 ? 'day' : 'days'}`
  const dayLabel = (d: { day: string; partial: boolean }) => `${monthDay(dayMs(d.day))}${d.partial ? ` (to ${hhmm(data.asOf)})` : ''}`
  const partialClause = isPartial ? `; ${monthDay(toMs)} is partial, through ${hhmm(data.asOf)}` : ''

  const current = job?.data === data ? job : null
  const series = current?.latency ?? data.latency
  const purposes = [...new Set(data.jobs.map((j) => j.purpose))]
  const loadJob = (purpose: string) => {
    const id = ++jobRequest.current
    if (!purpose) return setJob(null)
    setJob({ data, purpose, latency: series })
    getModelUsage({ data: { from: data.from, to: data.to, job: purpose } }).then(
      (r) => { if (id === jobRequest.current) setJob({ data, purpose, latency: r.latency }) },
      (err: unknown) => { if (id === jobRequest.current) setJob({ data, purpose, latency: series, error: errorMessage(err) }) },
    )
  }

  // One sentence per chart; the hidden tables carry every number.
  const busiest = (values: number[]) => values.reduce((best, v, i) => (!data.days[i].partial && (best < 0 || v > values[best]) ? i : best), -1)
  const rangeOf = (values: number[], fmt: (n: number) => string) => {
    const full = values.filter((_, i) => !data.days[i].partial)
    return full.length === 0 ? '' : `${fmt(Math.min(...full))} to ${fmt(Math.max(...full))}`
  }
  const dayRate = (d: UsageStats) => rate(d) ?? 0
  const callsPeak = busiest(data.days.map((d) => d.calls))
  const costPeak = busiest(data.days.map((d) => d.cost ?? 0))
  const last = data.days.at(-1)
  const callsSummary = totals.calls === 0
    ? `Bar chart of model calls per day from ${spanWords}: no calls in this range.`
    : `Bar chart of model calls per day from ${spanWords}, with failure rate below: ${rangeOf(data.days.map((d) => d.calls), count)} calls a day`
      + (callsPeak >= 0 ? `, highest on ${monthDay(dayMs(data.days[callsPeak].day))} with ${count(data.days[callsPeak].calls)} calls and a ${percent(dayRate(data.days[callsPeak]))} failure rate` : '')
      + (isPartial && last ? `${partialClause}, at ${percent(dayRate(last))}.` : '.')
  const costSummary = totals.calls === 0
    ? `Bar chart of model cost per day from ${spanWords}: no calls in this range.`
    : `Bar chart of model cost per day from ${spanWords}: ${rangeOf(data.days.map((d) => d.cost ?? 0), money)} a day`
      + (costPeak >= 0 ? `, highest on ${monthDay(dayMs(data.days[costPeak].day))} at ${money(data.days[costPeak].cost ?? 0)}` : '')
      + (isPartial && last ? `${partialClause}, at ${money(last.cost ?? 0)}.` : '.')
  const jobName = current?.purpose ? jobLabel(current.purpose) : 'all jobs'
  const between = (key: 'p50' | 'p95') => {
    const v = series.days.flatMap((d) => (d[key] === null ? [] : [d[key] / 1000]))
    return `${Number(Math.min(...v).toFixed(1))} and ${Number(Math.max(...v).toFixed(1))} seconds`
  }
  const latencySummary = series.days.every((d) => d.p50 === null)
    ? `Line chart of daily model latency for ${jobName} from ${spanWords}: no calls in this range.`
    : `Line chart of daily model latency for ${jobName} from ${spanWords}: p50 stayed between ${between('p50')} and p95 between ${between('p95')}${partialClause}.`

  const companies = [...data.companies].sort((a, b) => {
    const x = sortValue(a, sort.key)
    const y = sortValue(b, sort.key)
    const d = typeof x === 'string' ? x.localeCompare(y as string) : x - (y as number)
    return sort.direction === 'ascending' ? d : -d
  })
  const onSort = (key: string) =>
    setSort((s) => (s.key === key ? { key, direction: s.direction === 'ascending' ? 'descending' : 'ascending' } : { key, direction: key === 'company' ? 'ascending' : 'descending' }))

  const jobColumns: Column<Job>[] = [
    { key: 'job', header: 'Job', cell: (r) => jobLabel(r.purpose) },
    {
      key: 'model',
      header: 'Model',
      cell: (r) => (
        <>
          <span className="block">{modelDisplayName(r.model)}</span>
          <span className="block font-mono text-[12px]/[16px] font-normal text-ink-muted">{r.model}</span>
        </>
      ),
    },
    { key: 'calls', header: 'Calls', align: 'end', cell: (r) => count(r.calls) },
    { key: 'failures', header: 'Failures', align: 'end', cell: (r) => count(r.failures) },
    { key: 'rate', header: 'Failure rate', align: 'end', cell: rateCell },
    { key: 'p50', header: 'p50', align: 'end', cell: (r) => latency(r.p50) },
    { key: 'p95', header: 'p95', align: 'end', cell: (r) => latency(r.p95) },
    { key: 'cost', header: 'Cost', align: 'end', cell: cost },
  ]

  const companyColumns: Column<Company>[] = [
    { key: 'company', header: 'Company', sortable: true, sortOrder: { ascending: 'A to Z', descending: 'Z to A' }, cell: (c) => <CompanyLink name={c.name} slug={c.slug} /> },
    { key: 'calls', header: 'Calls', align: 'end', sortable: true, cell: (c) => count(c.calls) },
    { key: 'failures', header: 'Failures', align: 'end', sortable: true, cell: (c) => count(c.failures) },
    { key: 'rate', header: 'Failure rate', label: 'Failure rate', align: 'end', sortable: true, cell: rateCell },
    { key: 'p95', header: 'p95', align: 'end', sortable: true, sortOrder: { ascending: 'fastest first', descending: 'slowest first' }, cell: (c) => latency(c.p95) },
    { key: 'cost', header: 'Cost', align: 'end', sortable: true, sortOrder: { ascending: 'lowest first', descending: 'highest first' }, cell: cost },
  ]

  const failureColumns: Column<Failure>[] = [
    { key: 'time', header: 'Time', className: 'whitespace-nowrap', cell: (f) => stamp(f.createdAt) },
    { key: 'job', header: 'Job', cell: (f) => jobLabel(f.purpose) },
    { key: 'model', header: 'Model', cell: (f) => modelDisplayName(f.model) },
    { key: 'company', header: 'Company', cell: (f) => <CompanyLink name={f.name} slug={f.slug} /> },
    { key: 'error', header: 'Error', cell: (f) => f.error ? <span className="rounded-sm bg-surface-sunken px-1.5 py-0.5 font-mono text-[13px]/[18px] break-words text-ink">{f.error}</span> : <NullCell label="No error recorded" /> },
  ]

  const start = (page - 1) * PAGE_SIZE
  const shown = data.failures.slice(start, start + PAGE_SIZE)
  const lastShown = start + shown.length

  return (
    <Page>
      <PageHeader
        title="Model usage"
        meta={`${span} · ${isPartial ? `${monthDay(toMs)} to ${hhmm(data.asOf)} · ` : ''}times in UTC`}
        actions={
          <div role="group" aria-label="Date range" className="flex flex-wrap items-center gap-3">
            <Segmented
              mode="toggle"
              aria-label="Preset ranges"
              options={RANGES.map((r) => ({ value: String(r), label: `${r} days` }))}
              value={customFrom ? [] : [String(range)]}
              onValueChange={(next) => {
                const added = customFrom ? next[0] : next.find((v) => v !== String(range))
                if (!added) return
                void navigate({ search: { range: Number(added) as Range } })
              }}
            />
            <DateRange
              from={data.from}
              to={data.to}
              max={isoDay(data.asOf)}
              maxDays={MAX_DAYS}
              onApply={({ from, to }) => {
                void navigate({ search: { range, from, to } })
              }}
            />
          </div>
        }
      />

      <section aria-labelledby="usage-figures" className="flex flex-col gap-2">
        <h2 id="usage-figures" className="sr-only">Figures, {spanWords}</h2>
        <StatsCard>
          <Stat label="Calls" value={count(totals.calls)} />
          <Stat label="Failures" value={count(totals.failures)} unit={totals.calls === 0 ? undefined : `${rate(totals)!.toFixed(1)}% of calls`} />
          <Stat label="Latency p95" value={totals.p95 === null ? null : (totals.p95 / 1000).toFixed(1)} unit="s" />
          <Stat label="Cost" value={totals.cost === null ? null : money(totals.cost)} />
        </StatsCard>
        <p className="text-caption text-ink-muted">
          {totals.unpriced > 0 && `${totals.unpriced === 1 ? '1 call has' : `${count(totals.unpriced)} calls have`} no price yet. `}
          {partial}
        </p>
      </section>

      <div className="grid grid-cols-1 items-start gap-6 lg:grid-cols-2">
        <BarChart
          title="Calls by day"
          summary={callsSummary}
          unit="Calls"
          legend="Calls"
          points={data.days.map((d) => ({ label: String(new Date(dayMs(d.day)).getUTCDate()), group: monthDay(dayMs(d.day)).split(' ')[0], value: d.calls, partial: d.partial }))}
          strip={{ legend: 'Failure rate', values: data.days.map(dayRate), format: percent }}
          table={{
            caption: `Calls, failures and failure rate by day, ${spanWords}.${partial && ` ${partial}`}`,
            columns: ['Day', 'Calls', 'Failures', 'Failure rate'],
            rows: data.days.map((d) => ({ key: d.day, cells: [dayLabel(d), count(d.calls), count(d.failures), rateText(d)] })),
            total: [dayCount, count(totals.calls), count(totals.failures), rateText(totals)],
          }}
        />
        <BarChart
          title="Cost by day"
          summary={costSummary}
          unit="Cost"
          legend="Cost (USD)"
          format={dollars}
          points={data.days.map((d) => ({ label: String(new Date(dayMs(d.day)).getUTCDate()), group: monthDay(dayMs(d.day)).split(' ')[0], value: d.cost ?? 0, partial: d.partial }))}
          table={{
            caption: `Cost by day in US dollars, ${spanWords}.${partial && ` ${partial}`}`,
            columns: ['Day', 'Cost'],
            rows: data.days.map((d) => ({ key: d.day, cells: [dayLabel(d), d.cost === null && d.calls > 0 ? 'No price yet' : money(d.cost ?? 0)] })),
            total: [dayCount, totals.cost === null ? 'No price yet' : money(totals.cost)],
          }}
        />
      </div>

      <LineChart
        title="Latency by day"
        summary={latencySummary}
        width={1080}
        format={secs}
        actions={
          <div className="flex items-center gap-3">
            <Label htmlFor={jobId}>Job</Label>
            <Select id={jobId} className="w-[200px]" value={current?.purpose ?? ''} onChange={(e) => loadJob(e.target.value)}>
              <option value="">All jobs</option>
              {purposes.map((p) => <option key={p} value={p}>{jobLabel(p)}</option>)}
            </Select>
          </div>
        }
        series={[
          { name: 'p50', label: 'p50 (median)', style: 'solid', points: series.days.map((d) => ({ x: monthDay(dayMs(d.day)), y: d.p50 === null ? null : d.p50 / 1000 })) },
          { name: 'p95', style: 'dashed', points: series.days.map((d) => ({ x: monthDay(dayMs(d.day)), y: d.p95 === null ? null : d.p95 / 1000 })) },
        ]}
        table={{
          caption: `Latency by day in seconds, ${current?.purpose ? `${jobLabel(current.purpose)}, ` : ''}${spanWords}.${partial && ` ${partial}`}`,
          columns: ['Day', 'p50', 'p95'],
          rows: series.days.map((d) => ({ key: d.day, cells: [dayLabel(d), latencyText(d.p50), latencyText(d.p95)] })),
          total: [dayCount, latencyText(series.total.p50), latencyText(series.total.p95)],
        }}
      />
      {current?.error && <InlineError message={current.error} onRetry={() => loadJob(current.purpose)} />}

      <section aria-labelledby="usage-jobs" className="flex flex-col gap-3">
        <h2 id="usage-jobs" className="text-title-2 text-ink">By job</h2>
        <DataTable
          caption={`Model calls, failures, latency and cost by job, ${spanWords}.${partial && ` ${partial}`}`}
          columns={jobColumns}
          rows={data.jobs}
          rowKey={(r) => `${r.purpose}|${r.model}`}
          total={{ label: 'All jobs', span: 2, row: { ...totals, purpose: '', model: '' } }}
          empty={<tr role="row"><td role="cell" colSpan={jobColumns.length} className="px-4 py-12 text-center text-ink">No model calls in this range.</td></tr>}
        />
      </section>

      <section aria-labelledby="usage-companies" className="flex flex-col gap-3">
        <h2 id="usage-companies" className="text-title-2 text-ink">By company</h2>
        <DataTable
          caption={`Model calls, failures, p95 latency and cost by company, ${spanWords}.${partial && ` ${partial}`}`}
          columns={companyColumns}
          rows={companies}
          rowKey={(c) => c.orgId ?? 'none'}
          sort={sort}
          onSort={onSort}
          total={{ label: 'All companies', span: 1, row: { ...totals, orgId: null, name: null, slug: null } }}
          empty={<tr role="row"><td role="cell" colSpan={companyColumns.length} className="px-4 py-12 text-center text-ink">No model calls in this range.</td></tr>}
        />
      </section>

      <section aria-labelledby="usage-failures" className="flex flex-col gap-3">
        <h2 id="usage-failures" className="text-title-2 text-ink">Latest 50 failures</h2>
        <DataTable
          caption={`Latest 50 failed model calls, ${spanWords}, newest first, times in UTC.${data.failures.length > 0 ? ` Page ${page}, rows ${start + 1} to ${lastShown}.` : ''}`}
          columns={failureColumns}
          rows={shown}
          rowKey={(f) => f.id}
          empty={<tr role="row"><td role="cell" colSpan={failureColumns.length} className="px-4 py-12 text-center text-ink">No failed calls in this range.</td></tr>}
          footer={data.failures.length > 0 ? (
            <Pager
              from={start + 1}
              to={lastShown}
              total={data.failures.length}
              noun="failures"
              page={page}
              onPrevious={() => setPaged({ data, page: Math.max(1, page - 1) })}
              onNext={() => setPaged({ data, page: page + 1 })}
            />
          ) : undefined}
        />
      </section>
    </Page>
  )
}
