import { criticalRows, formatShortDate, percentText, type Profile } from '@learnquiz/api/progress'
import { unitBar } from './path'

type Unit = Profile['units'][number]
type Concept = Unit['concepts'][number]
type ConceptChip = 'mastered' | 'learning' | 'none' | 'critical'

export function conceptPresentation(concept: Pick<Concept, 'status' | 'critical' | 'measured' | 'pKnown'>) {
  const chips: ConceptChip[] = [concept.status === 'not_started' ? 'none' : concept.status]
  if (concept.critical) chips.push('critical')
  return { chips, percent: concept.measured ? percentText(concept.pKnown) : null, showBar: concept.measured }
}

export function unitPresentation(unit: Pick<Unit, 'state' | 'mastery'>) {
  const estimate = unit.state === 'estimate'
  return {
    ...unitBar(unit),
    percent: percentText(unit.mastery, estimate),
    spokenPercent: `${estimate ? 'about ' : ''}${percentText(unit.mastery)}`,
    chip: estimate ? 'estimate' as const : null,
    caption: estimate ? 'From your placement check. Not practiced yet.' : null,
  }
}

export function criticalSteps(errors: readonly Profile['confidentErrors'][number][]) {
  return criticalRows(errors).map((row) => ({
    ...row,
    chip: 'neutral' as const,
    caption: `Answered with confidence, missed ${formatShortDate(row.at)}`,
  }))
}
