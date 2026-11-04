import { useEffect, useLayoutEffect, useRef, useState } from 'react'
import { Link, useRouter } from '@tanstack/react-router'
import { useServerFn } from '@tanstack/react-start'
import { ChevronRight } from 'lucide-react'
import { Banner } from '@/components/admin/banner'
import { Page, PageHeader } from '@/components/admin/page'
import { errorMessage } from '@/components/inline-error'
import { usePortal, usePortalLinks } from '@/components/portal/portal-context'
import { Button } from '@/components/ui/button'
import { RoleDialog } from '@/components/portal/roles/role-dialog'
import { plural } from '@/lib/utils'
import { generateRoleCurriculum } from '@/server/curriculum'
import type { RoleDetail as RoleDetailData } from '@/server/role-detail'
import { Curriculum } from './curriculum'
import { DocumentsCard } from './documents-card'
import { PasteTextPanel } from './paste-text-panel'
import { useUpload } from './use-upload'

const ring = 'outline-none focus-visible:ring-[3px] focus-visible:ring-ring/50'

export function RoleDetail({ detail, readOnly }: { detail: RoleDetailData; readOnly: boolean }) {
  const { slug } = usePortal()
  const router = useRouter()
  const links = usePortalLinks()
  const build = useServerFn(generateRoleCurriculum)
  const [building, setBuilding] = useState(false)
  const [buildError, setBuildError] = useState('')
  const [pasteOpen, setPasteOpen] = useState(false)
  const [pasteFor, setPasteFor] = useState<string | undefined>()
  const opener = useRef<HTMLElement | null>(null)
  const { role, documents, units } = detail
  const [finished, setFinished] = useState<{ name: string; size: number; sourceId: string; refocus: boolean } | null>(null)
  const [announced, setAnnounced] = useState('')
  const [focusId, setFocusId] = useState('')
  const [editOpen, setEditOpen] = useState(false)
  const editButton = useRef<HTMLButtonElement>(null)
  const uploader = useUpload({
    orgSlug: slug,
    roleId: role.id,
    async onDone(result, file) {
      const refocus = document.activeElement?.id === 'rd-cancel-upload'
      setFinished({ name: file.name, size: file.size, sourceId: result.sourceId, refocus })
      await router.invalidate()
    },
  })
  const sending = typeof uploader.state === 'object' && 'loaded' in uploader.state
  const busy = sending || finished !== null
  let uploadStatus = announced
  if (typeof uploader.state === 'object' && 'loaded' in uploader.state) {
    const pct = (uploader.state.loaded / (uploader.state.total || 1)) * 100
    const q = Math.min(75, Math.floor(pct / 25) * 25)
    uploadStatus = q ? `Uploading ${uploader.state.file.name}, ${q}%` : ''
  }
  const ready = documents.filter((d) => d.status === 'ready').length
  const concepts = units.flatMap((u) => u.concepts)
  const running = role.topicStatus === 'generating' || concepts.some((c) => c.genStatus === 'pending' || c.genStatus === 'generating')
  const canUpload = !readOnly && (role.topicStatus === 'draft' || role.topicStatus === 'failed')

  useLayoutEffect(() => {
    if (!finished || !documents.some((d) => d.id === finished.sourceId)) return
    const added = documents.find((d) => d.id === finished.sourceId)!
    setAnnounced(added.status === 'failed' ? `${finished.name} uploaded. Extraction failed: ${added.error}` : `${finished.name} uploaded. ${plural(ready, 'document', 'documents')} ready.`)
    if (finished.refocus) setFocusId(`rd-replace-${finished.sourceId}`)
    setFinished(null)
  }, [finished, documents])

  // Replace is disabled until the hook settles, so focus waits for the card to be idle again.
  useLayoutEffect(() => {
    if (!focusId || busy) return
    document.getElementById(focusId)?.focus()
    setFocusId('')
  }, [focusId, busy])

  useEffect(() => {
    if (sending) setAnnounced('')
  }, [sending])

  useEffect(() => {
    if (!running) return
    const id = setInterval(() => void router.invalidate(), 5000)
    return () => clearInterval(id)
  }, [running, router])

  async function buildCurriculum() {
    setBuildError('')
    setBuilding(true)
    try {
      await build({ data: { slug, roleId: role.id } })
      await router.invalidate()
    } catch (err) {
      setBuildError(errorMessage(err))
    } finally {
      setBuilding(false)
    }
  }

  function togglePaste(el: HTMLElement, replacesId?: string) {
    opener.current = el
    setPasteFor(replacesId)
    setPasteOpen(!pasteOpen || pasteFor !== replacesId)
  }
  function closePaste() {
    setPasteOpen(false)
    opener.current?.focus()
  }

  return (
    <Page capped>
      <PageHeader
        crumbs={
          <ol className="flex flex-wrap items-center gap-1">
            <li className="flex items-center gap-1">
              <Link {...(readOnly ? links.overview : links.roles)} className={`inline-flex min-h-11 items-center font-medium hover:underline ${ring}`}>{readOnly ? 'Overview' : 'Roles'}</Link>
              <ChevronRight aria-hidden className="size-4" />
            </li>
            <li><span aria-current="page">{role.name}</span></li>
          </ol>
        }
        title={role.name}
        meta={`Benchmark ${Math.round(role.benchmark * 100)}% · Onboarding ${plural(role.onboardingDays, 'day', 'days')} · ${plural(role.people, 'person', 'people')}`}
        actions={!readOnly ? (
          <div className="flex flex-wrap items-center gap-3">
            <Button ref={editButton} type="button" variant="secondary" aria-haspopup="dialog" onClick={() => setEditOpen(true)}>Edit role</Button>
            {role.topicStatus === 'ready' && !running && (
              <Button asChild variant={pasteOpen ? 'secondary' : 'accent'}>
                <Link {...links.questions({ role: role.id })}>Review questions</Link>
              </Button>
            )}
          </div>
        ) : undefined}
      />
      <p role="status" aria-live="polite" className="sr-only">{uploadStatus}</p>
      {!readOnly && (
        <RoleDialog
          open={editOpen}
          onOpenChange={setEditOpen}
          slug={slug}
          role={role}
          onSaved={async () => { await router.invalidate(); setAnnounced('Role saved.'); setEditOpen(false) }}
          onCloseAutoFocus={(e) => { e.preventDefault(); editButton.current?.focus() }}
        />
      )}
      <div className="flex flex-col gap-10">
        <DocumentsCard
          uploader={uploader}
          finishing={finished}
          detail={detail}
          readOnly={readOnly}
          pasteOpen={pasteOpen}
          pasteFor={pasteFor}
          onTogglePaste={togglePaste}
          panel={pasteOpen && (canUpload || (pasteFor && !readOnly && role.topicStatus !== 'generating')) ? (
            <PasteTextPanel key={pasteFor ?? 'new'} replacesId={pasteFor} roleId={role.id} onClose={closePaste} onAdded={async (current) => { if (current) setPasteOpen(false); await router.invalidate() }} />
          ) : null}
        />
        <Curriculum
          detail={detail}
          readOnly={readOnly}
          announce={setAnnounced}
          error={buildError ? <Banner kind="alert">{buildError}</Banner> : null}
          controls={canUpload && busy ? (
            <Button type="button" variant="secondary" disabled>Build curriculum</Button>
          ) : canUpload && ready > 0 ? (
            <div className="flex flex-wrap items-center gap-4">
              <span className="text-body text-ink-muted">{plural(ready, 'document', 'documents')}</span>
              <Button type="button" variant="accent" disabled={building} onClick={buildCurriculum}>
                {building ? 'Building…' : 'Build curriculum'}
              </Button>
            </div>
          ) : null}
        />
      </div>
    </Page>
  )
}
