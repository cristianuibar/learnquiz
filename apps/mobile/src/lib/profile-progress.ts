import { formatShortDate, percentText, trendGeometry as sharedTrendGeometry, type Profile, type WeekPoint } from '@learnquiz/api/progress'
import type { Today } from '@learnquiz/api/today'

export { formatShortDate, percentText }

export function firstSessionParams(today: Today | null): { topicId: string; start: 'session' | 'placement' } | null {
  if (!today?.topic || !today.plan?.playable || today.role?.preparing || today.role?.building) return null
  return { topicId: today.topic.id, start: today.plan.start }
}

export function proficiencyFact(proficiency: Pick<Profile['proficiency'], 'achievedAt' | 'projectedAt'>): { kind: 'reached' | 'projected'; text: string } | null {
  if (proficiency.achievedAt !== null) return { kind: 'reached', text: `Reached ${formatShortDate(proficiency.achievedAt)}` }
  if (proficiency.projectedAt !== null) return { kind: 'projected', text: `Projected: ${formatShortDate(proficiency.projectedAt)}` }
  return null
}

// Keep the shared time/value scales and accessible description; the Android
// artboard reserves the last 28 dp for dates and session counts.
export function trendGeometry(weeks: readonly WeekPoint[], benchmark: number, projectedAt: number | null, width: number) {
  const chart = sharedTrendGeometry(weeks, benchmark, projectedAt, width)
  return {
    ...chart,
    height: 188,
    points: chart.points.map((point) => ({ ...point, valueLabel: percentText(point.mastery), dateLabel: formatShortDate(point.start) })),
    projection: chart.projection && { ...chart.projection, dateLabel: formatShortDate(chart.projection.at) },
  }
}
