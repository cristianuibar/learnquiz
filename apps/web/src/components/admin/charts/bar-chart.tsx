import { AXIS_LABEL, ChartCard, ChartTable, LegendKey, VALUE_LABEL, VIEW, formatNumber, niceScale, tickShown, type ChartTableProps } from './chart-table'

/** Daily bars in brand; today's partial day is outlined, with direct labels on the peak and on today only. */
export function BarChart({ title, summary, unit, points, legend, format = formatNumber, table, strip }: {
  title: string
  summary: string
  unit: string
  points: { label: string; value: number; partial?: boolean; group?: string }[]
  legend: string
  format?: (n: number) => string
  /** Replaces the default table. */
  table?: ChartTableProps
  /** Small bar panel under the bars sharing their x slots; values[i] belongs to points[i]. */
  strip?: { legend: string; values: number[]; format: (n: number) => string }
}) {
  const scale = niceScale(Math.max(0, ...points.map((p) => p.value)), 4)
  const slot = (VIEW.right - VIEW.left - 16) / Math.max(points.length, 1)
  const barWidth = Math.min(22, slot * 0.6)
  const hasPartial = points.some((p) => p.partial)
  const peak = points.reduce((best, p, i) => (!p.partial && (best < 0 || p.value > points[best].value) ? i : best), -1)
  const stripScale = strip && niceScale(Math.max(0, ...strip.values), 1)
  const stripTop = 262
  const stripBottom = 298
  const stripY = (v: number) => stripBottom - (v / (stripScale?.max || 1)) * (stripBottom - stripTop)
  const stripPeak = strip ? points.reduce((best, p, i) => (!p.partial && (best < 0 || strip.values[i] > strip.values[best]) ? i : best), -1) : -1
  const xLabelY = strip ? 318 : 236
  const shown = points.map((p, i) => tickShown(i, points.length) || p.partial === true)
  const dayName = (p: { label: string; group?: string }) => (p.group ? `${p.group} ${p.label}` : p.label)

  return (
    <ChartCard
      title={title}
      legend={
        <>
          <LegendKey label={legend}>
            <i className="inline-block size-2.5 rounded-[2px] bg-brand" />
          </LegendKey>
          {hasPartial && (
            <LegendKey label="Today, so far">
              <i className="inline-block size-2.5 rounded-[2px] border-2 border-brand bg-transparent" />
            </LegendKey>
          )}
          {strip && (
            <LegendKey label={strip.legend}>
              <i className="inline-block size-2.5 rounded-[2px] bg-ink-muted" />
            </LegendKey>
          )}
        </>
      }
    >
      <svg viewBox={`0 0 600 ${strip ? 342 : 260}`} className="block h-auto w-full overflow-visible" role="img" aria-label={summary}>
        {scale.ticks.map((t) => (
          <g key={t}>
            <line x1={VIEW.left} x2={VIEW.right} y1={scale.y(t)} y2={scale.y(t)} className="stroke-border" strokeWidth={1} />
            <text x={48} y={scale.y(t) + 4} textAnchor="end" className={AXIS_LABEL}>{format(t)}</text>
          </g>
        ))}
        {strip && stripScale && (
          <>
            <text x={VIEW.left} y={stripTop - 8} className={AXIS_LABEL}>{strip.legend}</text>
            {[0, stripScale.max].map((t) => (
              <g key={t}>
                <line x1={VIEW.left} x2={VIEW.right} y1={stripY(t)} y2={stripY(t)} className="stroke-border" strokeWidth={1} />
                <text x={48} y={stripY(t) + 4} textAnchor="end" className={AXIS_LABEL}>{strip.format(t)}</text>
              </g>
            ))}
          </>
        )}
        {points.map((p, i) => {
          const cx = VIEW.left + 8 + slot * i + slot / 2
          const x = cx - barWidth / 2
          const top = scale.y(p.value)
          const height = VIEW.bottom - top
          const prevLabelled = shown.lastIndexOf(true, i - 1)
          const second = p.partial ? 'Today' : p.group && p.group !== points[prevLabelled]?.group ? p.group : null
          const sv = strip?.values[i] ?? 0
          const sTop = stripY(sv)
          return (
            <g key={i}>
              {p.partial ? (
                <rect
                  x={x + 1}
                  y={top + 1}
                  width={Math.max(barWidth - 2, 0)}
                  height={Math.max(height - 2, 0)}
                  rx={2}
                  strokeWidth={2}
                  className="fill-surface-card stroke-brand"
                />
              ) : (
                <rect x={x} y={top} width={barWidth} height={height} rx={2} className="fill-brand" />
              )}
              {strip &&
                (p.partial ? (
                  <rect x={x + 1} y={sTop + 1} width={Math.max(barWidth - 2, 0)} height={Math.max(stripBottom - sTop - 2, 0)} rx={2} strokeWidth={2} className="fill-surface-card stroke-ink-muted" />
                ) : (
                  <rect x={x} y={sTop} width={barWidth} height={stripBottom - sTop} rx={2} className="fill-ink-muted" />
                ))}
              {strip && (i === stripPeak || p.partial) && (
                <text x={cx} y={sTop - 6} textAnchor="middle" className={VALUE_LABEL}>{strip.format(sv)}</text>
              )}
              {shown[i] && <text x={cx} y={xLabelY} textAnchor="middle" className={AXIS_LABEL}>{p.label}</text>}
              {shown[i] && second && <text x={cx} y={xLabelY + 18} textAnchor="middle" className={AXIS_LABEL}>{second}</text>}
              {(i === peak || p.partial) && (
                <text x={cx} y={top - 10} textAnchor="middle" className={VALUE_LABEL}>{format(p.value)}</text>
              )}
            </g>
          )
        })}
      </svg>
      <ChartTable
        {...(table ?? {
          caption: title,
          columns: ['Day', unit],
          rows: points.map((p, i) => ({
            key: `${i}-${p.label}`,
            cells: [dayName(p) + (p.partial ? ' (today, so far)' : ''), format(p.value)],
          })),
          total: ['Total', format(points.reduce((sum, p) => sum + p.value, 0))],
        })}
      />
    </ChartCard>
  )
}
