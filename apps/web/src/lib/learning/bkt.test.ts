import { expect, it } from 'vitest'
import { guessFor, placementPrior, update } from './bkt'

it('matches the worked example in algorithms 2.1', () => {
  const afterHit = update(0.2, true, 0.25)
  expect(afterHit).toBeCloseTo(0.553, 2)
  expect(update(afterHit, false, 0.25)).toBeCloseTo(0.27, 2)
})

it('picks guess by format and confidence', () => {
  expect([guessFor('mcq', 4, 'sure'), guessFor('mcq', 3, 'sure'), guessFor('cloze', 0, 'sure'), guessFor('mcq', 4, 'guess')]).toEqual([0.25, 0.33, 0.05, 0.6])
})

it('seeds higher priors below the learner level', () => {
  expect([0, 2, 4].map((o) => placementPrior(o, 5, 3))).toEqual([0.6, 0.3, 0.15])
})
