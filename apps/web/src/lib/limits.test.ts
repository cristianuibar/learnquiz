import { expect, it } from 'vitest'
import { z } from 'zod'
import { ACCOUNT_DAILY_MODEL_CALL_CAP, GUEST_DAILY_MODEL_CALL_CAP, isOverDailyCap, MAX_SOURCE_TEXT_CHARS, utcDayStart } from './limits'

it('counts only the current UTC day towards the daily cap', () => {
  const now = Date.UTC(2026, 9, 29, 15, 30)
  const start = utcDayStart(now)
  expect(start).toBe(Date.UTC(2026, 9, 29))
  const calls = [start - 1, start, start + 60_000, now, Date.UTC(2026, 9, 30)]
  const today = calls.filter((at) => at >= start && at < start + 86_400_000)
  expect(today).toHaveLength(3)
  expect(isOverDailyCap(today.length)).toBe(false)
})

it.each([
  { who: 'guest', cap: GUEST_DAILY_MODEL_CALL_CAP, expected: 150 },
  { who: 'account', cap: ACCOUNT_DAILY_MODEL_CALL_CAP, expected: 500 },
])('blocks a $who at exactly its daily cap', ({ cap, expected }) => {
  expect(cap).toBe(expected)
  expect(isOverDailyCap(cap - 1, cap)).toBe(false)
  expect(isOverDailyCap(cap, cap)).toBe(true)
  expect(isOverDailyCap(cap + 5, cap)).toBe(true)
})

it('rejects a pasted source over the stored-size limit before any model call', () => {
  // Same validator expression as createTopic.
  const sourceText = z.string().max(MAX_SOURCE_TEXT_CHARS).optional()
  expect(MAX_SOURCE_TEXT_CHARS).toBe(20_000)
  expect(sourceText.safeParse('x'.repeat(MAX_SOURCE_TEXT_CHARS)).success).toBe(true)
  expect(sourceText.safeParse('x'.repeat(MAX_SOURCE_TEXT_CHARS + 1)).success).toBe(false)
  expect(sourceText.safeParse('x'.repeat(400_000)).success).toBe(false)
})
