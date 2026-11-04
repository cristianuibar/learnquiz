import { useId } from 'react'
import { formatShortDate, percentText, trendGeometry, type Profile } from '@learnquiz/api/progress'

const text = 'text-[11px]'

export function WeeklyTrend({ profile }: { profile: Profile }) {
  const id = useId()
  const { benchmark, proficiency } = profile
  const chart = trendGeometry(profile.weeks, benchmark, proficiency.achievedAt === null ? proficiency.projectedAt : null, 294)
  const last = chart.points[chart.points.length - 1]
  const mid = (chart.top + chart.bottom) / 2
  const ticks = [
    { value: 1, y: chart.top },
    { value: benchmark, y: chart.benchmarkY },
    { value: 0.5, y: mid },
    { value: 0, y: chart.bottom },
  ]
  const legend = [
    { label: 'Measured', cls: 'stroke-brand', dash: undefined },
    ...(chart.projection ? [{ label: 'Projected', cls: 'stroke-brand', dash: '6 6' }] : []),
    { label: `Benchmark ${percentText(benchmark)}`, cls: 'stroke-ink-muted', dash: '4 4' },
  ]
  return (
    <section aria-labelledby={id} className="flex flex-col gap-3">
      <h2 id={id} className="text-title-3">
        Weekly trend
      </h2>
      {profile.weeks.length === 0 ? (
        <p className="text-body text-ink-muted">No weekly mastery recorded yet.</p>
      ) : (
        <figure className="m-0 flex flex-col gap-3 rounded-md border border-border bg-surface-card p-4">
          <svg viewBox={`0 0 ${chart.width} 188`} className="h-auto w-full" role="img" aria-label={chart.description}>
            {[chart.top, mid, chart.bottom].map((y) => (
              <line key={y} x1={chart.left} x2={chart.width} y1={y} y2={y} strokeWidth={1} className="stroke-border" />
            ))}
            <line x1={chart.left} x2={chart.width} y1={chart.benchmarkY} y2={chart.benchmarkY} strokeWidth={2} strokeDasharray="4 4" className="stroke-ink-muted" />
            {ticks.map(({ value, y }, i) => (
              <text key={i} x={chart.left - 8} y={y + 4} textAnchor="end" className={`${text} ${i === 1 ? 'fill-ink font-semibold' : 'fill-ink-muted'}`}>
                {percentText(value)}
              </text>
            ))}
            <polyline
              points={chart.points.map(({ x, y }) => `${x},${y}`).join(' ')}
              fill="none"
              strokeWidth={2}
              strokeLinecap="round"
              strokeLinejoin="round"
              className="stroke-brand"
            />
            {chart.projection && last && (
              <>
                <line x1={last.x} y1={last.y} x2={chart.projection.x} y2={chart.projection.y} strokeWidth={2} strokeLinecap="round" strokeDasharray="6 6" className="stroke-brand" />
                <circle cx={chart.projection.x} cy={chart.projection.y} r={4} strokeWidth={2} className="fill-surface-card stroke-brand" />
                <text x={chart.projection.x} y={164} textAnchor="middle" className={`${text} fill-ink-muted`}>
                  {formatShortDate(chart.projection.at)}
                </text>
              </>
            )}
            {chart.points.map((p) => (
              <circle key={p.start} cx={p.x} cy={p.y} r={5} strokeWidth={2} className="fill-brand stroke-surface-card" />
            ))}
            {chart.points.map((p) => (
              <text key={`v${p.start}`} x={p.x} y={Math.max(11, p.y - 12)} textAnchor="middle" className={`${text} fill-ink font-semibold`}>
                {percentText(p.mastery)}
              </text>
            ))}
            {chart.points.map((p) => (
              <text key={`d${p.start}`} x={p.x} y={164} textAnchor="middle" className={`${text} fill-ink font-semibold`}>
                {formatShortDate(p.start)}
              </text>
            ))}
            <text x={chart.left - 8} y={182} textAnchor="end" className={`${text} fill-ink-muted`}>
              Sessions
            </text>
            {chart.points.map((p) => (
              <text key={`s${p.start}`} x={p.x} y={182} textAnchor="middle" className={`${text} fill-ink-muted`}>
                {p.sessions}
                {p.partial ? ' so far' : ''}
              </text>
            ))}
          </svg>
          <ul aria-hidden className="m-0 flex list-none flex-wrap gap-3 p-0">
            {legend.map(({ label, cls, dash }) => (
              <li key={label} className="flex items-center gap-1">
                <svg width="24" height="12" aria-hidden>
                  <line x1="0" x2="24" y1="6" y2="6" strokeWidth={2} strokeDasharray={dash} className={cls} />
                </svg>
                <span className="text-caption text-ink-muted">{label}</span>
              </li>
            ))}
          </ul>
          <table className="sr-only">
            <caption>Role mastery by week</caption>
            <thead>
              <tr>
                <th scope="col">Week of</th>
                <th scope="col">Mastery</th>
                <th scope="col">Sessions</th>
              </tr>
            </thead>
            <tbody>
              {chart.points.map((p) => (
                <tr key={p.start}>
                  <td>{formatShortDate(p.start)}</td>
                  <td>{percentText(p.mastery)}</td>
                  <td>
                    {p.sessions}
                    {p.partial ? ' so far' : ''}
                  </td>
                </tr>
              ))}
              {chart.projection && (
                <tr>
                  <td>{formatShortDate(chart.projection.at)} (projected)</td>
                  <td>{percentText(benchmark)}</td>
                  <td />
                </tr>
              )}
            </tbody>
          </table>
        </figure>
      )}
    </section>
  )
}
