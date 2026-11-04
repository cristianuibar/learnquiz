import { centeredLabel, clearOf, MAX_TREND_FONT_SCALE, textWidth, thinLabels, trendType } from './trend-labels'
import { trendGeometry } from './profile-progress'

const bottom = 144.5

test('font scale 1 keeps the artboard rows and height', () => {
  expect(trendType(1, bottom)).toEqual({ font: 12, label: 13, dateY: 164, sessionsY: 182, height: 188, gutter: 0 })
})

test('a smaller or unknown font scale never shrinks labels below the 12 px spec', () => {
  expect(trendType(0.85, bottom)).toEqual(trendType(1, bottom))
  expect(trendType(Number.NaN, bottom)).toEqual(trendType(1, bottom))
})

test('larger font scales grow labels up to the cap, push the rows down and grow the height', () => {
  const medium = trendType(1.3, bottom)
  expect(medium.font).toBe(16)
  expect(medium.height).toBeGreaterThan(188)
  const double = trendType(2, bottom)
  expect(double).toEqual(trendType(MAX_TREND_FONT_SCALE, bottom))
  expect(double).toMatchObject({ font: 18, label: 20 })
  expect(double.dateY - double.font).toBeGreaterThan(bottom)
  expect(double.sessionsY - Math.max(double.font, double.label)).toBeGreaterThanOrEqual(double.dateY)
  expect(double.height).toBeGreaterThanOrEqual(double.sessionsY + double.font / 2)
  expect(double.gutter).toBe(Math.ceil(textWidth('Sessions', 20) - textWidth('Sessions', 13)))
})

test('a centred label moves inward at either edge and keeps its width', () => {
  expect(centeredLabel(100, 40, 294)).toEqual({ x: 100, left: 80, right: 120 })
  expect(centeredLabel(290, 40, 294)).toEqual({ x: 274, left: 254, right: 294 })
  expect(centeredLabel(5, 40, 294)).toEqual({ x: 20, left: 0, right: 40 })
})

test('thinning keeps the newest label and every label that clears the next kept one', () => {
  const spans = [0, 30, 60, 90].map((x) => ({ left: x, right: x + 40 }))
  expect(thinLabels(spans)).toEqual([false, true, false, true])
  expect(thinLabels([{ left: 0, right: 20 }, { left: 24, right: 40 }])).toEqual([true, true])
  expect(thinLabels([{ left: 0, right: 20 }, { left: 23, right: 40 }])).toEqual([false, true])
  expect(thinLabels([])).toEqual([])
})

test('a reserved projection label always wins over a label that reaches it', () => {
  const spans = [{ left: 0, right: 40 }, { left: 60, right: 100 }]
  expect(thinLabels(spans, { left: 90, right: 130 })).toEqual([true, false])
  expect(thinLabels(spans, { left: 104, right: 130 })).toEqual([true, true])
  expect(clearOf({ left: 60, right: 100 }, { left: 103, right: 130 })).toBe(false)
  expect(clearOf({ left: 60, right: 100 }, { left: 104, right: 130 })).toBe(true)
  expect(clearOf({ left: 60, right: 100 }, null)).toBe(true)
})

test.each([1.5, 2])('12 weeks without a projection keep the actual Inter 100%% label inside at font scale %s', (fontScale) => {
  const weeks = Array.from({ length: 12 }, (_, index) => ({
    start: Date.UTC(2026, 7, 3 + index * 7), mastery: 1, sessions: 5, partial: false,
  }))
  const chart = trendGeometry(weeks, 0.85, null, 294, fontScale)
  const last = chart.points.at(-1)!
  expect(chart.projection).toBeNull()
  expect(last.valued).toBe(true)
  expect(last.valueLabel).toBe('100%')
  // Bundled Inter Bold hmtx advances for 1, 0, 0, % (2048 units/em).
  // This bounds the ink independently of textWidth's estimate, including
  // every weight used by the chart, rather than testing estimated spans.
  const actualWidth = (883 + 1381 + 1381 + 2080) / 2048 * chart.type.font
  expect(last.value.x + actualWidth / 2).toBeLessThanOrEqual(chart.width)
  expect(last.value.x - actualWidth / 2).toBeGreaterThanOrEqual(0)
})
