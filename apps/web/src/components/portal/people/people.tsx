import { useMemo, useRef, useState } from 'react'
import { Link, useNavigate, useRouter } from '@tanstack/react-router'
import { Check, CircleDot, Clock, Link as LinkIcon, Plus, type LucideIcon } from 'lucide-react'
import { Banner } from '@/components/admin/banner'
import { DataTable, NullCell, type Column } from '@/components/admin/data-table'
import { FilterChip, useChipGroup } from '@/components/admin/filter-chip'
import { Page, PageHeader } from '@/components/admin/page'
import { RowMenu } from '@/components/admin/row-menu'
import { SearchField } from '@/components/admin/search-field'
import { Status } from '@/components/admin/status-chip'
import { usePortalLinks } from '@/components/portal/portal-context'
import { Button } from '@/components/ui/button'
import { Card } from '@/components/ui/card'
import { Select } from '@/components/ui/select'
import { authClient } from '@/lib/auth-client'
import { cn, plural } from '@/lib/utils'
import type { getPeople, Person } from '@/server/people'
import { InviteDialog } from './invite-dialog'
import { createInvite, InviteLinkDialog, type InviteLink } from './invite-link-dialog'
import { ProgressCell } from './progress-cell'

type Org = Awaited<ReturnType<typeof getPeople>>
type PersonStatus = Person['status']

const pad = (n: number) => String(n).padStart(2, '0')
const monthDay = (at: number) => new Date(at).toLocaleDateString('en-US', { month: 'short', day: 'numeric', timeZone: 'UTC' })
const dayNumber = (at: number) => Math.floor(at / 86_400_000)

/** "today 10:42" / "yesterday" / "Oct 30", all in UTC. */
function lastActive(at: number | null) {
  if (at === null) return 'Not active yet'
  const days = dayNumber(Date.now()) - dayNumber(at)
  if (days === 0) { const d = new Date(at); return `Last active today ${pad(d.getUTCHours())}:${pad(d.getUTCMinutes())}` }
  return `Last active ${days === 1 ? 'yesterday' : monthDay(at)}`
}

const CHIPS: { status: PersonStatus; label: string; icon: LucideIcon }[] = [
  { status: 'invited', label: 'Invited', icon: LinkIcon },
  { status: 'active', label: 'Active', icon: CircleDot },
  { status: 'proficient', label: 'Proficient', icon: Check },
  { status: 'expired', label: 'Expired', icon: Clock },
]
const WORD = { invited: 'Invited', active: 'Active', proficient: 'Proficient', expired: 'Expired' } as const

const sub = 'text-[13px]/[18px] text-ink-muted'

export function People({ org, invite = false }: { org: Org; invite?: boolean }) {
  const links = usePortalLinks()
  const router = useRouter()
  const navigate = useNavigate()
  const [open, setOpen] = useState(invite && !org.readOnly)
  const [shown, setShown] = useState<InviteLink[] | null>(null)
  const [error, setError] = useState('')
  const opener = useRef<Element | null>(null)
  const [query, setQuery] = useState('')
  const [roleId, setRoleId] = useState('')
  const chips = useChipGroup<PersonStatus>('single')

  const q = query.trim().toLowerCase()
  const roleName = org.roles.find((r) => r.id === roleId)?.name
  const base = useMemo(() => org.people.filter((p) =>
    (!q || p.name.toLowerCase().includes(q) || p.email.toLowerCase().includes(q)) &&
    (!roleId || (p.kind === 'invite' ? p.jobRoleId === roleId : p.jobRole === roleName)),
  ), [org.people, q, roleId, roleName])
  const rows = base.filter((p) => chips.selected.size === 0 || chips.isPressed(p.status))
  const narrowed = rows.length !== org.people.length

  const heading = () => document.querySelector<HTMLElement>('h1')?.focus()
  // Both dialogs hand focus back to whatever opened the flow, or the page heading if that row is gone.
  const restoreFocus = (e: Event) => {
    e.preventDefault()
    const el = opener.current
    if (el instanceof HTMLElement && el.isConnected) el.focus()
    else heading()
  }
  const openInvite = () => { opener.current = document.activeElement; setOpen(true) }
  const closeInvite = () => {
    setOpen(false)
    if (invite) void navigate({ to: '.', search: {}, replace: true })
  }
  const showLinks = (invites: InviteLink[]) => { opener.current = document.activeElement; setShown(invites) }
  const cancelOld = async (p: InviteLink) => {
    setError('')
    const { error } = await authClient.organization.cancelInvitation({ invitationId: p.invitationId })
    if (error) setError(error.message ?? 'Could not revoke the invite')
    return !error
  }
  const revoke = async (p: InviteLink) => {
    if (await cancelOld(p)) { await router.invalidate(); heading() }
  }
  const renew = async (p: InviteLink) => {
    if (!(await cancelOld(p))) return
    const res = await createInvite(org.id, { name: p.name, email: p.email, jobRoleId: p.jobRoleId, jobRole: p.jobRole })
    // The old link is already gone, so the row leaves even when the new one fails.
    await router.invalidate()
    if (res.error) { setError(res.error.message ?? 'Could not create the invite'); return heading() }
    showLinks([res.invite])
  }

  const inviteButton = !org.readOnly && (
    <Button variant="accent" onClick={openInvite}>
      <Plus aria-hidden />
      Invite people
    </Button>
  )
  const dialog = org.readOnly ? null : (
    <>
      <InviteDialog
        open={open}
        onOpenChange={(o) => (o ? setOpen(true) : closeInvite())}
        organizationId={org.id}
        roles={org.roles}
        onCreated={async (invites) => { closeInvite(); await router.invalidate(); setShown(invites) }}
        onCloseAutoFocus={restoreFocus}
      />
      <InviteLinkDialog invites={shown} organizationId={org.id} baseUrl={org.baseUrl} onClose={() => setShown(null)} onCloseAutoFocus={restoreFocus} />
    </>
  )

  if (org.people.length === 0) {
    return (
      <Page>
        <PageHeader title="People" />
        {org.readOnly && <p className="text-body text-ink-muted">Staff view · Read only</p>}
        <Card className="max-w-[720px] flex-row flex-wrap items-center justify-between gap-4 p-6">
          <p className="text-body-lg text-ink">No one invited yet.</p>
          {inviteButton}
        </Card>
        {dialog}
      </Page>
    )
  }

  const columns: Column<Person>[] = [
    {
      // Name and status sit side by side when stacked, so they carry no stacked label.
      key: 'name', header: 'Name', label: '', stack: 'wide',
      cell: (p) => (
        <div className="flex flex-col">
          {p.kind === 'member' && !org.readOnly ? (
            <Link {...links.person(p.userId)} className="self-start font-semibold text-brand hover:underline focus-visible:outline-2">{p.name}</Link>
          ) : (
            <span className="font-semibold text-ink">{p.name}</span>
          )}
          <span className={sub}>{p.jobRole ?? 'No job role'}</span>
          {p.kind === 'invite' && <span className={sub}>{p.email}</span>}
        </div>
      ),
    },
    {
      key: 'status', header: 'Status', label: '', className: 'max-md:col-start-3 max-md:row-start-1 max-md:justify-self-end',
      cell: (p) => (
        <div className="flex flex-col items-start gap-1 max-md:items-end">
          <Status word={WORD[p.status]} />
          <span className={cn(sub, 'whitespace-nowrap')}>{p.kind === 'member' ? lastActive(p.lastActiveAt) : `Invited ${monthDay(p.invitedAt)}`}</span>
        </div>
      ),
    },
    {
      // Stacked, members keep errors beside progress; invites have none, so progress takes both columns.
      key: 'progress', header: 'Progress to benchmark', className: 'max-md:col-start-1 max-md:has-[[data-invite]]:col-span-2',
      cell: (p) => p.kind === 'member' ? (
        <div className="flex flex-col gap-1">
          <ProgressCell mastery={p.mastery} benchmark={p.benchmark} />
          <span className={cn(sub, 'whitespace-nowrap')}>
            {p.status === 'active' ? `Day ${p.day} of ${p.onboardingDays}`
              : p.proficientInDays === null ? 'Proficient' : `Proficient in ${plural(p.proficientInDays, 'day', 'days')}`}
          </span>
        </div>
      ) : (
        <div data-invite className="flex flex-col">
          <span className="text-ink-muted">Not joined</span>
          <span className={cn(sub, 'whitespace-nowrap')}>{p.status === 'expired' ? `Link expired ${monthDay(p.expiresAt)}` : `Link expires ${monthDay(p.expiresAt)}`}</span>
        </div>
      ),
    },
    {
      key: 'errors', header: 'Open critical errors', align: 'end', className: 'max-md:col-span-2 max-md:has-[[data-invite]]:hidden',
      cell: (p) => p.kind === 'member' ? p.openCriticalErrors : <span data-invite><NullCell label="Not joined" /></span>,
    },
  ]

  const toolbar = (
    <div className="flex flex-wrap items-center gap-3">
      <SearchField label="Search people" placeholder="Search by name or email" className="min-w-60 flex-1" value={query} onChange={(e) => setQuery(e.target.value)} />
      <span className="relative block w-[220px] min-w-[180px]">
        <label htmlFor="people-role" className="sr-only">Job role</label>
        <Select id="people-role" value={roleId} onChange={(e) => setRoleId(e.target.value)}>
          <option value="">All roles</option>
          {org.roles.map((r) => <option key={r.id} value={r.id}>{r.name}</option>)}
        </Select>
      </span>
      <div role="group" aria-label="Filter by status" className="flex flex-wrap gap-2">
        {CHIPS.map((c) => (
          <FilterChip key={c.status} icon={c.icon} pressed={chips.isPressed(c.status)} count={base.filter((p) => p.status === c.status).length} onClick={() => chips.toggle(c.status)}>
            {c.label}
          </FilterChip>
        ))}
      </div>
    </div>
  )
  const footer = (
    <p role="status" className="border-t border-border px-4 py-3 text-[13px]/[18px] text-ink-muted">
      {narrowed ? `${rows.length} of ${plural(org.people.length, 'person', 'people')}` : plural(org.people.length, 'person', 'people')}
    </p>
  )

  return (
    <Page>
      <PageHeader title="People" actions={inviteButton} />
      {org.readOnly && <p className="text-body text-ink-muted">Staff view · Read only</p>}
      <section aria-label={`People in ${org.name}`} className="flex flex-col gap-4">
        {error && <Banner kind="alert">{error}</Banner>}
        {toolbar}
        <DataTable
          stack
          caption="People and their training progress. In alphabetical order."
          columns={columns}
          rows={rows}
          rowKey={(p) => (p.kind === 'member' ? p.userId : p.invitationId)}
          actions={(p) => {
            if (org.readOnly || p.kind === 'member') return null
            const items = p.status === 'expired'
              ? [{ label: 'Create new link', onSelect: () => void renew(p) }, { label: 'Remove', onSelect: () => void revoke(p) }]
              : [{ label: 'Show invite link', onSelect: () => showLinks([p]) }, { label: 'Revoke', onSelect: () => void revoke(p) }]
            return <RowMenu label={p.name} menuLabel={`Actions for ${p.name}`} items={items} />
          }}
          footer={footer}
        />
      </section>
      {dialog}
    </Page>
  )
}
