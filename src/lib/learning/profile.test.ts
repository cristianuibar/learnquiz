import { describe, expect, it } from 'vitest'
import { benchmarkMet, confidentErrors, masterySeries, projectBenchmarkAt, WEEK, type ProgressAttempt, type RoleConcept } from './profile'

const at = (itemId: string, conceptId: string, t: number, correct: boolean, confidence: ProgressAttempt['confidence'] = 'sure', pKnownAfter = 0): ProgressAttempt => ({
  itemId,
  conceptId,
  at: t,
  correct,
  confidence,
  pKnownAfter,
})

describe('masterySeries', () => {
  it('takes the last value per concept at each week end, with priors and a clamped last week', () => {
    const attempts = [
      at('i1', 'a', 1.5 * WEEK, true, 'sure', 0.875),
      at('i1', 'a', 0.5 * WEEK, true, 'sure', 0.25),
      at('i1', 'a', WEEK, true, 'sure', 0.75),
      at('i1', 'a', 0.9 * WEEK, true, 'sure', 0.5),
      at('i2', 'b', 2.2 * WEEK, true, 'sure', 0.5),
      at('i3', 'c', 0.1 * WEEK, true, 'sure', 0.99),
    ]
    expect(masterySeries(['a', 'b'], attempts, 0, 2.5 * WEEK, new Map([['b', 0.25]]))).toEqual([
      { end: WEEK, mastery: 0.5 },
      { end: 2 * WEEK, mastery: 0.5625 },
      { end: 2.5 * WEEK, mastery: 0.6875 },
    ])
  })
})

describe('confidentErrors', () => {
  it('pairs sure-wrong critical attempts with the first later correct on the same item', () => {
    const crit = new Set(['a'])
    const attempts = [
      at('x', 'a', 50, true),
      at('y', 'a', 40, false, 'sure'),
      at('x', 'a', 30, true),
      at('x', 'a', 10, false, 'sure'),
      at('z', 'a', 20, false, 'unsure'),
      at('w', 'b', 25, false, 'sure'),
      at('q', 'a', 45, true),
      at('u', 'a', 5, false, 'sure'),
    ]
    expect(confidentErrors(attempts, crit)).toEqual([
      { itemId: 'u', conceptId: 'a', at: 5, correctedAt: null },
      { itemId: 'x', conceptId: 'a', at: 10, correctedAt: 30 },
      { itemId: 'y', conceptId: 'a', at: 40, correctedAt: null },
    ])
  })
})

describe('benchmarkMet', () => {
  const c = (...v: [boolean, number][]): RoleConcept[] => v.map(([critical, pKnown], i) => ({ id: `c${i}`, critical, pKnown }))
  it.each([
    ['mean and criticals met', c([true, 0.9], [false, 0.8]), true],
    ['critical below', c([true, 0.6], [false, 1]), false],
    ['mean below', c([true, 0.8], [false, 0.5]), false],
    ['no concepts', [], false],
    ['non-critical below, mean met', c([true, 1], [false, 0.7]), true],
  ])('%s', (_, concepts, want) => {
    expect(benchmarkMet(concepts, 0.8)).toBe(want)
  })
})

describe('projectBenchmarkAt', () => {
  const s = (...m: number[]) => m.map((mastery, i) => ({ end: (i + 1) * WEEK, mastery }))
  it('projects the time a rising line reaches the benchmark', () => {
    expect(projectBenchmarkAt(s(0.25, 0.5, 0.75), 1)).toBeCloseTo(4 * WEEK, 0)
  })
  it('is null for flat or falling series', () => {
    expect(projectBenchmarkAt(s(0.5, 0.5, 0.5), 0.9)).toBeNull()
    expect(projectBenchmarkAt(s(0.6, 0.5), 0.9)).toBeNull()
  })
  it('is null for a single point', () => {
    expect(projectBenchmarkAt(s(0.5), 0.9)).toBeNull()
  })
  it('returns the last end when already met', () => {
    expect(projectBenchmarkAt(s(0.5, 0.95), 0.9)).toBe(2 * WEEK)
  })
})
