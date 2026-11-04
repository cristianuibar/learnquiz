import type { ReactNode } from 'react'

// Shared chart frame: 600 by 260 viewBox, plot from x 56 to 592 and y 36 (top tick) to 216 (zero).
export const VIEW = { width: 600, height: 260, left: 56, right: 592, top: 36, bottom: 216 } as const

// Chart text in the SVG: axis labels in ink-muted, direct value labels in ink.
export const AXIS_LABEL = 'fill-ink-muted text-[12px] font-medium tabular-nums'
export const VALUE_LABEL = 'fill-ink text-[12px] font-semibold tabular-nums'

export const formatNumber = (n: number) => n.toLocaleString('en-US')

/** Y axis from 0 to a round maximum in `intervals` equal steps (1, 2, 2.5 or 5 times a power of ten). */
export function niceScale(max: number, intervals = 4): { max: number; ticks: number[]; y: (v: number) => number } {
  const raw = max > 0 ? max / intervals : 1
  const pow = 10 ** Math.floor(Math.log10(raw))
  const step = ([1, 2, 2.5, 5, 10].find((m) => m * pow >= raw) ?? 10) * pow
  const top = step * intervals
  return {
    max: top,
    ticks: Array.from({ length: intervals + 1 }, (_, i) => i * step),
    y: (v: number) => VIEW.bottom - (v / top) * (VIEW.bottom - VIEW.top),
  }
}

/** Card around a chart: title on the left, legend (hidden from assistive tech; the table carries the data) on the right. */
export function ChartCard({ title, legend, children }: { title: string; legend?: ReactNode; children: ReactNode }) {
  return (
    <figure className="m-0 flex min-w-0 flex-col gap-4 rounded-md border border-border bg-surface-card p-6 text-ink">
      <div className="flex flex-wrap items-baseline justify-between gap-4">
        <figcaption className="text-label">{title}</figcaption>
        {legend && (
          <div aria-hidden className="flex flex-wrap gap-4 text-[13px]/[18px] font-medium text-ink-muted">
            {legend}
          </div>
        )}
      </div>
      {children}
    </figure>
  )
}

/** One legend entry: a key (line, dash or box) and its word. */
export function LegendKey({ children, label }: { children: ReactNode; label: string }) {
  return (
    <span className="inline-flex items-center gap-1.5">
      {children}
      {label}
    </span>
  )
}

/** The sr-only table every chart carries, with the same numbers as the drawing. */
export function ChartTable({ caption, columns, rows, total }: {
  caption: string
  columns: string[]
  rows: { key: string; cells: ReactNode[] }[]
  /** Cells of the final total row; omitted for the line chart. */
  total?: ReactNode[]
}) {
  return (
    <table className="sr-only">
      <caption>{caption}</caption>
      <thead>
        <tr>{columns.map((c) => <th key={c} scope="col">{c}</th>)}</tr>
      </thead>
      <tbody>
        {rows.map((r) => (
          <tr key={r.key}>{r.cells.map((c, i) => <td key={i}>{c}</td>)}</tr>
        ))}
      </tbody>
      {total && (
        <tfoot>
          <tr>{total.map((c, i) => <td key={i}>{c}</td>)}</tr>
        </tfoot>
      )}
    </table>
  )
}
