// Pure Path tab rules, kept free of React Native so they can be unit tested.
// Status words, percents and the row label come from @learnquiz/api/progress,
// shared with the web Path.
import { percentText, programLabel, unitAriaLabel, type TopicPath } from '@learnquiz/api/progress'

export type PathUnit = TopicPath['units'][number]

// The node carries kind only; the bar carries progress. A locked unit is
// never "next": its row is inert.
export type NodeKind = 'mastered' | 'next' | 'learning' | 'estimate' | 'not_started' | 'locked'

export function isNextUnit(unit: Pick<PathUnit, 'id' | 'state'>, nextUnitId: string | null): boolean {
  return nextUnitId !== null && unit.id === nextUnitId && unit.state !== 'locked'
}

export function nodeKind(unit: Pick<PathUnit, 'id' | 'state'>, nextUnitId: string | null): NodeKind {
  if (unit.state === 'locked') return 'locked'
  if (isNextUnit(unit, nextUnitId)) return 'next'
  return unit.state
}

// "66% of 85% benchmark · Day 16 of 30"; without onboarding the day part is dropped.
export function headerLine(path: Pick<TopicPath, 'mastery' | 'benchmark' | 'onboarding'>): string {
  const base = `${percentText(path.mastery)} of ${percentText(path.benchmark)} benchmark`
  return path.onboarding ? `${base} · ${programLabel(path.onboarding, path.benchmark)}` : base
}

// The role bar's spoken value: "66%, benchmark 85%".
export function roleBarText(path: Pick<TopicPath, 'mastery' | 'benchmark'>): string {
  return `${percentText(path.mastery)}, benchmark ${percentText(path.benchmark)}`
}

// The card's percent: "~40%" for a placement estimate. Estimates, units not
// started and locked units read in muted ink.
export function unitPercent(unit: Pick<PathUnit, 'mastery' | 'state'>): { text: string; muted: boolean } {
  return {
    text: percentText(unit.mastery, unit.state === 'estimate'),
    muted: unit.state === 'estimate' || unit.state === 'not_started' || unit.state === 'locked',
  }
}

// Bar values are 0-100. Only measured units fill; an estimate draws the
// dashed outline; units not started and locked units stay empty.
export function unitBar(unit: Pick<PathUnit, 'mastery' | 'state'>): { value: number; estimate: boolean } {
  const pct = Math.round(unit.mastery * 100)
  if (unit.state === 'mastered' || unit.state === 'learning') return { value: pct, estimate: false }
  if (unit.state === 'estimate') return { value: pct, estimate: true }
  return { value: 0, estimate: false }
}

export type UnitChip = 'mastered' | 'estimate' | 'none' | 'locked'

// Chips only for exceptions: a learning unit shows none. "3 critical" is a
// tag next to the chip. meta is false when the row would be empty.
export function unitMeta(unit: Pick<PathUnit, 'state' | 'criticalCount'>): { chip: UnitChip | null; critical: string | null; meta: boolean } {
  const chip: UnitChip | null = unit.state === 'mastered' ? 'mastered'
    : unit.state === 'estimate' ? 'estimate'
    : unit.state === 'not_started' ? 'none'
    : unit.state === 'locked' ? 'locked'
    : null
  const critical = unit.criticalCount > 0 ? `${unit.criticalCount} critical` : null
  return { chip, critical, meta: chip !== null || critical !== null }
}

// The rail joins the nodes: it starts at the first node's centre, runs into
// the 8 px gap below each row and ends at the last node's centre.
export type RailSegment = 'first' | 'middle' | 'last' | null

export function railSegment(index: number, count: number): RailSegment {
  if (count < 2) return null
  if (index === 0) return 'first'
  return index === count - 1 ? 'last' : 'middle'
}

// Path has units to show only once the topic is ready and has units.
export function isPreparing(path: Pick<TopicPath, 'preparing' | 'units'>): boolean {
  return path.preparing || path.units.length === 0
}

export const preparingText = 'Your training is being prepared'
export const pathError = 'Couldn’t load your path.'

export type UnitRowModel = {
  id: string
  number: number
  name: string
  label: string
  kind: NodeKind
  next: boolean
  locked: boolean
  percent: { text: string; muted: boolean }
  bar: { value: number; estimate: boolean }
  meta: { chip: UnitChip | null; critical: string | null; meta: boolean }
  rail: RailSegment
}

// One model per row. The number and the spoken "Unit N" both come from the
// position in the ordered list.
export function unitRows(path: Pick<TopicPath, 'units' | 'nextUnitId'>): UnitRowModel[] {
  return path.units.map((unit, index) => {
    const next = isNextUnit(unit, path.nextUnitId)
    return {
      id: unit.id,
      number: index + 1,
      name: unit.name,
      label: unitAriaLabel(unit, index, next),
      kind: nodeKind(unit, path.nextUnitId),
      next,
      locked: unit.state === 'locked',
      percent: unitPercent(unit),
      bar: unitBar(unit),
      meta: unitMeta(unit),
      rail: railSegment(index, path.units.length),
    }
  })
}

export function unitHref(unitId: string, topicId: string): { pathname: '/unit/[unitId]'; params: { unitId: string; topicId: string } } {
  return { pathname: '/unit/[unitId]', params: { unitId, topicId } }
}

export function topicPathUrl(topicId: string): string {
  return `/topics/${encodeURIComponent(topicId)}/path`
}
