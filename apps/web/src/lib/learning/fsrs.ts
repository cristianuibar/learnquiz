import { createEmptyCard, fsrs, Rating, State, type Card, type Grade } from 'ts-fsrs'
import type { learnerItem } from '@/db/schema'
import type { Confidence } from './types'

export type LearnerItemRow = Omit<typeof learnerItem.$inferSelect, 'learnerId' | 'itemId'>
// What FSRS owns; lastWrongConfidentAt is set by the caller.
export type Schedule = Omit<LearnerItemRow, 'lastWrongConfidentAt'>

// Deterministic: no fuzz, so the same history gives the same due date.
const scheduler = fsrs({ request_retention: 0.9, maximum_interval: 90, enable_fuzz: false, enable_short_term: true })

export function toCard(row: Schedule | null): Card {
  if (!row) return createEmptyCard()
  return {
    due: new Date(row.due),
    stability: row.stability,
    difficulty: row.difficulty,
    elapsed_days: 0, // deprecated in ts-fsrs, unused by the scheduler
    scheduled_days: row.scheduledDays,
    learning_steps: 0, // shortcut: step index is not stored, a learning card restarts at step 0; add a column if re-asks matter
    reps: row.reps,
    lapses: row.lapses,
    state: row.state as State,
    last_review: row.lastReview === null ? undefined : new Date(row.lastReview),
  }
}

export function fromCard(card: Card): Schedule {
  return {
    due: card.due.getTime(),
    stability: card.stability,
    difficulty: card.difficulty,
    state: card.state,
    reps: card.reps,
    lapses: card.lapses,
    lastReview: card.last_review ? card.last_review.getTime() : null,
    scheduledDays: card.scheduled_days,
  }
}

// shortcut: Easy is never used, upgrade to Easy after 3 consecutive sure-correct answers.
export function ratingFor(correct: boolean, confidence: Confidence): Grade {
  if (!correct) return Rating.Again
  return confidence === 'guess' ? Rating.Hard : Rating.Good
}

// 0 for a card never reviewed, so it counts as due.
export function retrievability(row: Schedule | null, now: Date): number {
  if (!row || row.lastReview === null || row.state === State.New) return 0
  return scheduler.get_retrievability(toCard(row), now, false)
}

export function review(row: Schedule | null, correct: boolean, confidence: Confidence, now: Date) {
  const retrievabilityBefore = retrievability(row, now)
  const { card } = scheduler.next(toCard(row), now, ratingFor(correct, confidence))
  return { next: fromCard(card), retrievabilityBefore }
}
