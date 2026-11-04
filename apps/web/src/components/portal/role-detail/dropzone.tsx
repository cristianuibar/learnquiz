import { AlignLeft, Upload } from 'lucide-react'
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
      <Upload aria-hidden className="size-6 text-ink-muted" />
      <div className="flex flex-col gap-1">
        <p className="text-body-lg font-semibold text-ink">Drop a PDF here</p>
        <p className="text-caption text-ink-muted">PDF with selectable text · up to 10 MB</p>
      </div>
      <div className="flex flex-wrap items-center justify-center gap-3">
        <Button type="button" variant="accent" disabled={busy} onClick={onPick}><Upload aria-hidden />Upload PDF</Button>
        <Button type="button" variant="secondary" aria-expanded={pasteOpen} aria-controls="rd-paste" onClick={(e) => onPaste(e.currentTarget)}><AlignLeft aria-hidden />Paste text</Button>
      </div>
    </div>
  )
}
