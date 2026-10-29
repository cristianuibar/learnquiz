import { expect, it } from 'vitest'
import { z } from 'zod'
import { DAILY_MODEL_CALL_CAP, isOverDailyCap, MAX_SOURCE_TEXT_CHARS, utcDayStart } from './limits'

it('counts only the current UTC day towards the daily cap', () => {
  const now = Date.UTC(2026, 9, 29, 15, 30)
  const start = utcDayStart(now)
  expect(start).toBe(Date.UTC(2026, 9, 29))
  const calls = [start - 1, start, start + 60_000, now, Date.UTC(2026, 9, 30)]
  const today = calls.filter((at) => at >= start && at < start + 86_400_000)
  expect(today).toHaveLength(3)
  expect(isOverDailyCap(today.length)).toBe(false)
})

it('blocks at the daily cap so a capped guest gets no further model call', () => {
  expect(DAILY_MODEL_CALL_CAP).toBe(20)
  expect(isOverDailyCap(DAILY_MODEL_CALL_CAP - 1)).toBe(false)
  expect(isOverDailyCap(DAILY_MODEL_CALL_CAP)).toBe(true)
  expect(isOverDailyCap(DAILY_MODEL_CALL_CAP + 5)).toBe(true)
})

it('rejects a pasted source over the stored-size limit before any model call', () => {
  // Same validator expression as createTopic.
  const sourceText = z.string().max(MAX_SOURCE_TEXT_CHARS).optional()
  expect(MAX_SOURCE_TEXT_CHARS).toBe(20_000)
  expect(sourceText.safeParse('x'.repeat(MAX_SOURCE_TEXT_CHARS)).success).toBe(true)
  expect(sourceText.safeParse('x'.repeat(MAX_SOURCE_TEXT_CHARS + 1)).success).toBe(false)
  expect(sourceText.safeParse('x'.repeat(400_000)).success).toBe(false)
})
