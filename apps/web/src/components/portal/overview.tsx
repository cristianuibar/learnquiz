import { Link } from '@tanstack/react-router'
import { Plus, Upload } from 'lucide-react'
import { useEffect, useRef, useState, type ReactNode } from 'react'
import { Banner } from '@/components/admin/banner'
import { DataTable, TableSkeleton, type Column } from '@/components/admin/data-table'
import { Meter } from '@/components/admin/meter'
import { Page, PageHeader } from '@/components/admin/page'
import { Skel } from '@/components/admin/skeleton'
import { Stat, StatsCard } from '@/components/admin/stat-figure'
import { Status, type STATUS } from '@/components/admin/status-chip'
import { usePortalLinks } from '@/components/portal/portal-context'
import { Button } from '@/components/ui/button'
import { Card } from '@/components/ui/card'
import { TRAINING_STATUS } from '@/lib/training-status'
import { plural } from '@/lib/utils'
import type { getOrgOverview } from '@/server/org'

type OverviewData = Awaited<ReturnType<typeof getOrgOverview>>
type RoleRow = OverviewData['roles'][number]

const TEXT_LINK = 'inline-flex min-h-11 items-center text-brand underline outline-none focus-visible:ring-[3px] focus-visible:ring-ring/50'
const ROLE_LINK = 'inline-flex min-h-11 items-center font-medium text-ink underline-offset-2 outline-none hover:underline focus-visible:ring-[3px] focus-visible:ring-ring/50'

/**
 * One persistent polite status region. For the preparing role it speaks the actual
 * "{ready} of {total} concepts ready" text whenever floor(ready / 5) changes, and
 * "{total} of {total} concepts ready." once it is done. It never moves focus.
 */
function useBuildAnnouncement(roles: RoleRow[]) {
  const tracked = useRef<{ id: string; bucket: number } | null>(null)
  const [text, setText] = useState('')
  const role = roles.find((r) => r.preparing) ?? roles.find((r) => r.id === tracked.current?.id)
  const id = role?.id
  const ready = role?.conceptsReady
  const total = role?.conceptsTotal
  useEffect(() => {
    if (id === undefined || ready === undefined || total === undefined) return
    const bucket = Math.floor(ready / 5)
    const last = tracked.current?.id === id ? tracked.current.bucket : null
    if (total > 0 && ready === total) {
      if (last !== null && last !== -1) setText(`${total} of ${total} concepts ready.`)
      tracked.current = { id, bucket: -1 }
    } else if (bucket !== last) {
      if (last !== null) setText(`${ready} of ${total} concepts ready`)
      tracked.current = { id, bucket }
    }
  }, [id, ready, total])
  return text
}

function TrainingCell({ role }: { role: RoleRow }) {
  if (role.preparing) {
    return (
      <span className="inline-flex flex-wrap items-center gap-x-2 gap-y-1">
        <Status word="Preparing training" />
        <span className="text-[13px]/[18px] text-ink-muted">{role.conceptsReady} of {role.conceptsTotal} concepts</span>
      </span>
    )
  }
  return <Status word={TRAINING_STATUS[role.topicStatus] as keyof typeof STATUS} />
}

function RolesSection({ roles, readOnly }: { roles: RoleRow[]; readOnly: boolean }) {
  const links = usePortalLinks()
  const columns: Column<RoleRow>[] = [
    {
      key: 'role', header: 'Role', stack: 'full',
      cell: (r) => (readOnly ? <span className="font-medium">{r.name}</span> : <Link {...links.role(r.id)} className={ROLE_LINK}>{r.name}</Link>),
    },
    { key: 'training', header: 'Training', stack: 'full', cell: (r) => <TrainingCell role={r} /> },
    { key: 'benchmark', header: 'Benchmark', align: 'end', cell: (r) => `${Math.round(r.benchmark * 100)}%` },
    { key: 'onboarding', header: 'Onboarding', align: 'end', cell: (r) => plural(r.onboardingDays, 'day', 'days') },
    { key: 'people', header: 'People', align: 'end', cell: (r) => r.people },
  ]
  return (
    <section aria-labelledby="overview-roles" className="flex flex-col gap-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h2 id="overview-roles" className="text-title-2 text-ink">Roles</h2>
        {!readOnly && (
          <Button variant="ghost" asChild><Link {...links.roles}>All roles</Link></Button>
        )}
      </div>
      <DataTable
        stack
        caption="Job roles and their training status"
        columns={columns}
        rows={roles}
        rowKey={(r) => r.id}
        empty={
          <tr role="row">
            <td role="cell" colSpan={columns.length} className="px-4 py-8 text-ink-muted">
              No job roles yet.
            </td>
          </tr>
        }
      />
    </section>
  )
}

function CardBox({ labelledBy, children }: { labelledBy: string; children: ReactNode }) {
  return (
    <Card role="region" aria-labelledby={labelledBy} className="max-w-[720px] gap-4 p-6">
      {children}
    </Card>
  )
}

function PreparingCard({ role, readOnly }: { role: RoleRow; readOnly: boolean }) {
  const links = usePortalLinks()
  const text = `${role.conceptsReady} of ${role.conceptsTotal} concepts ready`
  return (
    <CardBox labelledBy="overview-preparing">
      <h2 id="overview-preparing" className="text-title-2 text-ink">Preparing {role.name} training</h2>
      <div><Status word="Generating questions" /></div>
      <Meter value={role.conceptsReady} max={role.conceptsTotal} label="Concepts ready" valueText={text} />
      <p className="text-body text-ink-muted">{text}</p>
      {!readOnly && (
        <div className="flex flex-wrap gap-3">
          <Button variant="accent" asChild><Link {...links.people} search={{ invite: 1 }}><Plus aria-hidden />Invite people</Link></Button>
          <Button variant="ghost" asChild><Link {...links.role(role.id)}>Watch the build</Link></Button>
        </div>
      )}
    </CardBox>
  )
}

function EmptyCard({ first, readOnly }: { first: RoleRow | undefined; readOnly: boolean }) {
  const links = usePortalLinks()
  if (!first) {
    return readOnly ? null : (
      <CardBox labelledBy="overview-empty">
        <h2 id="overview-empty" className="text-title-2 text-ink">Add your first SOP</h2>
        <p className="text-body text-ink-muted"><Link {...links.roles} className={TEXT_LINK}>Create your first job role.</Link></p>
      </CardBox>
    )
  }
  return (
    <CardBox labelledBy="overview-empty">
      <h2 id="overview-empty" className="text-title-2 text-ink">Add your first SOP</h2>
      <p className="text-body text-ink-muted">{first.name} has no documents yet. Upload one, and Learn Quiz builds the training from it.</p>
      {!readOnly && (
        <div>
          <Button variant="accent" asChild><Link {...links.role(first.id)}><Upload aria-hidden />Upload SOP</Link></Button>
        </div>
      )}
    </CardBox>
  )
}

export function Overview({ data, readOnly }: { data: OverviewData; readOnly: boolean }) {
  const links = usePortalLinks()
  const { roles, training: t, nextStep } = data
  const announcement = useBuildAnnouncement(roles)
  const preparingRole = roles.find((r) => r.preparing)
  const noEmployees = t.employees === 0
  const state: 'preparing' | 'empty' | 'normal' =
    noEmployees && preparingRole ? 'preparing'
    : noEmployees && roles.every((r) => r.documents === 0) ? 'empty'
    : 'normal'
  const person = (id: string | null) => (!readOnly && id ? { link: links.person(id) } : {})

  return (
    <Page>
      <PageHeader title="Overview" />
      <p role="status" className="sr-only">{announcement}</p>
      {state === 'preparing' && preparingRole && <PreparingCard role={preparingRole} readOnly={readOnly} />}
      {state === 'empty' && <EmptyCard first={roles[0]} readOnly={readOnly} />}
      {state === 'normal' && (
        <>
          <section aria-labelledby="overview-figures" className="flex flex-col gap-4">
            <h2 id="overview-figures" className="sr-only">Figures</h2>
            <StatsCard>
              <Stat label="Employees" value={t.employees} link={links.people} />
              <Stat label="Proficient" value={t.proficientEmployees} link={links.people} />
              <Stat label="Avg. days to proficiency" value={t.daysToProficiency} unit="days" {...person(t.firstProficientUserId)} />
              <Stat label="Critical-step errors this week" value={t.criticalErrorsThisWeek} {...person(t.openErrorUserId)} />
              <Stat label="Documents awaiting review" value={t.documentsToReview} {...(readOnly ? {} : { link: links.questions() })} />
            </StatsCard>
          </section>
          {nextStep && !readOnly && (
            <Banner
              action={<Button variant="accent" asChild><Link {...links.questions({ role: nextStep.roleId })}>Review questions</Link></Button>}
            >
              <strong>Next step:</strong> review {plural(nextStep.unreviewed, 'new question', 'new questions')} from {nextStep.documentTitle}.
            </Banner>
          )}
        </>
      )}
      <RolesSection roles={roles} readOnly={readOnly} />
    </Page>
  )
}

const FIGURES = ['a', 'b', 'c', 'd', 'e']

export function OverviewLoading() {
  return (
    <Page>
      <PageHeader title="Overview" />
      <div aria-hidden className="grid grid-cols-2 overflow-hidden rounded-md border border-border bg-surface-card sm:auto-cols-fr sm:grid-flow-col sm:grid-cols-none">
        {FIGURES.map((k) => (
          <div key={k} className="flex flex-col gap-3 border-b border-border p-4 odd:border-r last:border-b-0 [&:last-child:nth-child(odd)]:col-span-2 [&:last-child:nth-child(odd)]:border-r-0 sm:border-r sm:border-b-0 sm:last:border-r-0 sm:[&:last-child:nth-child(odd)]:col-span-1">
            <Skel className="h-4 w-24" />
            <Skel className="h-8 w-14" />
          </div>
        ))}
      </div>
      <TableSkeleton
        caption="Job roles and their training status"
        status="Loading overview"
        columns={[
          { key: 'role', header: 'Role' },
          { key: 'training', header: 'Training' },
          { key: 'benchmark', header: 'Benchmark', align: 'end' },
          { key: 'onboarding', header: 'Onboarding', align: 'end' },
          { key: 'people', header: 'People', align: 'end' },
        ]}
      />
    </Page>
  )
}
