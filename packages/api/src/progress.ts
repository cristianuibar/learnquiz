export type UnitState = 'mastered' | 'learning' | 'estimate' | 'not_started' | 'locked'
export type ConceptStatus = 'mastered' | 'learning' | 'not_started'

export type TopicPath = {
  topic: { id: string; title: string; goal: string | null; status: 'draft' | 'generating' | 'ready' | 'failed'; generatedBy: string | null }
  // Distinct Muse model ids behind the curriculum, its questions and its diagrams. Older servers omit it.
  models?: string[]
  preparing: boolean
  placeable: boolean
  company: string | null
  benchmark: number
  onboarding: { day: number; days: number } | null
  mastery: number
  nextUnitId: string | null
  learner: { level: number; levelLine: string | null; levelLineModel: string | null; placed: boolean; xp: number; streak: number }
  units: {
    id: string
    order: number
    name: string
    summary: string
    mastery: number
    measured: boolean
    unlocked: boolean
    state: UnitState
    criticalCount: number
    canPractice: boolean
    source: { title: string; version: number } | null
    concepts: {
      id: string
      order: number
      name: string
      summary: string
      visual: boolean
      grounded: boolean
      critical: boolean
      answeredCount: number
      pKnown: number
      measured: boolean
      status: ConceptStatus
    }[]
  }[]
  edges: { fromId: string; toId: string }[]
}

export type WeekPoint = { start: number; mastery: number; sessions: number; partial: boolean }

export type Profile = {
  name: string
  topic: { id: string; title: string } | null
  role: string | null
  benchmark: number
  started: boolean
  onboarding: TopicPath['onboarding']
  mastery: number
  units: {
    id: string
    name: string
    mastery: number
    state: UnitState
    concepts: { id: string; unitId: string; name: string; critical: boolean; pKnown: number; measured: boolean; status: ConceptStatus }[]
  }[]
  proficiency: { achievedAt: number | null; days: number | null; estimatedDays: number | null; projectedAt: number | null }
  confidentErrors: { id: string; conceptId: string; concept: string; at: number; correctedAt: number | null }[]
  weeks: WeekPoint[]
  sessionCounts: { total: number; week: number }
}

export function percentText(x: number, estimate = false): string {
  return `${estimate ? '~' : ''}${Math.round(x * 100)}%`
}

export function unitAriaLabel(unit: Pick<TopicPath['units'][number], 'name' | 'mastery' | 'state' | 'criticalCount'>, index: number, isNext: boolean): string {
  const status: Record<UnitState, string> = {
    mastered: 'Mastered',
    learning: 'Still learning',
    estimate: 'Placement estimate, not practiced yet',
    not_started: 'Not started',
    locked: 'Locked',
  }
  const critical = unit.criticalCount ? `, ${unit.criticalCount} critical concept${unit.criticalCount === 1 ? '' : 's'}` : ''
  return `Unit ${index + 1}, ${unit.name}${isNext ? ', Next up' : ''}: ${unit.state === 'estimate' ? 'about ' : ''}${percentText(unit.mastery)}, ${status[unit.state]}${critical}`
}

export function formatShortDate(ms: number): string {
  return new Intl.DateTimeFormat('en-US', { month: 'short', day: 'numeric', timeZone: 'UTC' }).format(ms)
}

export function programLabel(onboarding: TopicPath['onboarding'], benchmark: number): string {
  return onboarding ? `Day ${onboarding.day} of ${onboarding.days}` : `Benchmark ${percentText(benchmark)}`
}

export function criticalRows(confidentErrors: readonly Profile['confidentErrors'][number][]) {
  return [...confidentErrors]
    .sort((a, b) => Number(a.correctedAt !== null) - Number(b.correctedAt !== null) || b.at - a.at)
    .slice(0, 5)
    .map((error) => ({ ...error, chipText: error.correctedAt === null ? 'Comes back first' : `Corrected ${formatShortDate(error.correctedAt)}` }))
}

export function trendGeometry(weeks: readonly WeekPoint[], benchmark: number, projectedAt: number | null, width: number) {
  const top = 8.5
  const h = 136
  const right = Math.max(0, width - 22)
  const firstX = Math.min(80, right)
  const sorted = [...weeks].sort((a, b) => a.start - b.start)
  const first = sorted[0]
  const last = sorted[sorted.length - 1]
  const projectionAt = last && projectedAt !== null && projectedAt > last.start && last.mastery < benchmark ? projectedAt : null
  const span = first ? (projectionAt ?? last.start) - first.start : 0
  const day = 86_400_000
  const scale = span > 0 ? Math.min(8 / day, (right - firstX) / span) : 0
  const x = (at: number) => firstX + (at - first.start) * scale
  const y = (value: number) => top + h * (1 - value)
  const points = sorted.map((week) => ({ ...week, x: x(week.start), y: y(week.mastery) }))
  const projection = projectionAt === null ? null : { at: projectionAt, x: x(projectionAt), y: y(benchmark) }
  const measuredText = sorted.map((week) => `${percentText(week.mastery)} in the week of ${formatShortDate(week.start)}`).join(', ')
  const projectedText = projection ? `; projected to reach the ${percentText(benchmark)} benchmark on ${formatShortDate(projection.at)}` : ''
  return {
    width,
    height: 160,
    top,
    bottom: top + h,
    left: Math.min(64, right),
    right,
    points,
    projection,
    benchmarkY: y(benchmark),
    description: first ? `Weekly role mastery: ${measuredText}${projectedText}.` : 'No weekly mastery recorded yet.',
  }
}
