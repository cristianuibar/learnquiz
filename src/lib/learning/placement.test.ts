import { expect, it } from 'vitest'
import { levelResult, nextLevel, pickNext, shouldStop } from './placement'

const log = (...levels: number[]) => levels.map((level) => ({ level }))

it('moves the level by confidence and clamps', () => {
  expect([nextLevel(3, true, 'sure'), nextLevel(3, false, 'sure'), nextLevel(3, false, 'guess'), nextLevel(5, true, 'sure')]).toEqual([4, 2, 2.5, 5])
})

it('stops at 8 items when stable, else at 12', () => {
  expect(shouldStop(log(3, 3, 3, 3, 3, 3, 3))).toBe(false)
  expect(shouldStop(log(3, 3, 3, 3, 3, 3.5, 3, 3.5))).toBe(true)
  expect(shouldStop(log(1, 1, 1, 1, 1, 1, 1, 2.5, 1, 4, 1, 4))).toBe(true)
  expect(shouldStop(log(1, 1, 1, 1, 1, 1, 1, 2.5, 1, 4, 1))).toBe(false)
})

it('rounds the mean of the last 4 levels', () => {
  expect(levelResult(log(1, 3, 3.5, 4, 4.5))).toBe(4)
})

it('picks the closest unseen difficulty, avoiding recent concepts', () => {
  const pool = [
    { id: 'a', conceptId: 'c1', difficulty: 3 },
    { id: 'b', conceptId: 'c2', difficulty: 4 },
    { id: 'c', conceptId: 'c3', difficulty: 5 },
  ]
  expect(pickNext(3, pool, [{ id: 'x', conceptId: 'c1' }])).toBe('b')
  expect(pickNext(3, pool.slice(0, 1), [{ id: 'a', conceptId: 'c1' }])).toBeNull()
})
