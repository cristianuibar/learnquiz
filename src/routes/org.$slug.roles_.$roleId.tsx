import { useEffect, useState } from 'react'
import { Link, createFileRoute, useRouter } from '@tanstack/react-router'
import { useServerFn } from '@tanstack/react-start'
import { RouteError, errorMessage, fieldErrors } from '@/components/inline-error'
import { RoleDocumentForm } from '@/components/role-document-form'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { plural } from '@/lib/utils'
import { generateRoleCurriculum, retryConceptGeneration } from '@/server/curriculum'
import { getRoleDetail, updateRoleConcept } from '@/server/role-detail'

export const Route = createFileRoute('/org/$slug/roles_/$roleId')({
  loader: ({ params }) => getRoleDetail({ data: { slug: params.slug, roleId: params.roleId } }),
  errorComponent: RouteError,
  component: RoleDetail,
})

type Detail = Awaited<ReturnType<typeof getRoleDetail>>
type Concept = Detail['units'][number]['concepts'][number]

const date = (at: number) => new Date(at).toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric', timeZone: 'UTC' })
const STATUS: Record<Concept['genStatus'], string> = { pending: 'Queued', generating: 'Generating questions', ready: 'Done', failed: 'Failed' }
const ring = 'outline-none focus-visible:ring-[3px] focus-visible:ring-ring/50'

function RoleDetail() {
  const detail = Route.useLoaderData()
  const { slug } = Route.useParams()
  const router = useRouter()
  const build = useServerFn(generateRoleCurriculum)
  const [building, setBuilding] = useState(false)
  const [buildError, setBuildError] = useState('')
  const { role, documents, units, readOnly } = detail
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

  return (
    <main className="mx-auto w-full max-w-5xl px-4 pt-8 pb-16">
      <Link to="/org/$slug/roles" params={{ slug }} className={`inline-flex min-h-11 items-center font-medium underline ${ring}`}>
        Job roles
      </Link>
      <h1 className="mt-4 text-3xl font-bold tracking-tight">{role.name}</h1>
      <p className="mt-2 text-sm text-muted-foreground">
        Benchmark: {Math.round(role.benchmark * 100)}% · Onboarding: {plural(role.onboardingDays, 'day', 'days')} · Curriculum: {role.topicStatus}
      </p>
      <div className="mt-8 flex flex-col gap-10 lg:grid lg:grid-cols-[minmax(0,1fr)_20rem] lg:items-start lg:gap-8">
        <section aria-labelledby="curriculum-heading" className="lg:order-1">
          <h2 id="curriculum-heading" className="text-xl font-semibold">Curriculum</h2>
          {concepts.length > 0 && (
            <p role="status" aria-live="polite" className="mt-2 text-sm text-muted-foreground">{done} of {plural(concepts.length, 'concept', 'concepts')} done</p>
          )}
          {units.length > 0 ? (
            <div className="mt-4 flex flex-col gap-6">
              {units.map((unit) => (
                <div key={unit.id}>
                  <h3 className="text-lg font-semibold">{unit.name}</h3>
                  <p className="text-sm text-muted-foreground">{unit.summary}</p>
                  <ul className="mt-3 flex flex-col gap-3">
                    {unit.concepts.map((c) => (
                      <ConceptItem key={c.id} concept={c} slug={slug} readOnly={readOnly} />
                    ))}
                  </ul>
                </div>
              ))}
            </div>
          ) : (
            <p className="mt-4 text-muted-foreground">
              {role.topicStatus === 'generating' ? 'Building the curriculum…' : 'No curriculum yet. Upload documents, then build the curriculum.'}
            </p>
          )}
        </section>
        <section aria-labelledby="documents-heading" className="lg:order-2">
          <h2 id="documents-heading" className="text-xl font-semibold">Documents</h2>
          {documents.length > 0 ? (
            <ul className="mt-4 flex flex-col gap-3">
              {documents.map((d) => (
                <li key={d.id} className="rounded-lg border p-3">
                  <p className="font-medium break-words">{d.title}</p>
                  <p className="text-sm text-muted-foreground">Version {d.version} · Uploaded {date(d.createdAt)}</p>
                </li>
              ))}
            </ul>
          ) : (
            <p className="mt-4 text-muted-foreground">No documents yet. Upload the material this role is trained on.</p>
          )}
          {canUpload && (
            <>
              <RoleDocumentForm slug={slug} roleId={role.id} roleName={role.name} onUploaded={() => router.invalidate()} />
              {documents.length > 0 && (
                <div className="mt-4 flex flex-col gap-2">
                  <Button type="button" className="h-11 self-start px-6" disabled={building} onClick={buildCurriculum}>
                    {building ? 'Building…' : 'Build curriculum'}
                  </Button>
                  {buildError && <p role="alert" className="text-sm font-medium text-wrong">{buildError}</p>}
                </div>
              )}
            </>
          )}
        </section>
      </div>
    </main>
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
        <span className="text-sm font-medium">{STATUS[c.genStatus]}</span>
      </div>
      <p className="text-sm text-muted-foreground">{c.summary}</p>
      {c.genStatus === 'failed' && (
        <div className="mt-2 flex flex-wrap items-center gap-3">
          {c.genError && <p className="text-sm text-wrong">{c.genError}</p>}
          {!readOnly && (
            <Button type="button" variant="outline" className="min-h-11" disabled={busy} onClick={() => run(() => retry({ data: { slug, conceptId: c.id } }))}>
              Retry
            </Button>
          )}
        </div>
      )}
      {!readOnly && !editing && (
        <div className="mt-2 flex flex-wrap items-center gap-4">
          <label className="inline-flex min-h-11 items-center gap-2 text-sm">
            <input
              type="checkbox"
              className={`size-5 ${ring}`}
              checked={c.critical}
              disabled={busy}
              onChange={(e) => run(() => update({ data: { slug, conceptId: c.id, critical: e.target.checked } }))}
            />
            Critical<span className="sr-only">: {c.name}</span>
          </label>
          <Button type="button" variant="outline" className="min-h-11" onClick={() => { setFields({}); setError(''); setEditing(true) }}>
            Edit<span className="sr-only"> {c.name}</span>
          </Button>
        </div>
      )}
      {readOnly && c.critical && <p className="mt-2 text-sm font-medium">Critical</p>}
      {editing && (
        <form className="mt-3 flex flex-col gap-4" onSubmit={save}>
          <div className="flex flex-col gap-2">
            <Label htmlFor={`name-${c.id}`}>Concept name</Label>
            <Input id={`name-${c.id}`} name="name" className="h-11" defaultValue={c.name} maxLength={80} required aria-invalid={!!fields.name || undefined} aria-describedby={fields.name ? `name-${c.id}-error` : undefined} />
            {fields.name && <p id={`name-${c.id}-error`} role="alert" className="text-sm font-medium text-wrong">{fields.name}</p>}
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
              aria-invalid={!!fields.summary || undefined}
              aria-describedby={fields.summary ? `summary-${c.id}-error` : undefined}
              className={`w-full rounded-md border border-input bg-transparent px-3 py-2 text-sm ${ring}`}
            />
            {fields.summary && <p id={`summary-${c.id}-error`} role="alert" className="text-sm font-medium text-wrong">{fields.summary}</p>}
          </div>
          <div className="flex gap-2">
            <Button type="submit" className="min-h-11 px-6" disabled={busy}>{busy ? 'Saving…' : 'Save'}</Button>
            <Button type="button" variant="outline" className="min-h-11 px-6" disabled={busy} onClick={() => setEditing(false)}>Cancel</Button>
          </div>
        </form>
      )}
      {error && <p role="alert" className="mt-2 text-sm font-medium text-wrong">{error}</p>}
    </li>
  )
}
