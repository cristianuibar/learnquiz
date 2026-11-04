// Pure Unit detail rules, kept free of React Native so they can be unit
// tested. The screen reads the same GET /topics/:topicId/path payload as Path
// (through useTopicPath) and picks one unit from it.
import { percentText, type ConceptStatus, type TopicPath } from '@learnquiz/api/progress'
import type { PathUnit } from './path'

type Concept = PathUnit['concepts'][number]

// useLocalSearchParams can hand back an array for a repeated key.
export function unitRouteParams(params: { unitId?: string | string[]; topicId?: string | string[] }): { unitId: string | null; topicId: string | null } {
  const one = (value: string | string[] | undefined) => typeof value === 'string' && value !== '' ? value : null
  return { unitId: one(params.unitId), topicId: one(params.topicId) }
}

// The unit the route names, or null when the path has no such unit.
export function findUnit(path: Pick<TopicPath, 'units'>, unitId: string | null): PathUnit | null {
  if (unitId === null) return null
  return path.units.find((unit) => unit.id === unitId) ?? null
}

// "82%" + "of 85% benchmark" over the large bar. A placement estimate reads "~40%".
export function unitMastery(unit: Pick<PathUnit, 'name' | 'mastery' | 'state'>, benchmark: number): {
  percent: string
  benchmarkLine: string
  bar: number
  benchmark: number
  label: string
  valueText: string
} {
  const estimate = unit.state === 'estimate'
  const bench = percentText(benchmark)
  return {
    percent: percentText(unit.mastery, estimate),
    benchmarkLine: `of ${bench} benchmark`,
    bar: Math.round(unit.mastery * 100),
    benchmark: Math.round(benchmark * 100),
    label: `${unit.name} mastery`,
    valueText: `${estimate ? 'about ' : ''}${percentText(unit.mastery)}, benchmark ${bench}`,
  }
}

export type ConceptChip = 'mastered' | 'learning' | 'none'

// The shared Chip variants: Mastered, Still learning, Not started.
export function conceptChip(status: ConceptStatus): ConceptChip {
  return status === 'not_started' ? 'none' : status
}

const statusWord: Record<ConceptStatus, string> = {
  mastered: 'Mastered',
  learning: 'Still learning',
  not_started: 'Not started',
}

// The concept bar's spoken value: "72%, Still learning, critical, benchmark 85%".
export function conceptValueText(concept: Pick<Concept, 'pKnown' | 'status' | 'critical'>, benchmark: number): string {
  return `${percentText(concept.pKnown)}, ${statusWord[concept.status]}${concept.critical ? ', critical' : ''}, benchmark ${percentText(benchmark)}`
}

export type ConceptRowModel = {
  id: string
  name: string
  percent: string
  bar: number
  chip: ConceptChip
  critical: boolean
  barLabel: string
  valueText: string
}

// One row per concept, in concepts.order.
export function conceptRows(unit: Pick<PathUnit, 'concepts'>, benchmark: number): ConceptRowModel[] {
  return [...unit.concepts]
    .sort((a, b) => a.order - b.order)
    .map((concept) => ({
      id: concept.id,
      name: concept.name,
      percent: percentText(concept.pKnown),
      bar: Math.round(concept.pKnown * 100),
      chip: conceptChip(concept.status),
      critical: concept.critical,
      barLabel: `${concept.name} mastery`,
      valueText: conceptValueText(concept, benchmark),
    }))
}

// "Receiving SOP · v3"; nothing when the unit has no source.
export function sourceCaption(source: PathUnit['source']): string | null {
  return source ? `${source.title} · v${source.version}` : null
}

export function practiceLabel(unit: Pick<PathUnit, 'name'>): string {
  return `Practice ${unit.name} · 5 min`
}

export function canPractice(unit: Pick<PathUnit, 'canPractice'>): boolean {
  return unit.canPractice
}

// /play/loading params for a session scoped to this unit; null while the
// unit cannot be practiced, so a disabled button never starts one.
// A type literal, not StartPlayParams, so expo-router accepts it as route params.
export type PracticeParams = { topicId: string; start: 'session'; unitId: string }

export function practiceParams(topicId: string, unit: Pick<PathUnit, 'id' | 'canPractice'>): PracticeParams | null {
  if (!canPractice(unit)) return null
  return { topicId, start: 'session', unitId: unit.id }
}

export const notFoundText = 'Not found'
