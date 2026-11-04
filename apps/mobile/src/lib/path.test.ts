import type { TopicPath } from '@learnquiz/api/progress'
import {
  headerLine,
  isPreparing,
  nodeKind,
  railSegment,
  roleBarText,
  topicPathUrl,
  unitBar,
  unitHref,
  unitMeta,
  unitPercent,
  unitRows,
  type PathUnit,
} from './path'

function unit(id: string, name: string, mastery: number, state: PathUnit['state'], criticalCount = 0): PathUnit {
  return {
    id, order: 0, name, summary: '', mastery, measured: state === 'learning' || state === 'mastered',
    unlocked: state !== 'locked', state, criticalCount, canPractice: state !== 'locked', source: null, concepts: [],
  }
}

// The design's Path: Picking is the unit the next session starts with.
const designUnits = [
  unit('u-receiving', 'Receiving', 0.82, 'learning', 3),
  unit('u-picking', 'Picking', 0.68, 'learning'),
  unit('u-scanning', 'Scanning', 0.74, 'learning'),
  unit('u-safety', 'Safety', 0.4, 'estimate', 3),
  unit('u-returns', 'Returns', 0, 'not_started'),
]

describe('nodeKind', () => {
  it('gives each unit state its own node and marks the next unit', () => {
    expect(designUnits.map((u) => nodeKind(u, 'u-picking'))).toEqual(['learning', 'next', 'learning', 'estimate', 'not_started'])
    expect(nodeKind(unit('m', 'M', 0.9, 'mastered'), null)).toBe('mastered')
    expect(nodeKind(unit('l', 'L', 0, 'locked'), null)).toBe('locked')
  })

  it('lets next win over mastered, and locked win over next', () => {
    expect(nodeKind(unit('m', 'M', 0.9, 'mastered'), 'm')).toBe('next')
    expect(nodeKind(unit('l', 'L', 0, 'locked'), 'l')).toBe('locked')
  })

  it('marks nothing as next when the server names no next unit', () => {
    expect(designUnits.map((u) => nodeKind(u, null))).not.toContain('next')
  })
})

describe('headerLine', () => {
  it('reads mastery against the benchmark and the onboarding day', () => {
    expect(headerLine({ mastery: 0.66, benchmark: 0.85, onboarding: { day: 16, days: 30 } })).toBe('66% of 85% benchmark · Day 16 of 30')
  })

  it('drops the day part when there is no onboarding schedule', () => {
    expect(headerLine({ mastery: 0.66, benchmark: 0.85, onboarding: null })).toBe('66% of 85% benchmark')
    expect(headerLine({ mastery: 0, benchmark: 0.7, onboarding: null })).toBe('0% of 70% benchmark')
  })

  it('speaks the role bar value with its benchmark', () => {
    expect(roleBarText({ mastery: 0.66, benchmark: 0.85 })).toBe('66%, benchmark 85%')
  })
})

describe('unitPercent', () => {
  it('prefixes estimates with a tilde and mutes them', () => {
    expect(unitPercent(unit('s', 'Safety', 0.4, 'estimate'))).toEqual({ text: '~40%', muted: true })
  })

  it('mutes units not started and locked units, and leaves measured units in ink', () => {
    expect(unitPercent(unit('r', 'Returns', 0, 'not_started'))).toEqual({ text: '0%', muted: true })
    expect(unitPercent(unit('l', 'Locked', 0, 'locked'))).toEqual({ text: '0%', muted: true })
    expect(unitPercent(unit('p', 'Picking', 0.68, 'learning'))).toEqual({ text: '68%', muted: false })
    expect(unitPercent(unit('m', 'Receiving', 0.85, 'mastered'))).toEqual({ text: '85%', muted: false })
  })
})

describe('unitBar', () => {
  it('fills measured units in percent, dashes estimates and leaves the rest empty', () => {
    expect(unitBar(unit('p', 'Picking', 0.68, 'learning'))).toEqual({ value: 68, estimate: false })
    expect(unitBar(unit('m', 'Receiving', 0.9, 'mastered'))).toEqual({ value: 90, estimate: false })
    expect(unitBar(unit('s', 'Safety', 0.4, 'estimate'))).toEqual({ value: 40, estimate: true })
    expect(unitBar(unit('r', 'Returns', 0.2, 'not_started'))).toEqual({ value: 0, estimate: false })
    expect(unitBar(unit('l', 'Locked', 0.3, 'locked'))).toEqual({ value: 0, estimate: false })
  })
})

describe('unitMeta', () => {
  it('shows a chip only for exceptions', () => {
    expect(unitMeta(unit('m', 'M', 0.9, 'mastered')).chip).toBe('mastered')
    expect(unitMeta(unit('s', 'S', 0.4, 'estimate')).chip).toBe('estimate')
    expect(unitMeta(unit('r', 'R', 0, 'not_started')).chip).toBe('none')
    expect(unitMeta(unit('l', 'L', 0, 'locked')).chip).toBe('locked')
    expect(unitMeta(unit('p', 'P', 0.68, 'learning')).chip).toBeNull()
  })

  it('adds the critical tag when the unit has critical concepts', () => {
    expect(unitMeta(unit('r', 'Receiving', 0.82, 'learning', 3))).toEqual({ chip: null, critical: '3 critical', meta: true })
    expect(unitMeta(unit('s', 'Safety', 0.4, 'estimate', 1))).toEqual({ chip: 'estimate', critical: '1 critical', meta: true })
  })

  it('has no meta row for a learning unit without critical concepts', () => {
    expect(unitMeta(unit('p', 'Picking', 0.68, 'learning'))).toEqual({ chip: null, critical: null, meta: false })
  })

  it('always has a meta row for a locked unit', () => {
    expect(unitMeta(unit('l', 'L', 0, 'locked')).meta).toBe(true)
  })
})

describe('railSegment', () => {
  it('runs from the first node to the last and is absent for a single unit', () => {
    expect([0, 1, 2, 3, 4].map((i) => railSegment(i, 5))).toEqual(['first', 'middle', 'middle', 'middle', 'last'])
    expect([0, 1].map((i) => railSegment(i, 2))).toEqual(['first', 'last'])
    expect(railSegment(0, 1)).toBeNull()
  })
})

describe('isPreparing', () => {
  it('holds the units back while preparing or when there are none', () => {
    expect(isPreparing({ preparing: true, units: designUnits })).toBe(true)
    expect(isPreparing({ preparing: false, units: [] })).toBe(true)
    expect(isPreparing({ preparing: false, units: designUnits })).toBe(false)
  })
})

describe('unitRows', () => {
  const path: Pick<TopicPath, 'units' | 'nextUnitId'> = { units: designUnits, nextUnitId: 'u-picking' }

  it('numbers rows by position and announces them with the shared label', () => {
    const rows = unitRows(path)
    expect(rows.map((row) => row.number)).toEqual([1, 2, 3, 4, 5])
    expect(rows.map((row) => row.label)).toEqual([
      'Unit 1, Receiving: 82%, Still learning, 3 critical concepts',
      'Unit 2, Picking, Next up: 68%, Still learning',
      'Unit 3, Scanning: 74%, Still learning',
      'Unit 4, Safety: about 40%, Placement estimate, not practiced yet, 3 critical concepts',
      'Unit 5, Returns: 0%, Not started',
    ])
    expect(rows.map((row) => row.next)).toEqual([false, true, false, false, false])
  })

  it('keeps a locked next unit inert and never announces it as next up', () => {
    const [row] = unitRows({ units: [unit('l', 'Returns', 0, 'locked')], nextUnitId: 'l' })
    expect(row).toMatchObject({ locked: true, next: false, kind: 'locked', label: 'Unit 1, Returns: 0%, Locked', rail: null })
  })
})

describe('links', () => {
  it('pushes the unit with its topic', () => {
    expect(unitHref('u-picking', 'topic-1')).toEqual({ pathname: '/unit/[unitId]', params: { unitId: 'u-picking', topicId: 'topic-1' } })
  })

  it('loads the path for the encoded topic id', () => {
    expect(topicPathUrl('topic-1')).toBe('/topics/topic-1/path')
    expect(topicPathUrl('a/b')).toBe('/topics/a%2Fb/path')
  })
})
