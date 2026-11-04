import type { Today } from '@learnquiz/api/today'
import { todayFixtures } from '@learnquiz/api/today'
import { firstSessionParams, formatShortDate, percentText, proficiencyFact, trendGeometry } from './profile-progress'

const day = 86_400_000
const oct19 = Date.UTC(2026, 9, 19)
const nov12 = Date.UTC(2026, 10, 12)
const weeks = [
  { start: oct19, mastery: 0.29, sessions: 5, partial: false },
  { start: oct19 + 7 * day, mastery: 0.48, sessions: 6, partial: false },
  { start: oct19 + 14 * day, mastery: 0.66, sessions: 2, partial: true },
]

test('formats rounded percentages and UTC US dates, including epoch zero', () => {
  expect(percentText(0.656)).toBe('66%')
  expect(percentText(0)).toBe('0%')
  expect(percentText(1)).toBe('100%')
  expect(formatShortDate(nov12)).toBe('Nov 12')
  expect(formatShortDate(Date.UTC(2026, 0, 1, 0, 30))).toBe('Jan 1')
  expect(formatShortDate(0)).toBe('Jan 1')
})

test('shows reached ahead of projected, or hides the fact when neither exists', () => {
  expect(proficiencyFact({ achievedAt: null, projectedAt: nov12 })).toEqual({ kind: 'projected', text: 'Projected: Nov 12' })
  expect(proficiencyFact({ achievedAt: oct19, projectedAt: nov12 })).toEqual({ kind: 'reached', text: 'Reached Oct 19' })
  expect(proficiencyFact({ achievedAt: 0, projectedAt: null })).toEqual({ kind: 'reached', text: 'Reached Jan 1' })
  expect(proficiencyFact({ achievedAt: null, projectedAt: null })).toBeNull()
})

test('places measured points and projection in the 188-high chart with date and value labels', () => {
  const chart = trendGeometry([weeks[2], weeks[0], weeks[1]], 0.85, nov12, 294)
  expect(chart.height).toBe(188)
  expect(chart.points.map(({ x }) => x)).toEqual([80, 136, 192])
  expect(chart.points.map(({ valueLabel }) => valueLabel)).toEqual(['29%', '48%', '66%'])
  expect(chart.points.map(({ dateLabel }) => dateLabel)).toEqual(['Oct 19', 'Oct 26', 'Nov 2'])
  expect(chart.points[0].y).toBeCloseTo(105.06)
  expect(chart.points[2].y).toBeCloseTo(54.74)
  expect(chart.projection).toEqual({ at: nov12, x: 272, y: expect.closeTo(28.9), dateLabel: 'Nov 12' })
  expect(chart.benchmarkY).toBeCloseTo(28.9)
  expect(chart.description).toBe('Weekly role mastery: 29% in the week of Oct 19, 48% in the week of Oct 26, 66% in the week of Nov 2; projected to reach the 85% benchmark on Nov 12.')
  expect(weeks[0].start).toBe(oct19)
})

test('handles empty and single-point histories without inventing a projection', () => {
  const empty = trendGeometry([], 0.85, nov12, 294)
  expect(empty.points).toEqual([])
  expect(empty.projection).toBeNull()
  expect(empty.description).toBe('No weekly mastery recorded yet.')
  const single = trendGeometry([weeks[0]], 0.85, null, 294)
  expect(single.points[0]).toMatchObject({ x: 80, dateLabel: 'Oct 19', valueLabel: '29%' })
  expect(single.projection).toBeNull()
  expect(trendGeometry(weeks, 0.85, oct19, 294).projection).toBeNull()
  expect(trendGeometry([{ ...weeks[0], mastery: 0.9 }], 0.85, nov12, 294).projection).toBeNull()
})

test('compresses long histories to keep all points and projection within the plot', () => {
  const chart = trendGeometry(weeks, 0.85, oct19 + 100 * day, 240)
  expect(chart.projection?.x).toBe(218)
  expect(chart.points.every(({ x, y }) => Number.isFinite(x) && Number.isFinite(y) && x <= chart.right)).toBe(true)
})

test('first-session navigation uses the confirmed Today start and waits for a playable plan', () => {
  const today = todayFixtures.first
  expect(firstSessionParams(today)).toEqual({ topicId: today.topic!.id, start: today.plan!.start })
  expect(firstSessionParams({ ...today, plan: { ...today.plan!, start: 'placement' } })).toEqual({ topicId: today.topic!.id, start: 'placement' })
  expect(firstSessionParams(null)).toBeNull()
  expect(firstSessionParams({ ...today, topic: null })).toBeNull()
  expect(firstSessionParams({ ...today, plan: null })).toBeNull()
  expect(firstSessionParams({ ...today, plan: { ...today.plan!, playable: false } })).toBeNull()
  expect(firstSessionParams({ ...today, role: { ...today.role!, preparing: true } } as Today)).toBeNull()
})

test('keeps the first session playable while a published role is building', () => {
  const today = todayFixtures.first
  const building: Today = {
    ...today,
    plan: { ...today.plan!, state: 'first', playable: true },
    role: { ...today.role!, preparing: false, building: { ready: 2, total: 10 } },
  }
  expect(firstSessionParams(building)).toEqual({ topicId: today.topic!.id, start: today.plan!.start })
  expect(firstSessionParams({ ...building, role: { ...building.role!, preparing: true } })).toBeNull()
  expect(firstSessionParams({ ...building, plan: { ...building.plan!, playable: false } })).toBeNull()
})
