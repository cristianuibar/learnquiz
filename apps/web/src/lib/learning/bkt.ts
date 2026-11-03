import type { Confidence, ItemView } from './types'

// Week-one hand-set values, not fitted.
export const BKT = { L0: 0.2, T: 0.15, S: 0.1 }
export const MASTERY = 0.95

// A 'guess' flag means the learner likely did not know, so a hit is weak evidence (G = 0.6).
export function guessFor(format: ItemView['format'], optionCount: number, confidence: Confidence): number {
  if (confidence === 'guess') return 0.6
  if (format !== 'mcq') return 0.05
  return optionCount === 3 ? 0.33 : 0.25
}

export function update(pKnown: number, correct: boolean, guess: number): number {
  const { S, T } = BKT
  const seen = correct
    ? (pKnown * (1 - S)) / (pKnown * (1 - S) + (1 - pKnown) * guess)
    : (pKnown * S) / (pKnown * S + (1 - pKnown) * (1 - guess))
  return seen + (1 - seen) * T
}

// Units map to levels 1..5 by position; below the learner's level starts higher.
export function placementPrior(unitOrder: number, unitCount: number, level: number): number {
  const band = 1 + Math.round((unitOrder / Math.max(1, unitCount - 1)) * 4)
  return band < level ? 0.6 : band === level ? 0.3 : 0.15
}
