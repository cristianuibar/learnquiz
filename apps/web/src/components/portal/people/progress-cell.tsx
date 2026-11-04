/** Mastery bar with a benchmark marker, then the percentage. Both values are whole percentages (0..100). */
export function ProgressCell({ mastery, benchmark }: { mastery: number; benchmark: number }) {
  return (
    <div className="grid max-w-[280px] grid-cols-[minmax(64px,1fr)_44px] items-center gap-3">
      <div aria-hidden className="relative h-2 rounded-full bg-surface-sunken">
        <div className="h-full rounded-full bg-brand" style={{ width: `${mastery}%` }} />
        <div className="absolute -top-1 -bottom-1 w-0.5 -translate-x-1/2 bg-ink" style={{ left: `${benchmark}%` }} />
      </div>
      <span className="text-right tabular-nums">
        {mastery}%<span className="sr-only"> of {benchmark}% benchmark</span>
      </span>
    </div>
  )
}
