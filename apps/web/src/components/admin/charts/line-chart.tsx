import type { ReactNode } from 'react'
import { AXIS_LABEL, ChartCard, ChartTable, LegendKey, VALUE_LABEL, VIEW, formatNumber, niceScale, tickShown, type ChartTableProps } from './chart-table'

export type Point = { x: string; y: number | null; projected?: boolean }

const SOLID = { className: 'stroke-brand', dash: undefined }
const DASHED = { className: 'stroke-ink', dash: '6 4' }
const PROJECTED = { className: 'stroke-brand', dash: '6 6' }
const BENCHMARK = { className: 'stroke-ink', dash: '4 4' }

function LineSample({ className, dash }: { className: string; dash: string | undefined }) {
  return (
    <svg width="20" height="2" aria-hidden>
      <line x1="0" x2="20" y1="1" y2="1" strokeWidth={2} strokeDasharray={dash} className={className} />
    </svg>
  )
}

/** Runs of consecutive segments that share a look; a segment ending on a projected point is a projection. */
function segments(coords: { x: number; y: number | null; projected: boolean }[]) {
  const runs: { projected: boolean; d: string }[] = []
  let endAt = -1
  for (let i = 1; i < coords.length; i++) {
    const a = coords[i - 1]
    const b = coords[i]
    if (a.y === null || b.y === null) continue
    const last = runs[runs.length - 1]
    if (last && last.projected === b.projected && endAt === i - 1) last.d += ` L${b.x} ${b.y}`
    else runs.push({ projected: b.projected, d: `M${a.x} ${a.y} L${b.x} ${b.y}` })
    endAt = i
  }
  return runs
}

export function LineChart({ title, summary, series, benchmark, format = formatNumber, xLabel = 'Date', table, width = VIEW.width, actions }: {
  title: string
  summary: string
  series: { name: string; label?: string; points: Point[]; style: 'solid' | 'dashed' }[]
  benchmark?: { label: string; value: number }
  format?: (n: number) => string
  xLabel?: string
  table?: ChartTableProps
  width?: number
  /** Controls in the card head, next to the title. */
  actions?: ReactNode
}) {
  const right = width - 8
  const ys = series.flatMap((s) => s.points.flatMap((p) => (p.y === null ? [] : [p.y])))
  if (benchmark) ys.push(benchmark.value)
  const scale = niceScale(Math.max(0, ...ys), 2)
  const xs = [...new Set(series.flatMap((s) => s.points.map((p) => p.x)))]
  const x0 = VIEW.left + 32
  const x1 = right - 24
  const xAt = (x: string) => (xs.length < 2 ? (x0 + x1) / 2 : x0 + (xs.indexOf(x) / (xs.length - 1)) * (x1 - x0))
  const projected = (x: string) => series.some((s) => s.points.some((p) => p.x === x && p.projected))
  const hasProjection = series.some((s) => s.points.some((p) => p.projected))

  const legend = (
    <>
      {series.map((s) => {
        const look = s.style === 'dashed' ? DASHED : SOLID
        return (
          <LegendKey key={s.name} label={s.label ?? s.name}>
            <LineSample {...look} />
          </LegendKey>
        )
      })}
      {hasProjection && (
        <LegendKey label="Projected">
          <LineSample {...PROJECTED} />
        </LegendKey>
      )}
      {benchmark && (
        <LegendKey label={benchmark.label}>
          <LineSample {...BENCHMARK} />
        </LegendKey>
      )}
    </>
  )

  return (
    <ChartCard title={title} legend={legend} actions={actions}>
      <svg viewBox={`0 0 ${width} ${VIEW.height}`} className="block h-auto w-full overflow-visible" role="img" aria-label={summary}>
        {scale.ticks.map((t) => (
          <g key={t}>
            <line x1={VIEW.left} x2={right} y1={scale.y(t)} y2={scale.y(t)} strokeWidth={1} className="stroke-border" />
            <text x={48} y={scale.y(t) + 4} textAnchor="end" className={AXIS_LABEL}>
              {format(t)}
            </text>
          </g>
        ))}
        {xs.map((x, i) =>
          tickShown(i, xs.length) && (
            <text key={x} x={xAt(x)} y={240} textAnchor="middle" className={AXIS_LABEL}>
              {x}
            </text>
          ),
        )}
        {benchmark && (
          <>
            <line x1={VIEW.left} x2={right} y1={scale.y(benchmark.value)} y2={scale.y(benchmark.value)} strokeWidth={2} strokeDasharray={BENCHMARK.dash} className={BENCHMARK.className} />
            <text x={48} y={scale.y(benchmark.value) + 4} textAnchor="end" className={VALUE_LABEL}>
              {format(benchmark.value)}
            </text>
          </>
        )}
        {series.map((s) => {
          const look = s.style === 'dashed' ? DASHED : SOLID
          const coords = s.points.map((p) => ({ x: xAt(p.x), y: p.y === null ? null : scale.y(p.y), projected: p.projected === true }))
          const endIdx = s.points.reduce((last, p, i) => (p.y === null ? last : i), -1)
          const end = s.points[endIdx]
          const endAt = coords[endIdx]
          return (
            <g key={s.name}>
              {segments(coords).map((run, i) => {
                const l = run.projected ? PROJECTED : look
                return <path key={i} d={run.d} fill="none" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round" strokeDasharray={l.dash} className={l.className} />
              })}
              {coords.map((c, i) =>
                c.y === null ? null : c.projected ? (
                  <circle key={i} cx={c.x} cy={c.y} r={5} strokeWidth={2} className="fill-surface-card stroke-brand" />
                ) : (
                  <circle key={i} cx={c.x} cy={c.y} r={4} className="fill-brand" />
                ),
              )}
              {end?.y != null && endAt?.y != null && (
                <text x={endAt.x} y={endAt.y - 12} textAnchor="middle" className={VALUE_LABEL}>
                  {end.projected ? end.x : format(end.y)}
                </text>
              )}
            </g>
          )
        })}
      </svg>
      <ChartTable
        {...(table ?? {
          caption: benchmark ? `${title}, ${benchmark.label}` : title,
          columns: [xLabel, ...series.map((s) => s.name)],
          rows: xs.map((x) => ({
            key: x,
            cells: [
              x + (projected(x) ? ' (projected)' : ''),
              ...series.map((s) => {
                const p = s.points.find((q) => q.x === x)
                return p && p.y !== null ? format(p.y) : ''
              }),
            ],
          })),
        })}
      />
    </ChartCard>
  )
}
