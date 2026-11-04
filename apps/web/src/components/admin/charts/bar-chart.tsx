import { AXIS_LABEL, ChartCard, ChartTable, LegendKey, VALUE_LABEL, VIEW, formatNumber, niceScale } from './chart-table'

/** Daily bars in brand; today's partial day is outlined, with direct labels on the peak and on today only. */
export function BarChart({ title, summary, unit, points, legend, format = formatNumber }: {
  title: string
  summary: string
  unit: string
  points: { label: string; value: number; partial?: boolean; group?: string }[]
  legend: string
  format?: (n: number) => string
}) {
  const scale = niceScale(Math.max(0, ...points.map((p) => p.value)), 4)
  const slot = (VIEW.right - VIEW.left - 16) / Math.max(points.length, 1)
  const barWidth = Math.min(22, slot * 0.6)
  const hasPartial = points.some((p) => p.partial)
  const peak = points.reduce((best, p, i) => (!p.partial && (best < 0 || p.value > points[best].value) ? i : best), -1)
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
        </>
      }
    >
      <svg viewBox="0 0 600 260" className="block h-auto w-full overflow-visible" role="img" aria-label={summary}>
        {scale.ticks.map((t) => (
          <g key={t}>
            <line x1={VIEW.left} x2={VIEW.right} y1={scale.y(t)} y2={scale.y(t)} className="stroke-border" strokeWidth={1} />
            <text x={48} y={scale.y(t) + 4} textAnchor="end" className={AXIS_LABEL}>{format(t)}</text>
          </g>
        ))}
        {points.map((p, i) => {
          const cx = VIEW.left + 8 + slot * i + slot / 2
          const x = cx - barWidth / 2
          const top = scale.y(p.value)
          const height = VIEW.bottom - top
          const second = p.partial ? 'Today' : p.group && p.group !== points[i - 1]?.group ? p.group : null
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
              <text x={cx} y={236} textAnchor="middle" className={AXIS_LABEL}>{p.label}</text>
              {second && <text x={cx} y={254} textAnchor="middle" className={AXIS_LABEL}>{second}</text>}
              {(i === peak || p.partial) && (
                <text x={cx} y={top - 10} textAnchor="middle" className={VALUE_LABEL}>{format(p.value)}</text>
              )}
            </g>
          )
        })}
      </svg>
      <ChartTable
        caption={title}
        columns={['Day', unit]}
        rows={points.map((p, i) => ({
          key: `${i}-${p.label}`,
          cells: [dayName(p) + (p.partial ? ' (today, so far)' : ''), format(p.value)],
        }))}
        total={['Total', format(points.reduce((sum, p) => sum + p.value, 0))]}
      />
    </ChartCard>
  )
}
