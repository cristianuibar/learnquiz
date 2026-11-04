import { useId } from 'react'
import { formatShortDate, percentText, trendGeometry, type Profile } from '@learnquiz/api/progress'
import { trendLabels } from '@learnquiz/api/trend-labels'

const font = 11
const text = 'text-[11px]'

// `card` is the company admin's view: heading and caption inside the card, legend at the top right, wider chart.
export function WeeklyTrend({ profile, card = false }: { profile: Profile; card?: boolean }) {
  const id = useId()
  const { benchmark, proficiency } = profile
  const chart = trendGeometry(profile.weeks, benchmark, proficiency.achievedAt === null ? proficiency.projectedAt : null, card ? 560 : 294)
  // Labels that would overlap are thinned: the newest week and the projection date win.
  const labels = trendLabels(chart.points, chart.projection, chart.width, font)
  const last = chart.points[chart.points.length - 1]
  const mid = (chart.top + chart.bottom) / 2
  const ticks = [
    { value: 1, y: chart.top },
    { value: benchmark, y: chart.benchmarkY },
    { value: 0.5, y: mid },
    { value: 0, y: chart.bottom },
  ]
  const legend = [
    { label: card ? 'Mastery' : 'Measured', cls: 'stroke-brand', dash: undefined },
    ...(chart.projection ? [{ label: 'Projected', cls: 'stroke-brand', dash: '6 6' }] : []),
    { label: card ? 'Benchmark' : `Benchmark ${percentText(benchmark)}`, cls: 'stroke-ink-muted', dash: '4 4' },
  ]
  const legendList = (
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
  )
  const heading = card ? (
    <div className="flex flex-wrap items-start justify-between gap-x-6 gap-y-2">
      <div className="flex flex-col gap-1">
        <h2 id={id} className="text-title-2">
          Weekly trend
        </h2>
        {profile.weeks[0] && <p className="text-caption text-ink-muted tabular-nums">Since {formatShortDate(profile.weeks[0].start)}</p>}
      </div>
      {profile.weeks.length > 0 && legendList}
    </div>
  ) : (
    <h2 id={id} className="text-title-3">
      Weekly trend
    </h2>
  )
  return (
    <section aria-labelledby={id} className={card ? 'flex flex-col gap-4 rounded-md border border-border bg-surface-card p-4' : 'flex flex-col gap-3'}>
      {heading}
      {profile.weeks.length === 0 ? (
        <p className="text-body text-ink-muted">No weekly mastery recorded yet.</p>
      ) : (
        <figure className={card ? 'm-0 flex flex-col gap-3' : 'm-0 flex flex-col gap-3 rounded-md border border-border bg-surface-card p-4'}>
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
                {labels.projection && (
                  <text x={labels.projection.date.x} y={164} textAnchor="middle" className={`${text} fill-ink-muted`}>
                    {labels.projection.dateLabel}
                  </text>
                )}
              </>
            )}
            {chart.points.map((p) => (
              <circle key={p.start} cx={p.x} cy={p.y} r={5} strokeWidth={2} className="fill-brand stroke-surface-card" />
            ))}
            {labels.points.map((p) => p.valued && (
              <text key={`v${p.start}`} x={p.value.x} y={p.value.y} textAnchor="middle" className={`${text} fill-ink font-semibold`}>
                {p.valueLabel}
              </text>
            ))}
            {labels.points.map((p) => p.dated && (
              <text key={`d${p.start}`} x={p.date.x} y={164} textAnchor="middle" className={`${text} fill-ink font-semibold`}>
                {p.dateLabel}
              </text>
            ))}
            <text x={chart.left - 8} y={182} textAnchor="end" className={`${text} fill-ink-muted`}>
              Sessions
            </text>
            {labels.points.map((p) => p.counted && (
              <text key={`s${p.start}`} x={p.count.x} y={182} textAnchor="middle" className={`${text} fill-ink-muted`}>
                {p.count.text}
              </text>
            ))}
            {labels.points.map((p) => p.counted && p.count.suffixX !== null && (
              <text key={`f${p.start}`} x={p.count.suffixX} y={182} textAnchor="start" className={`${text} fill-ink-muted`}>
                so far
              </text>
            ))}
          </svg>
          {!card && legendList}
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
                  <td>{card ? 'Not applicable' : null}</td>
                </tr>
              )}
            </tbody>
          </table>
        </figure>
      )}
    </section>
  )
}
