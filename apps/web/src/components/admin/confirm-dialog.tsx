import { useEffect, useId, useLayoutEffect, useRef, useState } from 'react'
import type { ReactNode } from 'react'
import type { LucideIcon } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Dialog, DialogClose, DialogContent, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { Label } from '@/components/ui/label'
import { Textarea } from '@/components/ui/textarea'
import { Banner } from './banner'
import { FieldError } from './field-error'

const REASON_ERROR = 'Enter a reason. Other staff see it in the user list.'

export function ConfirmDialog({ open, onOpenChange, title, consequences, verb, object, onConfirm, reason: askReason, description, returnFocus }: {
  open: boolean
  onOpenChange: (open: boolean) => void
  title: string
  consequences: { icon: LucideIcon; text: React.ReactNode }[]
  verb: string
  object: string
  onConfirm: (reason?: string) => void | Promise<void>
  reason?: boolean
  description?: ReactNode
  /** Element to focus on close instead of the opener (e.g. after a successful action); return null for the opener. */
  returnFocus?: () => HTMLElement | null | undefined
}) {
  const id = useId()
  const reasonId = `${id}-reason`
  const descId = `${id}-desc`
  const listId = `${id}-list`
  const cancelRef = useRef<HTMLButtonElement>(null)
  const reasonRef = useRef<HTMLTextAreaElement>(null)
  const pendingRef = useRef(false)
  const openerRef = useRef<HTMLElement | null>(null)
  const [reason, setReason] = useState('')
  const [error, setError] = useState('')
  const [failure, setFailure] = useState('')
  const [pending, setPending] = useState(false)

  // Callers open this from plain buttons, not DialogTrigger, so Radix has no trigger to give focus back to.
  useLayoutEffect(() => {
    if (open && document.activeElement instanceof HTMLElement) openerRef.current = document.activeElement
  }, [open])

  useEffect(() => {
    setReason('')
    setError('')
    setFailure('')
  }, [open])

  async function confirm() {
    if (pendingRef.current) return
    const trimmed = reason.trim()
    if (askReason && !trimmed) {
      setError(REASON_ERROR)
      reasonRef.current?.focus()
      return
    }
    setError('')
    setFailure('')
    pendingRef.current = true
    setPending(true)
    try {
      await onConfirm(askReason ? trimmed : undefined)
      onOpenChange(false)
    } catch (err) {
      setFailure(err instanceof Error && err.message ? err.message : 'Something went wrong. Try again.')
    } finally {
      pendingRef.current = false
      setPending(false)
    }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      {/* Long consequence lists scroll inside the dialog so the confirm controls stay on screen. */}
      <DialogContent initialFocus={askReason ? reasonRef : cancelRef} aria-describedby={description ? descId : listId}
        className="flex flex-col md:max-h-[calc(100dvh-2rem)]"
        onCloseAutoFocus={(event) => {
          event.preventDefault()
          const target = returnFocus?.()
          if (target?.isConnected) target.focus()
          else if (openerRef.current?.isConnected) openerRef.current.focus()
        }}
      >
        <DialogHeader>
          <DialogTitle>{title}</DialogTitle>
          {description && <p id={descId} className="text-body text-ink-muted">{description}</p>}
        </DialogHeader>
        {askReason && (
          <div className="flex flex-col gap-2">
            <Label htmlFor={reasonId}>Reason</Label>
            <Textarea
              id={reasonId}
              ref={reasonRef}
              rows={2}
              required
              aria-required="true"
              value={reason}
              onChange={(e) => setReason(e.target.value)}
              aria-invalid={error ? true : undefined}
              aria-describedby={error ? `${reasonId}-hint ${reasonId}-error` : `${reasonId}-hint`}
            />
            <p id={`${reasonId}-hint`} className="text-caption text-ink-muted">Only Learn Quiz staff see this.</p>
            {error && <FieldError id={reasonId}>{error}</FieldError>}
          </div>
        )}
        {/* The region scrolls; the list inside stays unlabelled so it still describes the dialog by its own text. */}
        <div role="region" aria-label="Consequences" tabIndex={0} className="-m-1 min-h-0 overflow-y-auto p-1 focus-visible:outline-2 focus-visible:outline-brand">
          <ul id={listId} className="flex flex-col gap-3">
            {consequences.map(({ icon: Icon, text }, i) => (
              <li key={i} className="flex items-start gap-3 text-body text-ink">
                <Icon aria-hidden className="mt-px size-5 shrink-0 text-ink-muted" />
                <span>{text}</span>
              </li>
            ))}
          </ul>
        </div>
        {failure && <Banner kind="alert">{failure}</Banner>}
        <DialogFooter>
          <DialogClose asChild>
            <Button ref={cancelRef} variant="secondary">Cancel</Button>
          </DialogClose>
          <Button variant="danger" aria-disabled={pending || undefined} aria-busy={pending || undefined} onClick={() => void confirm()}>
            {verb} {object}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
