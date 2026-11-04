import { formatShortDate, percentText, trendGeometry as sharedTrendGeometry, type Profile, type WeekPoint } from '@learnquiz/api/progress'
import type { Today } from '@learnquiz/api/today'
import { trendLabels } from '@learnquiz/api/trend-labels'
import { trendType } from './trend-labels'

export { formatShortDate, percentText }

export function firstSessionParams(today: Today | null): { topicId: string; start: 'session' | 'placement' } | null {
  if (!today?.topic || !today.plan?.playable || today.role?.preparing) return null
  return { topicId: today.topic.id, start: today.plan.start }
}

export function proficiencyFact(proficiency: Pick<Profile['proficiency'], 'achievedAt' | 'projectedAt'>): { kind: 'reached' | 'projected'; text: string } | null {
  if (proficiency.achievedAt !== null) return { kind: 'reached', text: `Reached ${formatShortDate(proficiency.achievedAt)}` }
  if (proficiency.projectedAt !== null) return { kind: 'projected', text: `Projected: ${formatShortDate(proficiency.projectedAt)}` }
  return null
}

function sessionsText(week: Pick<WeekPoint, 'sessions' | 'partial'>): string {
  return `${week.sessions} session${week.sessions === 1 ? '' : 's'}${week.partial ? ' so far' : ''}`
}

// The Profile artboard's chart sentence, with each week's session count.
export function trendDescription(weeks: readonly WeekPoint[], benchmark: number, projectedAt: number | null): string {
  if (weeks.length === 0) return 'No weekly mastery recorded yet.'
  const measured = weeks
    .map((week) => `${percentText(week.mastery)} in the week of ${formatShortDate(week.start)} (${sessionsText(week)})`)
    .join(', ')
  const projected = projectedAt === null ? '' : ` Projected to reach the ${percentText(benchmark)} benchmark on ${formatShortDate(projectedAt)}.`
  return `Line chart of weekly role mastery: ${measured}.${projected}`
}

// Keep the shared time/value scales. The Android artboard adds date and session
// rows below the plot; their size follows the font scale, the chart grows to fit
// them, and labels that would overlap are thinned (the newest and the projection win).
export function trendGeometry(weeks: readonly WeekPoint[], benchmark: number, projectedAt: number | null, width: number, fontScale = 1) {
  const probe = sharedTrendGeometry(weeks, benchmark, projectedAt, width)
  const type = trendType(fontScale, probe.bottom)
  // A larger "Sessions" label needs a wider left gutter: shift the plot right.
  const shift = Math.min(type.gutter, Math.max(0, width - 120))
  const chart = shift ? sharedTrendGeometry(weeks, benchmark, projectedAt, width - shift) : probe
  const labels = trendLabels(
    chart.points.map((point) => ({ ...point, x: point.x + shift })),
    chart.projection && { ...chart.projection, x: chart.projection.x + shift },
    width,
    type.font,
  )
  return {
    ...chart,
    width,
    left: chart.left + shift,
    right: chart.right + shift,
    height: type.height,
    type,
    description: trendDescription(chart.points, benchmark, chart.projection?.at ?? null),
    points: labels.points,
    projection: labels.projection,
  }
}
