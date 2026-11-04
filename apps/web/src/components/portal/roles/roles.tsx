import { useRef, useState } from 'react'
import { Link, useNavigate } from '@tanstack/react-router'
import { File, Plus } from 'lucide-react'
import { Banner } from '@/components/admin/banner'
import { DataTable, type Column } from '@/components/admin/data-table'
import { Page, PageHeader } from '@/components/admin/page'
import { RowMenu } from '@/components/admin/row-menu'
import { Status, StatusChip } from '@/components/admin/status-chip'
import { usePortalLinks } from '@/components/portal/portal-context'
import { Button } from '@/components/ui/button'
import { plural } from '@/lib/utils'
import type { listRoles } from '@/server/org'
import { RoleDialog } from './role-dialog'

type Org = Awaited<ReturnType<typeof listRoles>>
type Role = Org['roles'][number]

const sub = 'text-[13px]/[18px] text-ink-muted'

// Failed topic, or documents that failed with none ready to fall back on, even if the topic was built before.
const failed = (r: Role) =>
  r.topicStatus === 'failed' || (r.failedDocuments > 0 && r.documentCount === r.failedDocuments)

export function Roles({ org }: { org: Org }) {
  const links = usePortalLinks()
  const navigate = useNavigate()
  const [open, setOpen] = useState(false)
  const opener = useRef<Element | null>(null)
  const created = useRef(false)

  const restoreFocus = (e: Event) => {
    e.preventDefault()
    if (created.current) { created.current = false; return }
    const el = opener.current
    if (el instanceof HTMLElement && el.isConnected) el.focus()
    else document.querySelector<HTMLElement>('h1')?.focus()
  }
  const openDialog = () => { opener.current = document.activeElement; created.current = false; setOpen(true) }
  const openRole = (roleId: string) => void navigate({ to: '/org/$slug/roles/$roleId', params: { slug: org.slug, roleId } })

  const fresh = org.roles.length === 1 && org.roles[0].documentCount === 0
  const failedRoles = org.roles.filter(failed)

  const columns: Column<Role>[] = [
    {
      key: 'role', header: 'Role', stack: 'full',
      cell: (r) => <Link {...links.role(r.id)} className="font-semibold text-brand hover:underline focus-visible:outline-2">{r.name}</Link>,
    },
    {
      key: 'training', header: 'Training', stack: 'full',
      cell: (r) => {
        if (failed(r)) return <Status word="Training failed" />
        if (r.topicStatus === 'generating' || r.preparing) {
          return (
            <div className="flex flex-col items-start gap-1">
              <Status word="Preparing training" />
              <span className={sub}>{r.conceptsReady} of {r.conceptsTotal} concepts</span>
            </div>
          )
        }
        if (r.topicStatus === 'ready') return <Status word="Ready" />
        if (r.documentCount === 0) {
          return (
            <div className="flex flex-wrap items-center gap-2">
              <Status word="No documents yet" />
              <Button asChild variant="link">
                <Link {...links.role(r.id)} aria-label={`Upload SOP for ${r.name}`}>Upload SOP</Link>
              </Button>
            </div>
          )
        }
        return <StatusChip tone="settled" icon={File}>Documents added</StatusChip>
      },
    },
    { key: 'benchmark', header: 'Benchmark', align: 'end', cell: (r) => `${Math.round(r.benchmark * 100)}%` },
    { key: 'onboarding', header: 'Onboarding', align: 'end', cell: (r) => plural(r.onboardingDays, 'day', 'days') },
    { key: 'people', header: 'People', align: 'end', cell: (r) => r.peopleCount },
  ]

  return (
    <Page>
      <PageHeader
        title="Roles"
        actions={
          <Button variant={fresh ? 'secondary' : 'primary'} aria-haspopup="dialog" onClick={openDialog}>
            <Plus aria-hidden />
            Create role
          </Button>
        }
      />
      {failedRoles.map((r) => {
        // A build that failed on readable documents is rebuilt from the role; only failed or missing documents need fixing.
        const action = r.failedDocuments > 0 ? 'Fix documents' : r.documentCount > 0 ? 'Open role' : 'Upload SOP'
        return (
          <Banner
            key={r.id}
            kind="alert"
            action={<Button asChild variant="secondary"><Link {...links.role(r.id)}>{action}</Link></Button>}
          >
            <strong>{r.name} training failed.</strong>{' '}
            {r.failedDocuments > 0
              ? `${plural(r.failedDocuments, 'document', 'documents')} ${r.failedDocuments === 1 ? 'has' : 'have'} no selectable text. Replace them or paste the text.`
              : r.documentCount > 0
                ? 'The curriculum build did not finish. Build the curriculum again.'
                : 'Add a document to build the curriculum.'}
          </Banner>
        )
      })}
      <DataTable
        stack
        caption="Job roles with training status, benchmark, onboarding period and people assigned"
        columns={columns}
        rows={org.roles}
        rowKey={(r) => r.id}
        actions={(r) => (
          <RowMenu
            label={r.name}
            items={[
              { label: 'Open role', onSelect: () => openRole(r.id) },
              { label: 'Review questions', onSelect: () => void navigate({ to: '/org/$slug/questions', params: { slug: org.slug }, search: { role: r.id } }) },
            ]}
          />
        )}
      />
      <RoleDialog
        open={open}
        onOpenChange={setOpen}
        slug={org.slug}
        onSaved={(id) => { created.current = true; setOpen(false); openRole(id) }}
        onCloseAutoFocus={restoreFocus}
      />
    </Page>
  )
}
