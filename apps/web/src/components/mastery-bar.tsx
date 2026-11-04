import { useEffect, useState } from 'react'
import { Progress } from '@/components/ui/progress'
import { cn } from '@/lib/utils'

// `from` animates the bar from the old mastery to the new one on mount.
// Progress doesn't forward `value` to Radix, so the ARIA value is set here.
// `estimate` swaps the fill for a dashed outline (a placement guess, not measured).
// `benchmark` (0..1) draws a tick on the track; `valueText` is what screen readers hear.
export function MasteryBar({
  value,
  from,
  benchmark,
  estimate,
  valueText,
  label,
  className,
  barClassName,
}: {
  value: number
  from?: number
  benchmark?: number
  estimate?: boolean
  valueText?: string
  label: string
  className?: string
  barClassName?: string
}) {
  const [shown, setShown] = useState(from ?? value)
  useEffect(() => setShown(value), [value])
  const bar = (
    <Progress
      value={estimate ? 0 : shown * 100}
      aria-label={label}
      aria-valuenow={Math.round(value * 100)}
      aria-valuetext={valueText}
      className={cn('h-2 *:motion-reduce:transition-none', barClassName, benchmark === undefined && !estimate && className)}
    />
  )
  if (benchmark === undefined && !estimate) return bar
  return (
    <div className={cn('relative', className)}>
      {bar}
      {estimate && (
        <span
          aria-hidden
          className="absolute inset-y-0 left-0 rounded-full border-2 border-dashed border-ink-muted"
          style={{ width: `${shown * 100}%` }}
        />
      )}
      {benchmark !== undefined && (
        <span
          aria-hidden
          className="absolute -top-1 -bottom-1 -ml-px w-0.5 rounded-[1px] bg-ink"
          style={{ left: `${benchmark * 100}%` }}
        />
      )}
    </div>
  )
}
