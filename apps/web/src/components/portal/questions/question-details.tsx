import { useEffect, useRef, useState } from 'react'
import { Check, Pencil } from 'lucide-react'
import { useRouter } from '@tanstack/react-router'
import { errorMessage } from '@/components/inline-error'
import { usePortal } from '@/components/portal/portal-context'
import { Button } from '@/components/ui/button'
import type { ItemPayload } from '@/lib/llm/schemas'
import { reviewQuestion } from '@/server/question-review'
import { FlagGroup } from './flag-group'
import { QuestionEditor } from './question-editor'
import { isFlagged, shortDate, type Question, type Review } from './question-row'

export const FORMAT: Record<string, string> = {
  mcq: 'Multiple choice', multi: 'Multiple answer', order: 'Order the steps', cloze: 'Fill in the blank', short: 'Short answer', image: 'Image choice',
}

function typeLine(q: Question) {
  const fmt = FORMAT[q.payload.format] ?? q.payload.format
  if (q.reviewedAt !== null) return `${fmt} · Approved ${shortDate(q.reviewedAt)}${q.reviewerName ? ` · ${q.reviewerName}` : ''}`
  if (q.status === 'rejected' && q.check) return `${fmt} · Unreviewed · Checked automatically ${shortDate(q.createdAt)} · ${q.check.reasons[0] ?? ''}`
  return `${fmt} · Unreviewed · Generated ${shortDate(q.createdAt)}${q.source ? ` from ${q.source.title}` : ''}`
}

export function QuestionDetails({ question, slug, sources, stemId, onApprove, onAnnounce }: {
  question: Question
  slug: string
  sources: Review['sources']
  stemId: string
  // Called when Approve is pressed; the returned callback runs once the approval is saved and the data refreshed.
  onApprove: (id: string) => () => void
  onAnnounce: (message: string) => void
}) {
  const router = useRouter()
  const { readOnly } = usePortal()
  const [editing, setEditing] = useState(false)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  const editButton = useRef<HTMLButtonElement>(null)
  const refocusEdit = useRef(false)
  const p = question.payload
  const typed = p.format === 'cloze' || p.format === 'short'
  const ordered = p.format === 'order'

  useEffect(() => {
    if (!editing && refocusEdit.current) { refocusEdit.current = false; editButton.current?.focus() }
  }, [editing])

  async function act(action: 'approve' | 'retire') {
    setBusy(true)
    setError('')
    const approved = action === 'approve' ? onApprove(question.id) : null
    try {
      await reviewQuestion({ data: { slug, itemId: question.id, action } })
      await router.invalidate()
      if (approved) approved()
      else document.getElementById(stemId)?.focus()
    } catch (err) {
      setError(errorMessage(err))
    } finally {
      setBusy(false)
    }
  }

  async function save(payload: ItemPayload, sourceId: string | undefined) {
    setBusy(true)
    setError('')
    try {
      await reviewQuestion({ data: { slug, itemId: question.id, action: 'edit', payload, sourceId } })
      await router.invalidate()
      refocusEdit.current = true
      setEditing(false)
      onAnnounce('Changes saved. Review the question before approving it again.')
    } catch (err) {
      setError(errorMessage(err))
    } finally {
      setBusy(false)
    }
  }

  if (editing) {
    return (
      <QuestionEditor
        question={question}
        sources={sources}
        busy={busy}
        error={error}
        onSave={(payload, sourceId) => void save(payload, sourceId)}
        onCancel={() => { refocusEdit.current = true; setError(''); setEditing(false) }}
      />
    )
  }

  const canEdit = !readOnly && question.status !== 'retired'
  const canReview = canEdit && question.status !== 'rejected'
  return (
    <div className="flex flex-col gap-4">
      <p className="text-caption text-ink-muted">{typeLine(question)}</p>
      {typed ? (
        <div className="flex flex-col gap-1">
          <h5 className="text-label text-ink">Accepted answers</h5>
          <ul className="list-disc pl-5 text-body text-ink">{(p.accepted_answers.length ? p.accepted_answers : [p.model_answer]).map((a, i) => <li key={i}>{a}</li>)}</ul>
        </div>
      ) : (
        <ol aria-label="Answer options" className="flex flex-col gap-2">
          {p.options.map((o, i) => (
            <li key={o.id} className="flex gap-3 text-body text-ink">
              <span aria-hidden className="w-5 shrink-0 text-label text-ink-muted">{ordered ? i + 1 : 'ABCDEFGH'[i]}</span>
              <div className="flex min-w-0 flex-col">
                <span>{o.text}</span>
                {o.is_correct && !ordered ? (
                  <span className="flex items-center gap-1 text-caption text-ink"><Check aria-hidden className="size-4 shrink-0" />Correct answer</span>
                ) : null}
                {ordered ? null : o.is_correct ? null : o.feedback ? <span className="text-caption text-ink-muted">{`Feedback: ${o.feedback}`}</span> : <span className="text-caption text-ink-muted">No feedback</span>}
              </div>
            </li>
          ))}
        </ol>
      )}
      <div className="flex flex-col gap-1">
        <h5 className="text-label text-ink">Explanation</h5>
        <p className="text-body text-ink">{p.explanation}</p>
      </div>
      {p.source_quote ? (
        <figure className="flex flex-col gap-2 rounded-md bg-surface-sunken px-4 py-3">
          <blockquote className="text-body text-ink">{`“${p.source_quote}”`}</blockquote>
          {question.source ? <figcaption className="text-caption text-ink-muted">{`${question.source.title} v${question.source.version}`}</figcaption> : null}
        </figure>
      ) : (
        <p className="rounded-md border border-dashed border-border-strong px-4 py-3 text-caption text-ink-muted">No source quote</p>
      )}
      {question.flags.map((f) => <FlagGroup key={f.id} flag={f} id={`flag-${question.id}-${f.id}`} />)}
      {error && <p role="alert" className="rounded-md border border-border-strong px-4 py-3 text-body text-ink">{error}</p>}
      {canEdit && (
        <div className="flex flex-wrap justify-end gap-2 border-t border-border pt-4">
          {canReview && <Button variant="ghost" aria-describedby={stemId} disabled={busy} onClick={() => void act('retire')}>Retire</Button>}
          <Button ref={editButton} variant="secondary" aria-describedby={stemId} disabled={busy} onClick={() => { setError(''); setEditing(true) }}><Pencil aria-hidden />Edit</Button>
          {canReview && (
            <Button aria-describedby={stemId} disabled={busy} onClick={() => void act('approve')}>
              {isFlagged(question) ? 'Approve, resolve flag and next' : 'Approve and next'}
            </Button>
          )}
        </div>
      )}
    </div>
  )
}
