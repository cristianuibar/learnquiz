import { Upload } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { cn } from '@/lib/utils'

/** Empty-state drop target. Not focusable itself: the buttons inside are the keyboard path. */
export function Dropzone({ over, busy, pasteOpen, onPick, onPaste }: {
  over: boolean
  busy: boolean
  pasteOpen: boolean
  onPick: () => void
  onPaste: (opener: HTMLButtonElement) => void
}) {
  return (
    <div className={cn('flex flex-col items-center gap-4 rounded-md border-2 border-dashed px-6 py-12 text-center', over ? 'border-brand bg-brand-tint' : 'border-border-strong bg-surface-page')}>
      <Upload aria-hidden className="size-8 text-ink-muted" />
      <div>
        <p className="text-title-3 text-ink">Drop a PDF here</p>
        <p className="text-body text-ink-muted">PDF with selectable text · up to 10 MB</p>
      </div>
      <div className="flex flex-wrap items-center justify-center gap-3">
        <Button type="button" variant="accent" disabled={busy} onClick={onPick}>Upload PDF</Button>
        <Button type="button" variant="secondary" aria-expanded={pasteOpen} aria-controls="rd-paste" onClick={(e) => onPaste(e.currentTarget)}>Paste text</Button>
      </div>
    </div>
  )
}
