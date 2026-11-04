import { Link, createFileRoute } from '@tanstack/react-router'
import { CircleCheck } from 'lucide-react'
import { useRef, useState } from 'react'
import { reportReasons } from '@learnquiz/api/reveal'
import { DataTable, NoResults, NullCell, type Column, type SortDirection } from '@/components/admin/data-table'
import { FilterChip } from '@/components/admin/filter-chip'
import { Page, PageHeader } from '@/components/admin/page'
import { Status, StatusChip } from '@/components/admin/status-chip'
import { RouteError } from '@/components/inline-error'
import { Select } from '@/components/ui/select'
import { getContentFlags } from '@/server/admin-flags'

type FlagsSearch = { type: 'all' | 'learner' | 'partner'; company: string; status: 'all' | 'open' | 'resolved' }

export const Route = createFileRoute('/admin/flags')({
  validateSearch: (search: Record<string, unknown>): FlagsSearch => ({
    type: search.type === 'learner' || search.type === 'partner' ? search.type : 'all' as const,
    company: typeof search.company === 'string' ? search.company : '',
    status: search.status === 'open' || search.status === 'resolved' ? search.status : 'all' as const,
  }),
  loader: () => getContentFlags(),
  errorComponent: RouteError,
  component: Flags,
})

type FlagRow = Awaited<ReturnType<typeof getContentFlags>>['rows'][number]
const date = (at: number) => new Date(at).toLocaleDateString('en-US', { month: 'short', day: 'numeric', timeZone: 'UTC' })
const reasons: Record<string, string> = { ...Object.fromEntries(reportReasons.map((r) => [r.code, r.label])), 'unfair-result': 'The result seems unfair' }
const types = { all: 'All', learner: 'Reported by learners', partner: 'Retired by partners' }
const columns: Column<FlagRow>[] = [
  { key: 'question', header: 'Question', className: 'w-[30%]', cell: (r) => <>
    <Link to="/admin/companies/$slug/portal/questions" params={{ slug: r.slug }} search={{ role: r.roleId, item: r.itemId }}
      className="relative inline-flex max-w-[320px] rounded-sm font-semibold text-ink hover:text-brand hover:underline before:absolute before:inset-x-0 before:-inset-y-3 before:content-[''] focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-brand">
      <span className="line-clamp-2">{r.stem}</span>
    </Link>
    <div className="mt-1 text-caption text-ink-muted">{r.type === 'learner' ? 'Learner report' : 'Retired by partner'} · {r.unit}</div>
  </> },
  { key: 'company', header: 'Company', className: 'w-[14%]', cell: (r) => r.company },
  { key: 'reason', header: 'Reason and note', className: 'w-[27%]', cell: (r) => r.type === 'partner'
    ? <NullCell label="No reason recorded" />
    : <><div className="text-label">{reasons[r.reason] ?? r.reason}</div>{r.note && <p className="mt-1 max-w-[280px] line-clamp-2 text-caption text-ink-muted">{r.note}</p>}</> },
  { key: 'when', header: 'When', sortable: true, sortOrder: { ascending: 'oldest first', descending: 'newest first' }, className: 'w-[130px] whitespace-nowrap', cell: (r) => <>
    <div>{r.type === 'partner' && r.retiredAt === null ? <NullCell label="Not recorded" /> : <time dateTime={new Date(r.createdAt).toISOString()}>{date(r.createdAt)}</time>}</div>
    <div className="mt-1 text-caption text-ink-muted">{r.personName ?? <NullCell label="Not recorded" />}</div>
  </> },
  { key: 'status', header: 'Status', cell: (r) => r.type === 'partner' ? <Status word="Retired" /> : r.resolvedAt !== null
    ? <StatusChip tone="settled" icon={CircleCheck}>Resolved {date(r.resolvedAt)}</StatusChip> : <Status word="Flagged by learner" /> },
]

function Flags() {
  const { rows: allRows, companies } = Route.useLoaderData()
  const search = Route.useSearch()
  const navigate = Route.useNavigate()
  const [direction, setDirection] = useState<SortDirection>('descending')
  const companyRef = useRef<HTMLSelectElement>(null)
  const searchRef = useRef<HTMLInputElement>(null)
  const setSearch = (next: Partial<typeof search>) => void navigate({ search: { ...search, ...next }, replace: true, resetScroll: false })
  const selected = allRows.filter((r) => (!search.company || r.slug === search.company) && (search.status === 'all'
    || (search.status === 'resolved' ? r.type === 'partner' || r.resolvedAt !== null : r.type === 'learner' && r.resolvedAt === null)))
  const counts = { all: selected.length, learner: selected.filter((r) => r.type === 'learner').length, partner: selected.filter((r) => r.type === 'partner').length }
  const matches = selected.filter((r) => search.type === 'all' || r.type === search.type)
  // Limit after filtering so companies with older flags remain available.
  const newest = matches.slice(0, 200)
  const rows = direction === 'descending' ? newest : newest.slice().reverse()
  const companyName = companies.find((c) => c.slug === search.company)?.name ?? search.company
  return (
    <Page className="py-0 md:px-4 md:py-0">
      <PageHeader title="Content flags" />
      <section aria-label="Flag list" className="flex flex-col gap-4">
        <div className="flex flex-wrap items-center gap-4">
          <div role="group" aria-label="Flag type" className="flex flex-wrap gap-2">
            {(Object.keys(types) as (keyof typeof types)[]).map((type) => <FilterChip key={type} pressed={search.type === type} count={counts[type]} onClick={() => setSearch({ type })}>{types[type]}</FilterChip>)}
          </div>
          <div className="ml-auto flex flex-wrap items-center gap-4">
            <div className="flex items-center gap-2">
              <label htmlFor="fl-company" className="text-label">Company</label>
              <Select ref={companyRef} id="fl-company" className="min-h-11 w-[220px] border py-2 text-body" value={search.company} onChange={(e) => setSearch({ company: e.target.value })}>
                <option value="">All companies</option>
                {companies.map((c) => <option key={c.slug} value={c.slug}>{c.name}</option>)}
              </Select>
            </div>
            <div className="flex items-center gap-2">
              <label htmlFor="fl-status" className="text-label">Status</label>
              <Select id="fl-status" className="min-h-11 w-[136px] border py-2 text-body" value={search.status} onChange={(e) => setSearch({ status: e.target.value as typeof search.status })}>
                <option value="all">All</option><option value="open">Open</option><option value="resolved">Resolved</option>
              </Select>
            </div>
          </div>
        </div>
        <p role="status" className="sr-only">Showing {rows.length} flags</p>
        <DataTable caption={`Flagged and retired questions across all companies, ${direction === 'descending' ? 'newest' : 'oldest'} first${matches.length > 200 ? '. Showing the newest 200 flags' : ''}`}
          columns={columns} rows={rows} rowKey={(r) => `${r.type}:${r.id}`} sort={{ key: 'when', direction }} onSort={() => setDirection((d) => d === 'descending' ? 'ascending' : 'descending')}
          empty={<NoResults colSpan={5} searchRef={searchRef} onClear={() => { setSearch({ type: 'all', company: '', status: 'all' }); companyRef.current?.focus() }}>
            No flags match these filters: {types[search.type]}, {search.company ? companyName : 'All companies'}, {search.status === 'all' ? 'All statuses' : search.status === 'open' ? 'Open' : 'Resolved'}.
          </NoResults>} />
      </section>
    </Page>
  )
}
