import { useEffect, useState } from 'react'
import { Progress } from '@/components/ui/progress'
import { cn } from '@/lib/utils'

// `from` animates the bar from the old mastery to the new one on mount.
// Progress doesn't forward `value` to Radix, so the ARIA value is set here.
// `benchmark` (0..1) draws a tick on the track; `valueText` is what screen readers hear.
export function MasteryBar({
  value,
  from,
  benchmark,
  valueText,
  label,
  className,
}: {
  value: number
  from?: number
  benchmark?: number
  valueText?: string
  label: string
  className?: string
}) {
  const [shown, setShown] = useState(from ?? value)
  useEffect(() => setShown(value), [value])
  const bar = (
    <Progress
      value={shown * 100}
      aria-label={label}
      aria-valuenow={Math.round(value * 100)}
      aria-valuetext={valueText}
      className={cn('h-2 *:motion-reduce:transition-none', benchmark === undefined && className)}
    />
  )
  if (benchmark === undefined) return bar
  return (
    <div className={cn('relative', className)}>
      {bar}
      <span
        aria-hidden
        className="absolute -top-1 -bottom-1 -ml-px w-0.5 rounded-[1px] bg-ink"
        style={{ left: `${benchmark * 100}%` }}
      />
    </div>
  )
}
