import { useEffect, useId, useRef, useState, type KeyboardEvent } from 'react'
import { motion, useReducedMotion } from 'motion/react'
import { useServerFn } from '@tanstack/react-start'
import { ChevronLeft } from 'lucide-react'
import { ErrorRow } from '@/components/question/error-row'
import { Button } from '@/components/ui/button'
import { Label } from '@/components/ui/label'
import { Textarea } from '@/components/ui/textarea'
import { cn } from '@/lib/utils'
import { reportItem } from '@/server/play'
import { reportReasons, type ReportReason } from '@learnquiz/api/reveal'
import { reportFailed } from '@learnquiz/api/system-copy'

export function ReportSheet({
  itemId,
  attemptId,
  company,
  onBack,
  onSent,
}: {
  itemId: string
  attemptId: string | null
  company?: string | null
  onBack(): void
  onSent(): void
}) {
  const report = useServerFn(reportItem)
  const reduce = useReducedMotion()
  const headingId = useId()
  const noteId = useId()
  const heading = useRef<HTMLHeadingElement>(null)
  const [reason, setReason] = useState<ReportReason | null>(null)
  const [note, setNote] = useState('')
  const [busy, setBusy] = useState(false)
  const [failed, setFailed] = useState(false)
  useEffect(() => heading.current?.focus(), [])

  const send = async () => {
    if (!reason || busy) return
    setFailed(false)
    setBusy(true)
    try {
      await report({ data: { itemId, reason, note: note.trim(), attemptId } })
    } catch {
      setFailed(true)
      setBusy(false)
      return
    }
    setBusy(false)
    onSent()
  }

  const onKeyDown = (e: KeyboardEvent<HTMLButtonElement>, index: number) => {
    const step = e.key === 'ArrowDown' || e.key === 'ArrowRight' ? 1 : e.key === 'ArrowUp' || e.key === 'ArrowLeft' ? -1 : 0
    if (!step) return
    e.preventDefault()
    const next = reportReasons[(index + step + reportReasons.length) % reportReasons.length]
    setReason(next.code)
    const radios = e.currentTarget.parentElement?.querySelectorAll<HTMLButtonElement>('[role="radio"]')
    radios?.[(index + step + reportReasons.length) % reportReasons.length]?.focus()
  }

  return (
    <>
      <div aria-hidden className="fixed inset-0 z-40 bg-scrim" />
      <motion.section
        role="dialog"
        aria-modal="true"
        aria-labelledby={headingId}
        initial={reduce ? false : { opacity: 0, y: 32 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.3, ease: [0.2, 0, 0, 1] }}
        className="fixed inset-x-0 bottom-0 z-50 mx-auto flex max-h-[calc(100%-48px)] max-w-md flex-col overflow-hidden rounded-t-lg bg-surface-card shadow-raised"
      >
        <div className="flex items-center gap-1 pt-2 pr-4 pl-2">
          <Button variant="ghost" size="icon" aria-label="Back to result" onClick={onBack}>
            <ChevronLeft aria-hidden />
          </Button>
          <h2
            id={headingId}
            ref={heading}
            tabIndex={-1}
            className="text-title-2 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-brand"
          >
            Report this question
          </h2>
        </div>
        <div className="flex flex-1 flex-col gap-4 overflow-y-auto px-4 pt-2 pb-4">
          <div role="radiogroup" aria-labelledby={headingId} className="divide-y divide-border border-b border-border">
            {reportReasons.map((option, index) => {
              const checked = reason === option.code
              return (
                <button
                  key={option.code}
                  type="button"
                  role="radio"
                  aria-checked={checked}
                  tabIndex={checked || (reason === null && index === 0) ? 0 : -1}
                  onClick={() => setReason(option.code)}
                  onKeyDown={(e) => onKeyDown(e, index)}
                  className="flex min-h-12 w-full items-center gap-3 py-3 text-left text-body text-ink hover:bg-surface-sunken active:bg-surface-sunken focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-brand"
                >
                  <span
                    aria-hidden
                    className={cn(
                      'flex size-5 shrink-0 items-center justify-center rounded-full border-2',
                      checked ? 'border-brand' : 'border-border-strong',
                    )}
                  >
                    {checked && <span className="size-3 rounded-full bg-brand" />}
                  </span>
                  {option.label}
                </button>
              )
            })}
          </div>
          <div className="flex flex-col gap-2">
            <Label htmlFor={noteId}>Add a note (optional)</Label>
            <Textarea
              id={noteId}
              rows={2}
              maxLength={300}
              className="field-sizing-fixed"
              value={note}
              onChange={(e) => setNote(e.target.value)}
            />
          </div>
          {company && <p className="text-caption text-ink-muted">Goes to {company}’s training team.</p>}
        </div>
        <div className="flex flex-col gap-1 border-t border-border px-4 pt-3 pb-[calc(12px+env(safe-area-inset-bottom))]">
          {failed && <ErrorRow message={reportFailed} />}
          <Button size="lg" className="w-full" disabled={!reason || busy} onClick={send}>
            Send report
          </Button>
          <Button variant="ghost" className="w-full" onClick={onBack}>
            Cancel
          </Button>
        </div>
      </motion.section>
    </>
  )
}
