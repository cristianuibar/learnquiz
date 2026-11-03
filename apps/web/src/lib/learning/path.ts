import type { ConceptStatus, TopicPath, UnitState } from '@learnquiz/api/progress'

export function roleMastery(conceptPKnown: readonly { conceptId: string; pKnown: number }[], allConceptIds: readonly string[]): number {
  const known = new Map(conceptPKnown.map((concept) => [concept.conceptId, concept.pKnown]))
  const ids = new Set(allConceptIds)
  return ids.size ? [...ids].reduce((sum, id) => sum + (known.get(id) ?? 0), 0) / ids.size : 0
}

export function conceptStatus(attempted: boolean, pKnown: number, benchmark: number): ConceptStatus {
  if (!attempted) return 'not_started'
  return Math.round(pKnown * 100) >= Math.round(benchmark * 100) ? 'mastered' : 'learning'
}

export function unitState({ concepts, placed, unlocked, benchmark }: {
  concepts: readonly Pick<TopicPath['units'][number]['concepts'][number], 'pKnown' | 'measured' | 'critical'>[]
  placed: boolean
  unlocked: boolean
  benchmark: number
}): UnitState {
  if (concepts.some((concept) => concept.measured)) {
    return concepts.every((concept) => Math.round(concept.pKnown * 100) >= Math.round(benchmark * 100)) ? 'mastered' : 'learning'
  }
  if (!placed) return 'not_started'
  return unlocked ? 'estimate' : 'locked'
}
