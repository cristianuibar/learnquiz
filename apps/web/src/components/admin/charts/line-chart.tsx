import { AXIS_LABEL, ChartCard, ChartTable, LegendKey, VALUE_LABEL, VIEW, formatNumber, niceScale } from './chart-table'

type Point = { x: string; y: number; projected?: boolean }

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
function segments(coords: { x: number; y: number; projected: boolean }[]) {
  const runs: { projected: boolean; d: string }[] = []
  for (let i = 1; i < coords.length; i++) {
    const a = coords[i - 1]
    const b = coords[i]
    const last = runs[runs.length - 1]
    if (last && last.projected === b.projected) last.d += ` L${b.x} ${b.y}`
    else runs.push({ projected: b.projected, d: `M${a.x} ${a.y} L${b.x} ${b.y}` })
  }
  return runs
}

export function LineChart({ title, summary, series, benchmark, format = formatNumber, xLabel = 'Date' }: {
  title: string
  summary: string
  series: { name: string; points: Point[]; style: 'solid' | 'dashed' }[]
  benchmark?: { label: string; value: number }
  format?: (n: number) => string
  xLabel?: string
}) {
  const ys = series.flatMap((s) => s.points.map((p) => p.y))
  if (benchmark) ys.push(benchmark.value)
  const scale = niceScale(Math.max(0, ...ys), 2)
  const xs = [...new Set(series.flatMap((s) => s.points.map((p) => p.x)))]
  const x0 = VIEW.left + 32
  const x1 = VIEW.right - 24
  const xAt = (x: string) => (xs.length < 2 ? (x0 + x1) / 2 : x0 + (xs.indexOf(x) / (xs.length - 1)) * (x1 - x0))
  const projected = (x: string) => series.some((s) => s.points.some((p) => p.x === x && p.projected))
  const hasProjection = series.some((s) => s.points.some((p) => p.projected))

  const legend = (
    <>
      {series.map((s) => {
        const look = s.style === 'dashed' ? DASHED : SOLID
        return (
          <LegendKey key={s.name} label={s.name}>
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
    <ChartCard title={title} legend={legend}>
      <svg viewBox={`0 0 ${VIEW.width} ${VIEW.height}`} className="block h-auto w-full overflow-visible" role="img" aria-label={summary}>
        {scale.ticks.map((t) => (
          <g key={t}>
            <line x1={VIEW.left} x2={VIEW.right} y1={scale.y(t)} y2={scale.y(t)} strokeWidth={1} className="stroke-border" />
            <text x={48} y={scale.y(t) + 4} textAnchor="end" className={AXIS_LABEL}>
              {format(t)}
            </text>
          </g>
        ))}
        {xs.map((x) => (
          <text key={x} x={xAt(x)} y={240} textAnchor="middle" className={AXIS_LABEL}>
            {x}
          </text>
        ))}
        {benchmark && (
          <>
            <line x1={VIEW.left} x2={VIEW.right} y1={scale.y(benchmark.value)} y2={scale.y(benchmark.value)} strokeWidth={2} strokeDasharray={BENCHMARK.dash} className={BENCHMARK.className} />
            <text x={48} y={scale.y(benchmark.value) + 4} textAnchor="end" className={VALUE_LABEL}>
              {format(benchmark.value)}
            </text>
          </>
        )}
        {series.map((s) => {
          const look = s.style === 'dashed' ? DASHED : SOLID
          const coords = s.points.map((p) => ({ x: xAt(p.x), y: scale.y(p.y), projected: p.projected === true }))
          const end = s.points[s.points.length - 1]
          const endAt = coords[coords.length - 1]
          return (
            <g key={s.name}>
              {segments(coords).map((run, i) => {
                const l = run.projected ? PROJECTED : look
                return <path key={i} d={run.d} fill="none" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round" strokeDasharray={l.dash} className={l.className} />
              })}
              {coords.map((c, i) =>
                c.projected ? (
                  <circle key={i} cx={c.x} cy={c.y} r={5} strokeWidth={2} className="fill-surface-card stroke-brand" />
                ) : (
                  <circle key={i} cx={c.x} cy={c.y} r={4} className="fill-brand" />
                ),
              )}
              {end && endAt && (
                <text x={endAt.x} y={endAt.y - 12} textAnchor="middle" className={VALUE_LABEL}>
                  {end.projected ? end.x : format(end.y)}
                </text>
              )}
            </g>
          )
        })}
      </svg>
      <ChartTable
        caption={benchmark ? `${title}, ${benchmark.label}` : title}
        columns={[xLabel, ...series.map((s) => s.name)]}
        rows={xs.map((x) => ({
          key: x,
          cells: [
            x + (projected(x) ? ' (projected)' : ''),
            ...series.map((s) => {
              const p = s.points.find((q) => q.x === x)
              return p ? format(p.y) : ''
            }),
          ],
        }))}
      />
    </ChartCard>
  )
}
