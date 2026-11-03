import { describe, expect, it } from 'vitest'
import { conceptStatus, roleMastery, unitState } from './path'

describe('roleMastery', () => {
  it('counts unmet concepts as zero and excludes concepts outside the role', () => {
    expect(roleMastery([{ conceptId: 'a', pKnown: 0.9 }, { conceptId: 'b', pKnown: 0.6 }, { conceptId: 'other', pKnown: 1 }], ['a', 'b', 'c'])).toBe(0.5)
  })

  it('returns zero before any concepts are known or when the role has no concepts', () => {
    expect(roleMastery([], ['a', 'b'])).toBe(0)
    expect(roleMastery([{ conceptId: 'a', pKnown: 1 }], [])).toBe(0)
  })

  it('counts each concept once', () => {
    expect(roleMastery([{ conceptId: 'a', pKnown: 0.8 }], ['a', 'a', 'b'])).toBe(0.4)
  })
})

describe('conceptStatus', () => {
  it.each([
    [false, 1, 0.85, 'not_started'],
    [false, 0, 0.85, 'not_started'],
    [true, 0, 0.85, 'learning'],
    [true, 0.844, 0.85, 'learning'],
    [true, 0.846, 0.85, 'mastered'],
    [true, 0.85, 0.85, 'mastered'],
    [true, 1, 0.85, 'mastered'],
    [true, 0.844, 0.844, 'mastered'],
    [true, 0.85, 0.856, 'learning'],
    [true, 0, 0, 'mastered'],
  ] as const)('maps attempted=%s, pKnown=%s, benchmark=%s to %s', (attempted, pKnown, benchmark, expected) => {
    expect(conceptStatus(attempted, pKnown, benchmark)).toBe(expected)
  })
})

describe('unitState', () => {
  const concept = (pKnown: number, measured: boolean, critical = false) => ({ pKnown, measured, critical })

  it.each([
    [false, false, 'not_started'],
    [false, true, 'not_started'],
    [true, false, 'locked'],
    [true, true, 'estimate'],
  ] as const)('maps an unpracticed unit with placed=%s, unlocked=%s to %s', (placed, unlocked, expected) => {
    expect(unitState({ concepts: [concept(1, false, true)], placed, unlocked, benchmark: 0.85 })).toBe(expected)
  })

  it.each([
    [false, false], [false, true], [true, false], [true, true],
  ])('uses measured mastery before placement or lock state (placed=%s, unlocked=%s)', (placed, unlocked) => {
    expect(unitState({ concepts: [concept(0.846, true), concept(0.85, false, true)], placed, unlocked, benchmark: 0.85 })).toBe('mastered')
    expect(unitState({ concepts: [concept(0.844, true)], placed, unlocked, benchmark: 0.85 })).toBe('learning')
  })

  it.each([true, false])('blocks mastered when any concept is below benchmark (critical=%s)', (critical) => {
    expect(unitState({ concepts: [concept(1, true), concept(0.8, false, critical)], placed: true, unlocked: true, benchmark: 0.85 })).toBe('learning')
  })

  it('rounds critical mastery and the benchmark to whole percents', () => {
    expect(unitState({ concepts: [concept(1, true), concept(0.846, false, true)], placed: true, unlocked: true, benchmark: 0.85 })).toBe('mastered')
    expect(unitState({ concepts: [concept(0.85, true, true)], placed: true, unlocked: true, benchmark: 0.856 })).toBe('learning')
  })

  it.each([
    [false, false, 'not_started'], [false, true, 'not_started'], [true, false, 'locked'], [true, true, 'estimate'],
  ] as const)('never masters an empty unit (placed=%s, unlocked=%s)', (placed, unlocked, expected) => {
    expect(unitState({ concepts: [], placed, unlocked, benchmark: 0.85 })).toBe(expected)
  })
})
