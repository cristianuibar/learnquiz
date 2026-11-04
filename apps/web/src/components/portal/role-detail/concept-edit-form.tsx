import { useEffect, useRef, useState } from 'react'
import { useRouter } from '@tanstack/react-router'
import { useServerFn } from '@tanstack/react-start'
import { CircleAlert } from 'lucide-react'
import { FieldError, fieldProps } from '@/components/admin/field-error'
import { errorMessage, fieldErrors } from '@/components/inline-error'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Switch } from '@/components/ui/switch'
import { Textarea } from '@/components/ui/textarea'
import { updateRoleConcept, type RoleDetail } from '@/server/role-detail'

type Concept = RoleDetail['units'][number]['concepts'][number]

export function ConceptEditForm({ concept, slug, onDone }: { concept: Concept; slug: string; onDone: () => void }) {
  const router = useRouter()
  const update = useServerFn(updateRoleConcept)
  const nameRef = useRef<HTMLInputElement>(null)
  const [critical, setCritical] = useState(concept.critical)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  const [fields, setFields] = useState<Record<string, string>>({})
  const nameId = `concept-${concept.id}-name`
  const summaryId = `concept-${concept.id}-summary`
  const critId = `concept-${concept.id}-critical`
  const critLabelId = `${critId}-label`

  useEffect(() => {
    nameRef.current?.focus()
  }, [])

  async function save(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault()
    const f = new FormData(e.currentTarget)
    setError('')
    setFields({})
    setBusy(true)
    try {
      await update({
        data: {
          slug,
          conceptId: concept.id,
          name: String(f.get('name')).trim(),
          summary: String(f.get('summary')).trim(),
          critical,
        },
      })
      await router.invalidate()
      onDone()
    } catch (err) {
      const found = fieldErrors(err)
      if (found.name || found.summary) setFields(found)
      else setError(errorMessage(err))
      setBusy(false)
    }
  }

  return (
    <form aria-label={`Edit concept: ${concept.name}`} onSubmit={save} className="col-span-full flex flex-col gap-4 bg-surface-page px-6 pt-5 pb-6">
      <div className="flex flex-col gap-2">
        <Label htmlFor={nameId}>Name</Label>
        <Input ref={nameRef} id={nameId} name="name" type="text" autoComplete="off" defaultValue={concept.name} {...fieldProps(nameId, fields.name)} />
        {fields.name && <FieldError id={nameId}>{fields.name}</FieldError>}
      </div>
      <div className="flex flex-col gap-2">
        <Label htmlFor={summaryId}>Summary</Label>
        <Textarea id={summaryId} name="summary" rows={2} defaultValue={concept.summary} {...fieldProps(summaryId, fields.summary)} />
        {fields.summary && <FieldError id={summaryId}>{fields.summary}</FieldError>}
      </div>
      {error && (
        <p role="alert" className="flex items-start gap-2 text-label text-ink">
          <CircleAlert aria-hidden className="mt-0.5 size-4 shrink-0" />
          <span>{error}</span>
        </p>
      )}
      <div className="flex flex-wrap items-center justify-between gap-4">
        <div className="flex items-center gap-2">
          <Switch id={critId} checked={critical} onCheckedChange={setCritical} aria-labelledby={critLabelId} />
          <label id={critLabelId} htmlFor={critId} className="cursor-pointer text-label text-ink">Critical</label>
        </div>
        <div className="flex gap-3">
          <Button type="button" variant="ghost" disabled={busy} onClick={onDone}>Cancel</Button>
          <Button type="submit" disabled={busy}>Save concept</Button>
        </div>
      </div>
    </form>
  )
}
