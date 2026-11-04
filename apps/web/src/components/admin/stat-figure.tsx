import { Link, type LinkProps } from '@tanstack/react-router'
import type { ReactNode } from 'react'
import { cn } from '@/lib/utils'

/** One card of stats: 2-up below 640, one row of equal columns from 640. */
export function StatsCard({ children, className }: { children: ReactNode; className?: string }) {
  return (
    <div
      className={cn(
        'grid grid-cols-2 overflow-hidden rounded-md border border-border bg-surface-card text-ink',
        'sm:auto-cols-fr sm:grid-flow-col sm:grid-cols-none',
        className,
      )}
    >
      {children}
    </div>
  )
}

const STAT =
  'flex min-w-0 flex-col justify-between gap-2 border-b border-border p-4 no-underline text-ink ' +
  'odd:border-r last:border-b-0 [&:last-child:nth-child(odd)]:col-span-2 [&:last-child:nth-child(odd)]:border-r-0 ' +
  'sm:border-r sm:border-b-0 sm:last:border-r-0 sm:[&:last-child:nth-child(odd)]:col-span-1 xl:px-6 xl:py-5'
const VALUE = 'text-[28px]/[34px] font-bold tracking-[-0.02em] tabular-nums text-ink xl:text-[32px]/[40px]'

export function Stat({ label, value, unit, to }: {
  label: string
  value: number | string | null
  unit?: string
  to?: LinkProps['to']
}) {
  const body = (
    <>
      <span className="text-[14px]/[20px] font-medium text-ink-muted group-hover/stat:text-ink group-hover/stat:underline">{label}</span>
      <span className={VALUE}>
        {value === null ? (
          <>
            <span aria-hidden className="text-ink-muted">—</span>
            <span className="sr-only">No data yet</span>
          </>
        ) : (
          value
        )}
        {value !== null && unit ? <span className="ml-1 text-[15px]/[22px] font-medium tracking-normal text-ink-muted">{unit}</span> : null}
      </span>
    </>
  )
  if (to) {
    return (
      <Link
        to={to}
        className={cn(STAT, 'group/stat hover:bg-surface-page focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-brand')}
      >
        {body}
      </Link>
    )
  }
  return <div className={cn(STAT, 'group/stat')}>{body}</div>
}
