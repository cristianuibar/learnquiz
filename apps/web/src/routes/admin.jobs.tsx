import { CircleCheck, Clock, Hourglass, OctagonAlert, RotateCw, X } from 'lucide-react'
import { useEffect, useRef, useState } from 'react'
import { createFileRoute, useRouter } from '@tanstack/react-router'
import { z } from 'zod'
import { Banner } from '@/components/admin/banner'
import { BulkBar } from '@/components/admin/bulk-bar'
import { DataTable, NullCell, type Column } from '@/components/admin/data-table'
import { FilterChip } from '@/components/admin/filter-chip'
import { Page, PageHeader } from '@/components/admin/page'
import { Pager } from '@/components/admin/pager'
import { StatusChip, STATUS } from '@/components/admin/status-chip'
import { errorMessage, RouteError } from '@/components/inline-error'
import { ErrorRow } from '@/components/question/error-row'
import { Button } from '@/components/ui/button'
import { plural } from '@/lib/utils'
import { getGenerationJobs, JOB_FILTERS, JOB_PAGE_SIZE, retryJobs, type JobFilter, type JobRow, type JobState } from '@/server/admin-jobs'

export const Route = createFileRoute('/admin/jobs')({
  validateSearch: z.object({ filter: z.enum(JOB_FILTERS).catch('notReady'), offset: z.number().int().min(0).catch(0) }),
  loaderDeps: ({ search }) => search,
  loader: ({ deps }) => getGenerationJobs({ data: deps }),
  errorComponent: RouteError,
  component: Jobs,
})

const POLL_MS = 5000
const clock = (ms: number) => new Date(ms).toISOString().slice(11, 19)

const CAPTIONS: Record<JobFilter, string> = {
  notReady: 'Generation jobs not ready yet: failed first, then generating, then pending in queue order.',
  failed: 'Failed generation jobs.',
  generating: 'Generation jobs in progress.',
  pending: 'Generation jobs waiting in queue order.',
  ready: 'Generation jobs that are ready.',
}

function StateChip({ state }: { state: JobState }) {
  if (state === 'failed') return <StatusChip tone={STATUS.Failed.tone} icon={OctagonAlert}>Failed</StatusChip>
  if (state === 'generating') return <StatusChip tone="tint" icon={Hourglass}>Generating</StatusChip>
  if (state === 'pending') return <StatusChip tone={STATUS.Pending.tone} icon={Clock}>Pending</StatusChip>
  return <StatusChip tone={STATUS.Ready.tone} icon={CircleCheck}>Ready</StatusChip>
}

function Jobs() {
  const { counts, total, rows, updatedAt } = Route.useLoaderData()
  const { filter, offset } = Route.useSearch()
  const navigate = Route.useNavigate()
  const router = useRouter()
  const [selected, setSelected] = useState<ReadonlySet<string>>(new Set())
  const [paused, setPaused] = useState(false)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  const [notice, setNotice] = useState<{ text: string } | null>(null)
  const noticeRef = useRef<HTMLDivElement>(null)
  const tableRef = useRef<HTMLDivElement>(null)
  const idle = useRef(true)
  idle.current = !paused && selected.size === 0

  useEffect(() => {
    // Read focus at each tick: a focused control that unmounts (Clear selection) fires no blur.
    const timer = setInterval(() => { if (idle.current && !tableRef.current?.contains(document.activeElement)) void router.invalidate() }, POLL_MS)
    return () => clearInterval(timer)
  }, [router])

  useEffect(() => { if (notice) noticeRef.current?.focus() }, [notice])

  // The banner is about to unmount; keep focus on the page instead of dropping it to the body.
  function dismiss() {
    noticeRef.current?.closest('main')?.querySelector<HTMLElement>('h1')?.focus()
    setNotice(null)
  }

  const failedIds = rows.filter((r) => r.state === 'failed').map((r) => r.id)
  const notReady = counts.failed + counts.generating + counts.pending

  async function retry(ids: string[]) {
    setBusy(true)
    setError('')
    try {
      const { queued, skipped, failed } = await retryJobs({ data: { ids } })
      setSelected(new Set())
      await router.invalidate()
      setNotice({ text: `${plural(queued, 'job', 'jobs')} queued again${skipped > 0 ? `, ${skipped} skipped` : ''}${failed > 0 ? `, ${failed} failed again` : ''}.` })
    } catch (err) {
      setError(errorMessage(err))
    } finally {
      setBusy(false)
    }
  }

  const columns: Column<JobRow>[] = [
    { key: 'company', header: 'Company · role', cell: (r) => <><div className="font-semibold text-ink">{r.company}</div>{r.role && <div className="text-ink-muted">{r.role}</div>}</> },
    { key: 'target', header: 'Target', cell: (r) => <><div className="text-ink">{r.target}</div><div className="text-ink-muted">{r.kind === 'concept' ? 'Concept questions' : 'Curriculum'}</div></> },
    { key: 'state', header: 'State', cell: (r) => <StateChip state={r.state} /> },
    {
      key: 'started', header: 'Started', align: 'end',
      cell: (r) => r.startedAt === null ? <NullCell label="Not started" /> : r.state === 'pending' ? `Queued ${clock(r.startedAt).slice(0, 5)}` : clock(r.startedAt),
    },
    {
      key: 'duration', header: 'Duration', align: 'end',
      cell: (r) => {
        if (r.state === 'failed') return <NullCell label="Not recorded" />
        if (r.state !== 'generating' || r.startedAt === null) return <NullCell label="Not started" />
        const s = Math.max(0, Math.round((updatedAt - r.startedAt) / 1000))
        return s >= 120 ? `${Math.round(s / 60)} min so far` : `${s} s so far`
      },
    },
    {
      key: 'error', header: 'Error',
      cell: (r) => r.error && <span title={r.error} className="line-clamp-2 rounded-sm bg-surface-sunken px-1.5 py-0.5 font-mono text-[13px]/[18px] text-ink">{r.error}</span>,
    },
  ]

  const chip = (key: JobFilter, label: string, count: number, icon?: typeof Clock) => (
    <FilterChip key={key} pressed={filter === key} count={count} icon={icon} onClick={() => void navigate({ search: { filter: key, offset: 0 } })}>{label}</FilterChip>
  )

  return (
    <Page className="p-0 md:p-0">
      <PageHeader
        title="Generation jobs"
        meta={<span className="text-caption tabular-nums">Updated {clock(updatedAt)} · refreshes every 5 s</span>}
        actions={<Button variant="ghost" aria-pressed={paused} onClick={() => setPaused((p) => !p)}>Pause updates</Button>}
      />
      <p role="status" className="sr-only">{`${counts.failed} failed, ${counts.generating} generating, ${counts.pending} pending, ${counts.ready} ready.`}</p>
      <div role="group" aria-label="Filter by state" className="flex flex-wrap gap-2">
        {chip('notReady', 'Not ready', notReady)}
        {chip('failed', 'Failed', counts.failed, OctagonAlert)}
        {chip('generating', 'Generating', counts.generating, Hourglass)}
        {chip('pending', 'Pending', counts.pending, Clock)}
        {chip('ready', 'Ready', counts.ready, CircleCheck)}
      </div>
      {notice && (
        <div ref={noticeRef} role="status" tabIndex={-1} className="rounded-md focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-brand">
          <Banner action={<Button size="icon" variant="ghost" aria-label="Dismiss message" onClick={dismiss}><X aria-hidden /></Button>}>{notice.text}</Banner>
        </div>
      )}
      {error && <ErrorRow message={error} />}
      <div ref={tableRef}>
        <DataTable
          caption={CAPTIONS[filter]}
          columns={columns}
          rows={rows}
          rowKey={(r) => r.id}
          selection={{
            selected,
            onToggle: (id) => setSelected((prev) => { const next = new Set(prev); if (!next.delete(id)) next.add(id); return next }),
            onToggleAll: () => setSelected((prev) => {
              // Add or remove only this page's failed jobs; selections from other pages stay.
              const next = new Set(prev)
              const all = failedIds.length > 0 && failedIds.every((id) => prev.has(id))
              for (const id of failedIds) { if (all) next.delete(id); else next.add(id) }
              return next
            }),
            rowLabel: (r) => `${r.target}, ${r.company}`,
            selectable: (r) => r.state === 'failed',
            allLabel: 'Select all failed',
          }}
          actions={(r) => r.state === 'failed' && (
            <Button variant="secondary" disabled={busy} onClick={() => void retry([r.id])}>Retry<span className="sr-only"> {r.target}, {r.company}</span></Button>
          )}
          toolbar={selected.size > 0 && (
            <BulkBar count={selected.size} onClear={() => setSelected(new Set())}>
              <Button variant="accent" disabled={busy} onClick={() => void retry([...selected])}><RotateCw aria-hidden />Retry {plural(selected.size, 'job', 'jobs')}</Button>
            </BulkBar>
          )}
          footer={
            <Pager
              from={total ? offset + 1 : 0}
              to={offset + rows.length}
              total={total}
              noun="jobs"
              page={offset / JOB_PAGE_SIZE + 1}
              onPrevious={() => void navigate({ search: { filter, offset: Math.max(0, offset - JOB_PAGE_SIZE) } })}
              onNext={() => void navigate({ search: { filter, offset: offset + JOB_PAGE_SIZE } })}
            />
          }
          empty={<tr role="row"><td role="cell" colSpan={columns.length + 2} className="px-4 py-12 text-center text-ink">No jobs in this state.</td></tr>}
        />
      </div>
    </Page>
  )
}
