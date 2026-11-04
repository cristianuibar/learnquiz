import { useEffect, useRef, useState } from 'react'
import { Link, useRouter } from '@tanstack/react-router'
import { useServerFn } from '@tanstack/react-start'
import { ChevronRight } from 'lucide-react'
import { Banner } from '@/components/admin/banner'
import { FieldError, fieldProps } from '@/components/admin/field-error'
import { Page, PageHeader } from '@/components/admin/page'
import { errorMessage, fieldErrors } from '@/components/inline-error'
import { usePortal, usePortalLinks } from '@/components/portal/portal-context'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { plural } from '@/lib/utils'
import { generateRoleCurriculum, retryConceptGeneration } from '@/server/curriculum'
import { updateRoleConcept, type RoleDetail as RoleDetailData } from '@/server/role-detail'
import { DocumentsCard } from './documents-card'
import { PasteTextPanel } from './paste-text-panel'

type Concept = RoleDetailData['units'][number]['concepts'][number]

const STATUS: Record<Concept['genStatus'], string> = { pending: 'Queued', generating: 'Generating questions', ready: 'Done', failed: 'Failed' }
const ring = 'outline-none focus-visible:ring-[3px] focus-visible:ring-ring/50'

export function RoleDetail({ detail, readOnly }: { detail: RoleDetailData; readOnly: boolean }) {
  const { slug } = usePortal()
  const router = useRouter()
  const links = usePortalLinks()
  const build = useServerFn(generateRoleCurriculum)
  const [building, setBuilding] = useState(false)
  const [buildError, setBuildError] = useState('')
  const [pasteOpen, setPasteOpen] = useState(false)
  const opener = useRef<HTMLElement | null>(null)
  const { role, documents, units } = detail
  const concepts = units.flatMap((u) => u.concepts)
  const done = concepts.filter((c) => c.genStatus === 'ready').length
  const running = role.topicStatus === 'generating' || concepts.some((c) => c.genStatus === 'pending' || c.genStatus === 'generating')
  const canUpload = !readOnly && (role.topicStatus === 'draft' || role.topicStatus === 'failed')

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

  function togglePaste(el: HTMLElement) {
    opener.current = el
    setPasteOpen((open) => !open)
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
              <Link {...links.roles} className={`inline-flex min-h-11 items-center font-medium hover:underline ${ring}`}>Roles</Link>
              <ChevronRight aria-hidden className="size-4" />
            </li>
            <li><span aria-current="page">{role.name}</span></li>
          </ol>
        }
        title={role.name}
        meta={`Benchmark ${Math.round(role.benchmark * 100)}% · Onboarding ${plural(role.onboardingDays, 'day', 'days')} · ${plural(role.people, 'person', 'people')}`}
        actions={!readOnly && role.topicStatus === 'ready' ? (
          <Button asChild variant={pasteOpen ? 'secondary' : 'accent'}>
            <Link {...links.questions({ topicId: role.topicId })}>Review questions</Link>
          </Button>
        ) : undefined}
      />
      <div className="flex flex-col gap-10">
        <DocumentsCard
          detail={detail}
          readOnly={readOnly}
          pasteOpen={pasteOpen}
          onTogglePaste={togglePaste}
          panel={pasteOpen && canUpload ? (
            <PasteTextPanel roleId={role.id} onClose={closePaste} onAdded={async () => { setPasteOpen(false); await router.invalidate() }} />
          ) : null}
        />
        <section aria-labelledby="curriculum-heading" className="flex flex-col gap-4">
          <div className="flex min-h-11 flex-wrap items-center justify-between gap-4">
            <h2 id="curriculum-heading" className="text-title-2">Curriculum</h2>
            {canUpload && documents.length > 0 && (
              <div className="flex flex-wrap items-center gap-4">
                <span className="text-body text-ink-muted">{plural(documents.length, 'document', 'documents')}</span>
                <Button type="button" variant="accent" disabled={building} onClick={buildCurriculum}>
                  {building ? 'Building…' : 'Build curriculum'}
                </Button>
              </div>
            )}
          </div>
          {buildError && <Banner kind="alert">{buildError}</Banner>}
          {concepts.length > 0 && (
            <p role="status" aria-live="polite" className="text-caption text-ink-muted">{done} of {plural(concepts.length, 'concept', 'concepts')} done</p>
          )}
          {units.length > 0 ? (
            <div className="flex flex-col gap-6">
              {units.map((unit) => (
                <div key={unit.id}>
                  <h3 className="text-title-3">{unit.name}</h3>
                  <p className="text-caption text-ink-muted">{unit.summary}</p>
                  <ul className="mt-3 flex flex-col gap-3">
                    {unit.concepts.map((c) => (
                      <ConceptItem key={c.id} concept={c} slug={slug} readOnly={readOnly} />
                    ))}
                  </ul>
                </div>
              ))}
            </div>
          ) : role.topicStatus === 'generating' ? (
            <p className="text-body text-ink-muted">Building the curriculum…</p>
          ) : documents.length === 0 ? (
            <p className="rounded-md bg-surface-sunken px-6 py-4 text-body text-ink-muted">Add a document to build the curriculum.</p>
          ) : null}
        </section>
      </div>
    </Page>
  )
}

function ConceptItem({ concept: c, slug, readOnly }: { concept: Concept; slug: string; readOnly: boolean }) {
  const router = useRouter()
  const update = useServerFn(updateRoleConcept)
  const retry = useServerFn(retryConceptGeneration)
  const [editing, setEditing] = useState(false)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  const [fields, setFields] = useState<Record<string, string>>({})

  async function run(action: () => Promise<unknown>, onFail?: (err: unknown) => boolean) {
    setError('')
    setBusy(true)
    try {
      await action()
      await router.invalidate()
      return true
    } catch (err) {
      if (!onFail?.(err)) setError(errorMessage(err))
      return false
    } finally {
      setBusy(false)
    }
  }

  async function save(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault()
    const f = new FormData(e.currentTarget)
    setFields({})
    const ok = await run(
      () => update({ data: { slug, conceptId: c.id, name: String(f.get('name')).trim(), summary: String(f.get('summary')).trim() } }),
      (err) => {
        const found = fieldErrors(err)
        if (found.name || found.summary) {
          setFields(found)
          return true
        }
        return false
      },
    )
    if (ok) setEditing(false)
  }

  return (
    <li className="rounded-lg border p-4">
      <div className="flex flex-wrap items-start justify-between gap-2">
        <p className="font-medium">{c.name}</p>
        <span className="text-body font-medium">{STATUS[c.genStatus]}</span>
      </div>
      <p className="text-caption text-ink-muted">{c.summary}</p>
      {c.genStatus === 'failed' && (
        <div className="mt-2 flex flex-wrap items-center gap-3">
          {c.genError && <p className="text-body text-wrong">{c.genError}</p>}
          {!readOnly && (
            <Button type="button" variant="secondary" disabled={busy} onClick={() => run(() => retry({ data: { slug, conceptId: c.id } }))}>
              Retry
            </Button>
          )}
        </div>
      )}
      {!readOnly && !editing && (
        <div className="mt-2 flex flex-wrap items-center gap-4">
          <label className="inline-flex min-h-11 items-center gap-2 text-body">
            <input
              type="checkbox"
              className={`size-5 ${ring}`}
              checked={c.critical}
              disabled={busy}
              onChange={(e) => run(() => update({ data: { slug, conceptId: c.id, critical: e.target.checked } }))}
            />
            Critical<span className="sr-only">: {c.name}</span>
          </label>
          <Button type="button" variant="secondary" onClick={() => { setFields({}); setError(''); setEditing(true) }}>
            Edit<span className="sr-only"> {c.name}</span>
          </Button>
        </div>
      )}
      {readOnly && c.critical && <p className="mt-2 text-body font-medium">Critical</p>}
      {editing && (
        <form className="mt-3 flex max-w-xl flex-col gap-4" onSubmit={save}>
          <div className="flex flex-col gap-2">
            <Label htmlFor={`name-${c.id}`}>Concept name</Label>
            <Input id={`name-${c.id}`} name="name" defaultValue={c.name} maxLength={80} required {...fieldProps(`name-${c.id}`, fields.name)} />
            {fields.name && <FieldError id={`name-${c.id}`}>{fields.name}</FieldError>}
          </div>
          <div className="flex flex-col gap-2">
            <Label htmlFor={`summary-${c.id}`}>Summary</Label>
            <textarea
              id={`summary-${c.id}`}
              name="summary"
              rows={4}
              defaultValue={c.summary}
              maxLength={400}
              required
              {...fieldProps(`summary-${c.id}`, fields.summary)}
              className={`w-full rounded-md border border-input bg-transparent px-3 py-2 text-body ${ring}`}
            />
            {fields.summary && <FieldError id={`summary-${c.id}`}>{fields.summary}</FieldError>}
          </div>
          <div className="flex gap-2">
            <Button type="submit" className="px-6" disabled={busy}>{busy ? 'Saving…' : 'Save'}</Button>
            <Button type="button" variant="secondary" className="px-6" disabled={busy} onClick={() => setEditing(false)}>Cancel</Button>
          </div>
        </form>
      )}
      {error && <p role="alert" className="mt-2 text-body font-medium text-wrong">{error}</p>}
    </li>
  )
}
