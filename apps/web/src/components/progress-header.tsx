import { X } from 'lucide-react'
import { ReadAloudButton } from '@/components/question/read-aloud-button'

export function ProgressHeader({
  position,
  total,
  totalKnown = true,
  onEnd,
  endDisabled,
  readAloud,
}: {
  position: number
  total: number
  totalKnown?: boolean
  onEnd: () => void
  endDisabled?: boolean
  readAloud: string[] | null
}) {
  const count = !totalKnown ? `Question ${position}` : `${position} of ${total}`
  const percent = totalKnown && total > 0 ? Math.min(100, (position / total) * 100) : 0
  return (
    <div className="flex h-14 items-center gap-2">
      <button
        type="button"
        aria-label="End session"
        onClick={onEnd}
        disabled={endDisabled}
        className="-ml-3 flex size-12 shrink-0 items-center justify-center rounded-md text-ink outline-none hover:bg-surface-sunken focus-visible:ring-2 focus-visible:ring-brand focus-visible:ring-offset-2 disabled:opacity-50"
      >
        <X className="size-6" aria-hidden />
      </button>
      <div className="flex min-w-0 flex-1 items-center gap-3">
        <div
          role="progressbar"
          aria-label="Session progress"
          aria-valuemin={0}
          aria-valuemax={totalKnown ? total : undefined}
          aria-valuenow={!totalKnown ? undefined : position}
          aria-valuetext={count}
          className="h-2 min-w-8 flex-1 overflow-hidden rounded-full bg-surface-sunken"
        >
          <div
            className="h-full bg-brand transition-[width] duration-fast ease-out motion-reduce:transition-none"
            style={{ width: `${percent}%` }}
          />
        </div>
        <span aria-hidden className="shrink-0 text-overline text-ink-muted tabular-nums">
          {count}
        </span>
      </div>
      <ReadAloudButton texts={readAloud} />
    </div>
  )
}
