import type { ReactNode } from 'react'
import { ChartCard, ChartTable, formatNumber, type ChartTableProps } from './chart-table'

export function HBarList({ title, hideTitle, summary, rows, table, format = formatNumber, unit = 'Value', labelHeading = 'Name' }: {
  title: string
  hideTitle?: boolean
  summary: string
  rows: { label: string; value: number; detail?: ReactNode; valueLabel?: string }[]
  table?: ChartTableProps
  format?: (n: number) => string
  unit?: string
  labelHeading?: string
}) {
  const sorted = [...rows].sort((a, b) => b.value - a.value)
  const max = sorted.length > 0 ? sorted[0].value : 0
  const sum = sorted.reduce((acc, r) => acc + r.value, 0)
  return (
    <ChartCard title={title} hideTitle={hideTitle}>
      <div
        role="img"
        aria-label={`${summary} ${sorted.length ? sorted.map((r) => `${r.label} ${r.valueLabel ?? format(r.value)}`).join(', ') : 'No data yet'}.`}
        className={rows.some((r) => r.detail) ? 'flex flex-col gap-3' : 'flex flex-col gap-1'}
      >
        {sorted.length === 0 && <p className="text-body text-ink-muted">No data yet</p>}
        {sorted.map((r) => (
          <div key={r.label} aria-hidden className="grid min-h-8 grid-cols-[minmax(120px,200px)_minmax(0,1fr)_72px] items-center gap-3 text-[14px]/[20px]">
            <span className="flex min-w-0 flex-col"><span className={r.detail ? 'font-semibold' : undefined}>{r.label}</span>{r.detail}</span>
            <span className="relative h-3 rounded-[2px] bg-surface-sunken">
              <span className="absolute inset-y-0 left-0 rounded-[2px] bg-brand" style={{ width: `${max > 0 ? (r.value / max) * 100 : 0}%` }} />
            </span>
            <span className="text-right font-semibold tabular-nums">{r.valueLabel ?? format(r.value)}</span>
          </div>
        ))}
      </div>
      <ChartTable {...(table ?? {
        caption: title,
        columns: [labelHeading, unit],
        rows: sorted.map((r) => ({ key: r.label, cells: [r.label, format(r.value)] })),
        total: ['Total', format(sum)],
      })} />
    </ChartCard>
  )
}
