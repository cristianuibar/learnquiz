import { expect, it } from 'vitest'
import { composeSession, reinsert, streakAfter } from './session'

it('composes due first, frontier next, closers last, no adjacent concept repeats', () => {
  const it = (id: string, difficulty = 3) => ({ id, difficulty })
  const ids = composeSession({
    size: 8,
    due: [
      { id: 'd1', conceptId: 'A', confidentError: false, retrievability: 0.2 },
      { id: 'd2', conceptId: 'B', confidentError: true, retrievability: 0.8 },
    ],
    frontier: [
      { conceptId: 'C', unitOrder: 1, pKnown: 0.3, items: [it('c1'), it('c2'), it('c3')] },
      { conceptId: 'D', unitOrder: 0, pKnown: 0.5, items: [it('d3'), it('d4')] },
    ],
    closers: [{ id: 'k1', conceptId: 'E' }, { id: 'k2', conceptId: 'F' }],
    targetDifficulty: 3,
  })
  const concept: Record<string, string> = { d1: 'A', d2: 'B', c1: 'C', c2: 'C', c3: 'C', d3: 'D', d4: 'D', k1: 'E', k2: 'F' }
  expect(ids).toHaveLength(8)
  expect(ids.slice(0, 2)).toEqual(['d2', 'd1']) // confident error first
  expect(ids.slice(-2)).toEqual(['k1', 'k2'])
  expect(ids.filter((id) => id.startsWith('c')).length).toBeLessThanOrEqual(3)
  ids.slice(1).forEach((id, i) => expect(concept[id]).not.toBe(concept[ids[i]]))
})

it('reinserts a missed item 5 slots later', () => {
  expect(reinsert(['a', 'b', 'c', 'd', 'e', 'f', 'g', 'h'], 'a', 0)).toEqual(['a', 'b', 'c', 'd', 'e', 'a', 'f', 'g', 'h'])
})

it('counts a day only at 10 items and resets after a gap', () => {
  const day = (n: number) => new Date(Date.UTC(2026, 9, n, 12))
  const prev = { streakCount: 3, lastSessionAt: day(27).getTime(), xp: 100, level: 3, rating: 1500 }
  expect(streakAfter(prev, day(28), 9)).toEqual({ streakCount: 3, lastSessionAt: day(27).getTime() })
  expect(streakAfter(prev, day(28), 10).streakCount).toBe(4)
  expect(streakAfter(prev, day(27), 10).streakCount).toBe(3)
  expect(streakAfter(prev, day(30), 10).streakCount).toBe(1)
})
