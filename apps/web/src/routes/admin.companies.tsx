import { Link, createFileRoute, useNavigate, useRouter } from '@tanstack/react-router'
import { useEffect, useMemo, useRef, useState, type RefObject } from 'react'
import { DataTable, NoResults, type Column, type SortDirection } from '@/components/admin/data-table'
import { Page, PageHeader } from '@/components/admin/page'
import { RowMenu } from '@/components/admin/row-menu'
import { SearchField } from '@/components/admin/search-field'
import { Skel } from '@/components/admin/skeleton'
import { RouteError } from '@/components/inline-error'
import { plural } from '@/lib/utils'
import { getCompanies } from '@/server/admin-companies'

type Company = Awaited<ReturnType<typeof getCompanies>>[number]
type Sort = { key: string; direction: SortDirection }

export const Route = createFileRoute('/admin/companies')({
  loader: () => getCompanies(),
  errorComponent: RouteError,
  pendingComponent: CompaniesLoading,
  component: Companies,
})

const DEFAULT_SORT: Sort = { key: 'modelSpend', direction: 'descending' }
const NUMBER_ORDER = { ascending: 'lowest first', descending: 'highest first' }
const usd = (n: number) => n.toLocaleString('en-US', { style: 'currency', currency: 'USD' })

// The pending and loaded pages are different trees: hand heading focus from one to the other.
let refocusHeading = false

function buildColumns(): Column<Company>[] {
  const num = (key: keyof Company & string, header: string, extra?: Partial<Column<Company>>): Column<Company> => ({
    key, header, align: 'end', sortable: true, sortOrder: NUMBER_ORDER,
    cell: (c) => (key === 'modelSpend' ? usd(c.modelSpend) : String(c[key as 'members'])),
    ...extra,
  })
  return [
    {
      key: 'name',
      header: 'Company',
      sortable: true,
      sortOrder: { ascending: 'A to Z', descending: 'Z to A' },
      cell: (c) => (
        <>
          <Link
            to="/admin/companies/$slug"
            params={{ slug: c.slug }}
            className="inline-flex min-h-11 max-w-[320px] items-center rounded-sm font-medium text-ink focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-brand"
          >
            <span className="truncate">{c.name}</span>
          </Link>
          <div className="text-caption text-ink-muted max-xl:hidden">/org/{c.slug}</div>
        </>
      ),
    },
    num('members', 'Members'),
    num('roles', 'Job roles', { hideBelowLg: true }),
    num('documents', 'Documents', { hideBelowLg: true }),
    num('activeLearners', 'Active learners', { group: 'Last 30 days', label: 'Active learners over the last 30 days' }),
    num('modelSpend', 'Model spend', { group: 'Last 30 days', label: 'Model spend over the last 30 days' }),
  ]
}

const columns = buildColumns()

function compare(a: Company, b: Company, { key, direction }: Sort) {
  const dir = direction === 'ascending' ? 1 : -1
  const by = key === 'name' ? a.name.localeCompare(b.name) : (a[key as 'members'] as number) - (b[key as 'members'] as number)
  return by * dir || a.name.localeCompare(b.name)
}

function Toolbar({ value, onChange, disabled, inputRef }: {
  value: string
  onChange?: (v: string) => void
  disabled?: boolean
  inputRef?: RefObject<HTMLInputElement | null>
}) {
  return (
    <div role="search" className="border-b border-border p-4">
      <SearchField
        ref={inputRef}
        label="Search companies"
        autoComplete="off"
        disabled={disabled}
        value={value}
        onChange={(e) => onChange?.(e.target.value)}
      />
    </div>
  )
}

function Companies() {
  const companies = Route.useLoaderData()
  const navigate = useNavigate()
  const router = useRouter()
  const [input, setInput] = useState('')
  const [query, setQuery] = useState('')
  const [sort, setSort] = useState<Sort>(DEFAULT_SORT)
  const searchRef = useRef<HTMLInputElement>(null)
  const pageRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    if (!refocusHeading) return
    refocusHeading = false
    pageRef.current?.querySelector('h1')?.focus({ preventScroll: true })
  }, [])

  useEffect(() => {
    const t = setTimeout(() => setQuery(input), 200)
    return () => clearTimeout(t)
  }, [input])

  const rows = useMemo(() => {
    const q = query.trim().toLowerCase()
    const list = q ? companies.filter((c) => c.name.toLowerCase().includes(q) || c.slug.toLowerCase().includes(q)) : companies.slice()
    return list.sort((a, b) => compare(a, b, sort))
  }, [companies, query, sort])

  const onSort = (key: string) =>
    setSort((s) => (s.key === key ? { key, direction: s.direction === 'ascending' ? 'descending' : 'ascending' } : { key, direction: key === 'name' ? 'ascending' : 'descending' }))
  const clear = () => { setInput(''); setQuery('') }

  return (
    <div ref={pageRef}>
      <Page>
        <div className="flex flex-col gap-1">
          <PageHeader title="Companies" />
          <p className="text-caption text-ink-muted tabular-nums" aria-live="polite">{plural(rows.length, 'company', 'companies')}</p>
        </div>
        {companies.length === 0 ? (
          <p>No companies have signed up yet.</p>
        ) : (
          <DataTable
            caption="Companies"
            columns={columns}
            rows={rows}
            rowKey={(c) => c.id}
            sort={sort}
            onSort={onSort}
            toolbar={<Toolbar value={input} onChange={setInput} inputRef={searchRef} />}
            actions={(c) => (
              <RowMenu
                label={c.name}
                items={[
                  { label: 'Open company', onSelect: () => void navigate({ to: '/admin/companies/$slug', params: { slug: c.slug } }) },
                  { label: 'View portal (read only)', onSelect: () => router.history.push(`/admin/companies/${c.slug}/portal`) },
                ]}
              />
            )}
            empty={<NoResults colSpan={7} clearLabel="Clear search" onClear={clear} searchRef={searchRef}>No companies match</NoResults>}
          />
        )}
      </Page>
    </div>
  )
}

function CompaniesLoading() {
  const pageRef = useRef<HTMLDivElement>(null)
  useEffect(() => {
    const el = pageRef.current
    return () => {
      const h1 = el?.querySelector('h1')
      if (h1 && document.activeElement === h1) refocusHeading = true
    }
  }, [])
  return (
    <div ref={pageRef}>
      <Page>
        <div className="flex flex-col gap-1">
          <PageHeader title="Companies" />
          <Skel className="h-3 w-[88px]" />
        </div>
        <DataTable
          caption="Companies"
          columns={columns}
          rows={[]}
          rowKey={(c) => c.id}
          sort={DEFAULT_SORT}
          loading={{ rows: 8, status: 'Loading companies' }}
          actions={() => null}
          toolbar={<Toolbar value="" disabled />}
        />
      </Page>
    </div>
  )
}
