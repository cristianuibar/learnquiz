import { useState } from 'react'
import { Link, createFileRoute } from '@tanstack/react-router'
import { z } from 'zod'
import { Page, PageHeader } from '@/components/admin/page'
import { Pager } from '@/components/admin/pager'
import { Stat, StatsCard } from '@/components/admin/stat-figure'
import { DataTable, NullCell, type Column, type SortDirection } from '@/components/admin/data-table'
import { RouteError } from '@/components/inline-error'
import { Segmented } from '@/components/ui/segmented'
import { jobLabel, modelDisplayName } from '@/lib/llm/models'
import { getModelUsage, type ModelUsage, type UsageStats } from '@/server/admin-usage'

const DAY = 86_400_000
const PAGE_SIZE = 25
const RANGES = [7, 30, 90] as const
type Range = (typeof RANGES)[number]
type Company = ModelUsage['companies'][number]
type Failure = ModelUsage['failures'][number]
type Job = ModelUsage['jobs'][number]

export const Route = createFileRoute('/admin/usage')({
  validateSearch: z.object({ range: z.union([z.literal(7), z.literal(30), z.literal(90)]).catch(30) }),
  loaderDeps: ({ search }) => ({ range: search.range }),
  loader: ({ deps }) => {
    const today = new Date().toISOString().slice(0, 10)
    const from = new Date(Date.parse(`${today}T00:00:00Z`) - (deps.range - 1) * DAY).toISOString().slice(0, 10)
    return getModelUsage({ data: { from, to: today } })
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
  const { range } = Route.useSearch()
  const navigate = Route.useNavigate()
  const [sort, setSort] = useState<{ key: string; direction: SortDirection }>({ key: 'cost', direction: 'descending' })
  const [page, setPage] = useState(1)

  const fromMs = dayMs(data.from)
  const toMs = dayMs(data.to)
  const year = new Date(toMs).getUTCFullYear()
  const span = `${monthDay(fromMs)} – ${monthDay(toMs)}, ${year}`
  const spanWords = `${monthDay(fromMs)} to ${monthDay(toMs)}, ${year}`
  const partial = `${monthDay(toMs)} counts up to ${hhmm(data.asOf)}.`
  const { totals } = data

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
        meta={`${span} · ${monthDay(toMs)} to ${hhmm(data.asOf)} · times in UTC`}
        actions={
          <Segmented
            mode="toggle"
            aria-label="Preset ranges"
            options={RANGES.map((r) => ({ value: String(r), label: `${r} days` }))}
            value={[String(range)]}
            onValueChange={(next) => {
              const added = next.find((v) => v !== String(range))
              if (!added) return
              setPage(1)
              void navigate({ search: { range: Number(added) as Range } })
            }}
          />
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

      <section aria-labelledby="usage-jobs" className="flex flex-col gap-3">
        <h2 id="usage-jobs" className="text-title-2 text-ink">By job</h2>
        <DataTable
          caption={`Model calls, failures, latency and cost by job, ${spanWords}. ${partial}`}
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
          caption={`Model calls, failures, p95 latency and cost by company, ${spanWords}. ${partial}`}
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
              onPrevious={() => setPage((p) => Math.max(1, p - 1))}
              onNext={() => setPage((p) => p + 1)}
            />
          ) : undefined}
        />
      </section>
    </Page>
  )
}
