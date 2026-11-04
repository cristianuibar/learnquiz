import { useEffect, useRef, useState } from 'react'
import { useRouter } from '@tanstack/react-router'
import { useServerFn } from '@tanstack/react-start'
import { CircleAlert, Pencil, RotateCw } from 'lucide-react'
import { FieldError } from '@/components/admin/field-error'
import { Status } from '@/components/admin/status-chip'
import { errorMessage } from '@/components/inline-error'
import { Button } from '@/components/ui/button'
import { Switch } from '@/components/ui/switch'
import { retryConceptGeneration } from '@/server/curriculum'
import { updateRoleConcept, type RoleDetail } from '@/server/role-detail'
import { ConceptEditForm } from './concept-edit-form'

type Concept = RoleDetail['units'][number]['concepts'][number]

// Shared by the column header row so both stack below a 560px list.
export const rowGrid = 'grid grid-cols-[minmax(0,1fr)_auto] gap-x-6 gap-y-2 px-6 @max-[560px]:grid-cols-1'
// Below 560px the controls sit left, so the Questions cell keeps the header's width.
export const questionCell = '@max-[560px]:min-w-16'

export function ConceptRow({ concept, slug, readOnly, critHeaderId }: { concept: Concept; slug: string; readOnly: boolean; critHeaderId: string }) {
  const router = useRouter()
  const update = useServerFn(updateRoleConcept)
  const retry = useServerFn(retryConceptGeneration)
  const [editing, setEditing] = useState(false)
  const [critical, setCritical] = useState(concept.critical)
  const [error, setError] = useState('')
  const editRef = useRef<HTMLButtonElement>(null)
  const wasEditing = useRef(false)
  // Critical saves run one at a time so the last choice is the last write.
  const saving = useRef(Promise.resolve())
  const saved = useRef(concept.critical)
  const latest = useRef(0)
  const nameId = `concept-${concept.id}-title`
  const failedId = `concept-${concept.id}-failed`

  useEffect(() => {
    saved.current = concept.critical
    setCritical(concept.critical)
  }, [concept.critical])

  useEffect(() => {
    if (wasEditing.current && !editing) editRef.current?.focus()
    wasEditing.current = editing
  }, [editing])

  function toggle(next: boolean) {
    const seq = ++latest.current
    setError('')
    setCritical(next)
    saving.current = saving.current.then(async () => {
      // A newer choice is queued behind this one, so skip the stale write.
      if (seq !== latest.current) return
      try {
        await update({ data: { slug, conceptId: concept.id, critical: next } })
        saved.current = next
        if (seq === latest.current) await router.invalidate()
      } catch (err) {
        if (seq !== latest.current) return
        setCritical(saved.current)
        setError(errorMessage(err))
      }
    })
  }

  async function retryGeneration() {
    setError('')
    try {
      await retry({ data: { slug, conceptId: concept.id } })
      await router.invalidate()
    } catch (err) {
      setError(errorMessage(err))
    }
  }

  if (editing) {
    return (
      <li className="grid border-t border-border">
        <ConceptEditForm concept={{ ...concept, critical }} slug={slug} onDone={() => setEditing(false)} />
      </li>
    )
  }

  const failed = concept.genStatus === 'failed'

  return (
    <li className={`${rowGrid} border-t border-border py-3`}>
      <div className="flex min-w-0 flex-col gap-0.5">
        <span id={nameId} className="text-label text-ink">{concept.name}</span>
        <span className="text-body text-ink-muted">{concept.summary}</span>
        {failed && (
          <div className="mt-1">
            <FieldError id={failedId}>
              Couldn't generate questions.{concept.genError ? ` ${concept.genError}` : ''}
            </FieldError>
          </div>
        )}
      </div>
      <div className="flex flex-wrap items-center gap-4">
        <div className={`flex items-center gap-2 ${questionCell}`}>
          {concept.genStatus === 'ready' && <span className="text-body text-ink-muted tabular-nums">{concept.questionCount}</span>}
          {concept.genStatus === 'pending' && <Status word="Queued" />}
          {concept.genStatus === 'generating' && <Status word="Generating questions" />}
          {failed && (
            <>
              <Status word="Failed" />
              {!readOnly && (
                <Button type="button" variant="ghost" aria-label={`Retry questions for ${concept.name}`} onClick={retryGeneration}>
                  <RotateCw aria-hidden />
                  Retry
                </Button>
              )}
            </>
          )}
        </div>
        {!readOnly ? (
          <>
            <span className="inline-flex w-[52px] justify-center">
              <Switch checked={critical} onCheckedChange={toggle} aria-labelledby={`${critHeaderId} ${nameId}`} />
            </span>
            <Button
              ref={editRef}
              type="button"
              variant="ghost"
              size="icon"
              aria-label={`Edit concept: ${concept.name}`}
              disabled={concept.genStatus !== 'ready'}
              onClick={() => { setError(''); setEditing(true) }}
            >
              <Pencil aria-hidden />
            </Button>
          </>
        ) : (
          <span className="inline-flex w-[92px]">{concept.critical && <Status word="Critical" />}</span>
        )}
      </div>
      {error && (
        <p role="alert" className="col-span-full flex items-start gap-2 text-label text-ink">
          <CircleAlert aria-hidden className="mt-0.5 size-4 shrink-0" />
          <span>{error}</span>
        </p>
      )}
    </li>
  )
}
