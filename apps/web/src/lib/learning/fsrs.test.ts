import { expect, it } from 'vitest'
import { retrievability, review } from './fsrs'

it('schedules a miss soon and a hit later, round-tripping through row fields', () => {
  const t0 = new Date('2026-10-28T10:00:00Z')
  expect(retrievability(null, t0)).toBe(0)
  const miss = review(null, false, 'sure', t0).next
  expect(miss.due - t0.getTime()).toBeLessThanOrEqual(10 * 60_000)
  const hit = review(null, true, 'sure', t0).next
  expect(hit.due).toBeGreaterThan(miss.due)
  const later = new Date(t0.getTime() + 86_400_000)
  const again = review(hit, true, 'sure', later)
  expect(again.retrievabilityBefore).toBeGreaterThan(0.5)
  expect(again.retrievabilityBefore).toBeLessThanOrEqual(1)
  expect(again.next.reps).toBe(2)
})

it('schedules a card persisted in the 5.x row shape', () => {
  const stored = {
    due: Date.parse('2026-10-30T10:00:00Z'),
    stability: 4.2,
    difficulty: 6.1,
    state: 2,
    reps: 3,
    lapses: 1,
    lastReview: Date.parse('2026-10-26T10:00:00Z'),
    scheduledDays: 4,
  }
  const now = new Date('2026-10-30T10:00:00Z')
  const { next, retrievabilityBefore } = review(stored, true, 'sure', now)
  expect(retrievabilityBefore).toBeGreaterThan(0.85)
  expect(retrievabilityBefore).toBeLessThan(0.95)
  expect(next).toMatchObject({ state: 2, reps: 4, lapses: 1, lastReview: now.getTime() })
  expect(next.stability).toBeGreaterThan(stored.stability)
  expect(next.due).toBeGreaterThan(now.getTime())
})

it('never schedules a relearning card past 90 days', () => {
  const now = new Date('2026-11-21T12:00:00Z')
  const stored = {
    due: now.getTime(),
    stability: 20,
    difficulty: 6.1,
    state: 3,
    reps: 5,
    lapses: 1,
    lastReview: now.getTime() - 90 * 86_400_000,
    scheduledDays: 1,
  }
  const { next } = review(stored, true, 'sure', now)
  expect(next.scheduledDays).toBe(90)
  expect(next.due).toBe(now.getTime() + 90 * 86_400_000)
})
