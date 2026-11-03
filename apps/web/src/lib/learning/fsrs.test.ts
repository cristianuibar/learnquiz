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
