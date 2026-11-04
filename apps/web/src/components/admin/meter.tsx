import { cn } from '@/lib/utils'

/** Determinate job progress (upload, building). */
export function Meter({ value, max, valueText, label, className }: {
  value: number
  max: number
  valueText: string
  label?: string
  className?: string
}) {
  const pct = max > 0 ? Math.min(100, Math.max(0, (value / max) * 100)) : 0
  return (
    <div
      role="progressbar"
      aria-valuenow={value}
      aria-valuemin={0}
      aria-valuemax={max}
      aria-valuetext={valueText}
      aria-label={label}
      className={cn('h-1 overflow-hidden rounded-full bg-surface-sunken', className)}
    >
      <div className="h-full rounded-full bg-brand" style={{ width: `${pct}%` }} />
    </div>
  )
}
