import { formatShortDate, percentText, trendGeometry as sharedTrendGeometry, type Profile, type WeekPoint } from '@learnquiz/api/progress'
import type { Today } from '@learnquiz/api/today'
import { centeredLabel, clearOf, textWidth, thinLabels, trendType } from './trend-labels'

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
  const points = chart.points.map((point) => {
    const x = point.x + shift
    const valueLabel = percentText(point.mastery)
    const dateLabel = formatShortDate(point.start)
    const count = String(point.sessions)
    const countWidth = textWidth(count, type.font)
    const suffixWidth = point.partial ? textWidth('so far', type.font) : 0
    // "so far" follows the count; the pair moves inward together at the right edge.
    const suffixGap = Math.max(8, countWidth / 2 + 4)
    const overflow = Math.max(0, x + (point.partial ? suffixGap + suffixWidth : countWidth / 2) - width)
    const countX = Math.max(countWidth / 2, x - overflow)
    return {
      ...point,
      x,
      valueLabel,
      dateLabel,
      value: { ...centeredLabel(x, textWidth(valueLabel, type.font), width), y: Math.max(type.font, point.y - 12) },
      date: centeredLabel(x, textWidth(dateLabel, type.font), width),
      count: { x: countX, text: count, suffixX: point.partial ? countX + suffixGap : null,
        left: countX - countWidth / 2, right: point.partial ? countX + suffixGap + suffixWidth : countX + countWidth / 2 },
    }
  })
  const projection = chart.projection && (() => {
    const dateLabel = formatShortDate(chart.projection.at)
    return { ...chart.projection, x: chart.projection.x + shift, dateLabel,
      date: centeredLabel(chart.projection.x + shift, textWidth(dateLabel, type.font), width) }
  })()
  // A week's date and count share a column, so thin whole columns. The projection
  // date sits only in the date row: a week's date that reaches it is dropped.
  const columns = thinLabels(points.map(({ date, count }) => ({ left: Math.min(date.left, count.left), right: Math.max(date.right, count.right) })))
  const values = thinLabels(points.map(({ value }) => value))
  return {
    ...chart,
    width,
    left: chart.left + shift,
    right: chart.right + shift,
    height: type.height,
    type,
    description: trendDescription(chart.points, benchmark, chart.projection?.at ?? null),
    points: points.map((point, index) => ({ ...point, counted: columns[index], valued: values[index],
      dated: columns[index] && clearOf(point.date, projection?.date ?? null) })),
    projection,
  }
}
