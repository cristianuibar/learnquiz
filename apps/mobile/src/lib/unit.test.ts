import type { TopicPath } from '@learnquiz/api/progress'
import type { PathUnit } from './path'
import {
  canPractice,
  conceptChip,
  conceptRows,
  conceptValueText,
  findUnit,
  practiceLabel,
  practiceParams,
  sourceCaption,
  unitMastery,
  unitRouteParams,
} from './unit'

type Concept = PathUnit['concepts'][number]

function concept(id: string, order: number, name: string, pKnown: number, status: Concept['status'], critical = false): Concept {
  return { id, order, name, summary: '', visual: false, grounded: true, critical, answeredCount: 1, pKnown, measured: status !== 'not_started', status }
}

// The design's Receiving unit, with its concepts deliberately out of order.
const receiving: PathUnit = {
  id: 'u-receiving', order: 0, name: 'Receiving', summary: '', mastery: 0.82, measured: true, unlocked: true,
  state: 'learning', criticalCount: 3, canPractice: true, source: { title: 'Receiving SOP', version: 3 },
  concepts: [
    concept('c-count', 2, 'Count and label inbound cartons', 0.88, 'mastered'),
    concept('c-asn', 0, 'Check the delivery against the ASN', 0.94, 'mastered'),
    concept('c-hazmat', 4, 'Hazmat cartons need sign-off', 0.77, 'learning', true),
    concept('c-damaged', 1, 'Damaged pallet: record before moving', 0.72, 'learning', true),
    concept('c-quarantine', 3, 'Quarantine bay Q1', 0.79, 'learning', true),
  ],
}

const picking: PathUnit = { ...receiving, id: 'u-picking', name: 'Picking', criticalCount: 0, source: null, concepts: [] }

function pathWith(units: PathUnit[]): Pick<TopicPath, 'units' | 'benchmark'> {
  return { units, benchmark: 0.85 }
}

describe('findUnit', () => {
  it('picks the unit the route names', () => {
    expect(findUnit(pathWith([receiving, picking]), 'u-picking')?.name).toBe('Picking')
    expect(findUnit(pathWith([receiving, picking]), 'u-receiving')?.name).toBe('Receiving')
  })

  it('returns null for a unit the path does not have, or no unit id', () => {
    expect(findUnit(pathWith([receiving, picking]), 'u-unknown')).toBeNull()
    expect(findUnit(pathWith([]), 'u-receiving')).toBeNull()
    expect(findUnit(pathWith([receiving]), null)).toBeNull()
  })
})

describe('unitRouteParams', () => {
  it('reads string params and drops arrays and empty values', () => {
    expect(unitRouteParams({ unitId: 'u-1', topicId: 't-1' })).toEqual({ unitId: 'u-1', topicId: 't-1' })
    expect(unitRouteParams({ unitId: ['u-1', 'u-2'], topicId: 't-1' })).toEqual({ unitId: null, topicId: 't-1' })
    expect(unitRouteParams({ unitId: 'u-1', topicId: '' })).toEqual({ unitId: 'u-1', topicId: null })
    expect(unitRouteParams({})).toEqual({ unitId: null, topicId: null })
  })
})

describe('unitMastery', () => {
  it('reads "82%" of the benchmark, with the bar value and spoken value', () => {
    expect(unitMastery(receiving, 0.85)).toEqual({
      percent: '82%',
      benchmarkLine: 'of 85% benchmark',
      bar: 82,
      benchmark: 85,
      label: 'Receiving mastery',
      valueText: '82%, benchmark 85%',
    })
  })

  it('marks a placement estimate in both the percent and the spoken value', () => {
    const m = unitMastery({ ...receiving, mastery: 0.4, state: 'estimate' }, 0.8)
    expect(m.percent).toBe('~40%')
    expect(m.benchmarkLine).toBe('of 80% benchmark')
    expect(m.valueText).toBe('about 40%, benchmark 80%')
  })
})

describe('conceptChip', () => {
  it('maps each concept status to its chip', () => {
    expect(conceptChip('mastered')).toBe('mastered')
    expect(conceptChip('learning')).toBe('learning')
    expect(conceptChip('not_started')).toBe('none')
  })
})

describe('conceptValueText', () => {
  it('speaks percent, status, critical and benchmark', () => {
    expect(conceptValueText(concept('c', 0, 'Damaged pallet', 0.72, 'learning', true), 0.85)).toBe('72%, Still learning, critical, benchmark 85%')
  })

  it('leaves critical out when the concept is not critical', () => {
    expect(conceptValueText(concept('c', 0, 'ASN', 0.94, 'mastered'), 0.85)).toBe('94%, Mastered, benchmark 85%')
    expect(conceptValueText(concept('c', 0, 'New', 0, 'not_started'), 0.9)).toBe('0%, Not started, benchmark 90%')
  })
})

describe('conceptRows', () => {
  it('lists concepts in concepts.order with percent, bar, chips and label', () => {
    const rows = conceptRows(receiving, 0.85)
    expect(rows.map((row) => row.name)).toEqual([
      'Check the delivery against the ASN',
      'Damaged pallet: record before moving',
      'Count and label inbound cartons',
      'Quarantine bay Q1',
      'Hazmat cartons need sign-off',
    ])
    expect(rows[1]).toEqual({
      id: 'c-damaged',
      name: 'Damaged pallet: record before moving',
      percent: '72%',
      bar: 72,
      chip: 'learning',
      critical: true,
      barLabel: 'Damaged pallet: record before moving mastery',
      valueText: '72%, Still learning, critical, benchmark 85%',
    })
    expect(rows[0]).toMatchObject({ percent: '94%', chip: 'mastered', critical: false })
  })

  it('does not reorder the payload it was given', () => {
    conceptRows(receiving, 0.85)
    expect(receiving.concepts[0].id).toBe('c-count')
  })
})

describe('sourceCaption', () => {
  it('reads "{title} · v{version}"', () => {
    expect(sourceCaption(receiving.source)).toBe('Receiving SOP · v3')
  })

  it('is absent when the unit has no source', () => {
    expect(sourceCaption(null)).toBeNull()
  })
})

describe('Practice', () => {
  it('labels the dock button with the unit name and length', () => {
    expect(practiceLabel(receiving)).toBe('Practice Receiving · 5 min')
    expect(practiceLabel(picking)).toBe('Practice Picking · 5 min')
  })

  it('is enabled only when the unit can be practiced', () => {
    expect(canPractice(receiving)).toBe(true)
    expect(canPractice({ ...receiving, canPractice: false })).toBe(false)
  })

  it('starts a session scoped to the unit', () => {
    expect(practiceParams('topic-1', receiving)).toEqual({ topicId: 'topic-1', start: 'session', unitId: 'u-receiving' })
  })

  it('gives no params when the unit cannot be practiced', () => {
    expect(practiceParams('topic-1', { ...receiving, canPractice: false })).toBeNull()
  })
})
