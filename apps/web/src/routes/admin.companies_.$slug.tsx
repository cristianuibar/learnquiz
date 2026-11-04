import { Link, createFileRoute } from '@tanstack/react-router'
import { ChevronRight, Eye } from 'lucide-react'
import { useEffect, useRef } from 'react'
import { HBarList } from '@/components/admin/charts/hbar-list'
import { DataTable, NullCell, type Column } from '@/components/admin/data-table'
import { Page, PageHeader } from '@/components/admin/page'
import { STATUS, Status, StatusChip } from '@/components/admin/status-chip'
import { RouteError } from '@/components/inline-error'
import { Button } from '@/components/ui/button'
import { jobLabel, modelDisplayName } from '@/lib/llm/models'
import { TRAINING_STATUS } from '@/lib/training-status'
import { plural } from '@/lib/utils'
import { getCompany } from '@/server/admin-companies'

export const Route = createFileRoute('/admin/companies_/$slug')({
  loader: ({ params }) => getCompany({ data: { slug: params.slug } }),
  errorComponent: RouteError,
  component: Company,
})

type CompanyData = Awaited<ReturnType<typeof getCompany>>
type MemberRow = { id: string; name: string; email: string; role: string | null; joinedAt: Date | null; invitedAt?: Date; lastActive: number | null }
const usd = (n: number) => n.toLocaleString('en-US', { style: 'currency', currency: 'USD' })
const day = (at: Date | number, year = true) => new Date(at).toLocaleDateString('en-US', { month: 'short', day: 'numeric', ...(year ? { year: 'numeric' } : {}), timeZone: 'UTC' })
const number = (n: number) => n.toLocaleString('en-US')

function lastActive(at: number | null) {
  if (at === null) return <NullCell label="No activity yet" />
  const today = Math.floor(Date.now() / 86_400_000)
  const daysAgo = today - Math.floor(at / 86_400_000)
  if (daysAgo === 0) return `Today ${new Date(at).toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit', timeZone: 'UTC' })}`
  return daysAgo === 1 ? 'Yesterday' : day(at, false)
}

const memberColumns: Column<MemberRow>[] = [
  { key: 'name', header: 'Name', className: 'font-semibold', cell: (m) => m.name },
  { key: 'email', header: 'Email', cell: (m) => m.email },
  { key: 'role', header: 'Membership role', cell: (m) => (m.role ?? 'member').split(',').map((role) => role.charAt(0).toUpperCase() + role.slice(1)).join(', ') },
  { key: 'joined', header: 'Joined', cell: (m) => m.joinedAt ? day(m.joinedAt) : <StatusChip {...STATUS.Invited}>Invited {day(m.invitedAt!, false)}</StatusChip> },
  { key: 'active', header: 'Last active', cell: (m) => m.joinedAt ? lastActive(m.lastActive) : <NullCell label="Not joined" /> },
]
const roleColumns: Column<CompanyData['roles'][number]>[] = [
  { key: 'name', header: 'Role', className: 'font-semibold', cell: (r) => r.name },
  { key: 'training', header: 'Training', cell: (r) => <div className="flex flex-wrap items-center gap-3"><Status word={TRAINING_STATUS[r.preparing ? 'generating' : r.topicStatus ?? 'draft'] as keyof typeof STATUS} />{r.preparing && <span className="text-caption text-ink-muted">{r.conceptsReady} of {r.conceptsTotal} concepts ready</span>}</div> },
  { key: 'concepts', header: 'Concepts', align: 'end', cell: (r) => number(r.conceptsTotal) },
  { key: 'questions', header: 'Live questions', align: 'end', cell: (r) => r.topicStatus === 'ready' && !r.preparing ? number(r.liveQuestions) : <NullCell label="Still generating" /> },
  { key: 'people', header: 'People', align: 'end', cell: (r) => number(r.people) },
]
const documentColumns: Column<CompanyData['documents'][number]>[] = [
  { key: 'title', header: 'Title', className: 'min-w-40 font-semibold', cell: (d) => d.title },
  { key: 'role', header: 'Role', className: 'whitespace-nowrap', cell: (d) => d.role },
  { key: 'type', header: 'Type', className: 'min-w-32', cell: (d) => <><div>{d.kind === 'pdf' ? 'PDF' : 'Pasted text'}</div><div className="text-caption text-ink-muted">{d.kind === 'text' ? `${number(d.chars)} characters` : [d.sizeBytes === null ? null : `${(d.sizeBytes / 1_000_000).toFixed(1)} MB`, d.pageCount === null ? null : plural(d.pageCount, 'page', 'pages')].filter(Boolean).join(' · ')}</div></> },
  { key: 'version', header: 'Version', align: 'end', cell: (d) => d.version },
  { key: 'uploaded', header: 'Uploaded', className: 'whitespace-nowrap', cell: (d) => day(d.createdAt) },
  { key: 'by', header: 'By', className: 'whitespace-nowrap', cell: (d) => d.uploaderName ?? <NullCell label="Unknown uploader" /> },
  { key: 'status', header: 'Status', cell: (d) => d.status === 'failed' ? <Status word="Extraction failed" /> : d.generating || d.status === 'processing' ? <Status word="Generating questions" /> : d.unreviewed > 0 ? <StatusChip {...STATUS.Unreviewed}>{d.unreviewed} unreviewed</StatusChip> : <Status word="Ready" /> },
]
const empty = (colSpan: number, text: string) => <tr><td colSpan={colSpan} className="px-4 py-6 text-ink-muted">{text}</td></tr>

function Company() {
  const company = Route.useLoaderData()
  const pageRef = useRef<HTMLDivElement>(null)
  useEffect(() => { pageRef.current?.querySelector('h1')?.focus() }, [company.slug])
  const members: MemberRow[] = [
    ...company.members,
    ...company.invitations.map((i) => ({ ...i, id: `invite:${i.id}`, joinedAt: null, invitedAt: i.createdAt, lastActive: null })),
  ]
  const models = (ids: string[]) => ids.map((id) => <span key={id} className="block break-words text-caption text-ink-muted">{modelDisplayName(id)} <span className="code break-all font-mono">{id}</span></span>)
  return (
    <div ref={pageRef}>
      <Page capped className="max-w-[1152px] p-0 md:px-4 md:py-0">
        <PageHeader
          crumbs={<ol className="flex flex-wrap items-center gap-1"><li className="flex items-center gap-1"><Link to="/admin/companies" className="inline-flex min-h-11 items-center rounded-sm hover:underline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-brand">Companies</Link><ChevronRight aria-hidden className="size-4" /></li><li><span aria-current="page">{company.name}</span></li></ol>}
          title={<span className="flex items-center gap-3">{company.logo ? <img src={company.logo} alt="" className="size-8 shrink-0 rounded-md object-contain" /> : <span aria-hidden className="flex size-8 shrink-0 items-center justify-center rounded-md bg-brand-tint text-label text-brand">{company.name.charAt(0).toUpperCase()}</span>}{company.name}</span>}
          meta={<><p>/org/{company.slug} · Created {day(company.createdAt)} · Owner {company.owner ?? '—'}</p><dl className="mt-3 flex flex-wrap gap-x-8 gap-y-1"><div className="flex items-baseline gap-2"><dt>Active learners · 30 days</dt><dd className="text-title-2 text-ink tabular-nums">{number(company.activeLearners)}</dd></div><div className="flex items-baseline gap-2"><dt>Model spend · 30 days</dt><dd className="text-title-2 text-ink tabular-nums">{company.modelSpend === null ? <NullCell label="No data yet" /> : usd(company.modelSpend)}</dd></div></dl></>}
          actions={<Button variant="accent" className="min-h-11" asChild><Link to="/admin/companies/$slug/portal" params={{ slug: company.slug }}><Eye aria-hidden />View portal (read only)</Link></Button>}
        />
        <section aria-labelledby="cd-members" className="flex flex-col gap-4">
          <h2 id="cd-members" className="text-title-2">Members · {members.length}</h2>
          <DataTable caption={`Members of ${company.name}`} columns={memberColumns} rows={members} rowKey={(m) => m.id} empty={empty(5, 'No members yet.')} />
        </section>
        <section aria-labelledby="cd-roles" className="flex flex-col gap-4">
          <h2 id="cd-roles" className="text-title-2">Roles · {company.roles.length}</h2>
          <DataTable caption={`Job roles at ${company.name} and their training status`} columns={roleColumns} rows={company.roles} rowKey={(r) => r.id} empty={empty(5, 'No roles yet.')} />
        </section>
        <section aria-labelledby="cd-docs" className="flex flex-col gap-4">
          <h2 id="cd-docs" className="text-title-2">Documents · {company.documents.length}</h2>
          <DataTable caption={`Documents uploaded by ${company.name}, newest first`} columns={documentColumns} rows={company.documents} rowKey={(d) => d.id} empty={empty(7, 'No documents yet.')} />
        </section>
        <section aria-labelledby="cd-spend" className="flex flex-col gap-4">
          <h2 id="cd-spend" className="text-title-2">Model spend by job · 30 days</h2>
          <HBarList title="Model spend by job · 30 days" hideTitle summary="Model spend by job over the last 30 days in US dollars." format={usd}
            rows={company.spendByJob.map((job) => ({ label: jobLabel(job.purpose), value: job.cost ?? 0, valueLabel: job.cost === null ? '—' : undefined, detail: models(job.models) }))}
            table={{ caption: `Model spend by job for ${company.name}, last 30 days, in US dollars`, columns: ['Job', 'Model', 'Spend'],
              rows: company.spendByJob.map((job) => ({ key: job.purpose, cells: [jobLabel(job.purpose), models(job.models), job.cost === null ? <NullCell label="No data yet" /> : usd(job.cost)] })),
              total: ['Total', '', company.modelSpend === null ? <NullCell label="No data yet" /> : usd(company.modelSpend)],
            }}
          />
        </section>
      </Page>
    </div>
  )
}
