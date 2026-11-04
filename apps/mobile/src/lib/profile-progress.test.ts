import type { Today } from '@learnquiz/api/today'
import { todayFixtures } from '@learnquiz/api/today'
import { firstSessionParams, formatShortDate, percentText, proficiencyFact, trendDescription, trendGeometry } from './profile-progress'

const day = 86_400_000
const oct19 = Date.UTC(2026, 9, 19)
const nov12 = Date.UTC(2026, 10, 12)
const weeks = [
  { start: oct19, mastery: 0.29, sessions: 5, partial: false },
  { start: oct19 + 7 * day, mastery: 0.48, sessions: 6, partial: false },
  { start: oct19 + 14 * day, mastery: 0.66, sessions: 2, partial: true },
]

// Week starts and projections are UTC midnights. Pin the default zone west of
// UTC, where a local-time format reads them as the previous day, so a dropped
// timeZone: 'UTC' fails here wherever the suite runs. Jest hands each test file
// a copy of process.env, so assigning TZ there never reaches the runtime; the
// zone is pinned on Intl.DateTimeFormat, which formatShortDate reads.
const LocalFormat = Intl.DateTimeFormat
beforeAll(() => {
  jest.spyOn(Intl, 'DateTimeFormat').mockImplementation((locales, options) =>
    new LocalFormat(locales, { timeZone: 'America/Los_Angeles', ...options }))
})
afterAll(() => { jest.restoreAllMocks() })

test('the pinned zone is west of UTC, so UTC midnights fall on the previous local day', () => {
  expect(new Intl.DateTimeFormat('en-US', { month: 'short', day: 'numeric' }).format(nov12)).toBe('Nov 11')
})

test('formats rounded percentages and UTC US dates, including epoch zero', () => {
  expect(percentText(0.656)).toBe('66%')
  expect(percentText(0)).toBe('0%')
  expect(percentText(1)).toBe('100%')
  expect(formatShortDate(nov12)).toBe('Nov 12')
  expect(formatShortDate(Date.UTC(2026, 0, 1, 0, 30))).toBe('Jan 1')
  expect(formatShortDate(Date.UTC(2026, 0, 1, 23, 30))).toBe('Jan 1')
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
  expect(chart.projection).toMatchObject({ at: nov12, x: 272, y: expect.closeTo(28.9), dateLabel: 'Nov 12' })
  expect(chart.benchmarkY).toBeCloseTo(28.9)
  expect(chart.description).toBe('Line chart of weekly role mastery: 29% in the week of Oct 19 (5 sessions), 48% in the week of Oct 26 (6 sessions), 66% in the week of Nov 2 (2 sessions so far). Projected to reach the 85% benchmark on Nov 12.')
  expect(weeks[0].start).toBe(oct19)
})

test('at the artboard font scale the labels sit where Profile.dc.html puts them', () => {
  const chart = trendGeometry(weeks, 0.85, nov12, 294)
  expect(chart.type).toMatchObject({ font: 12, label: 13, dateY: 164, sessionsY: 182, height: 188 })
  expect(chart.left).toBe(64)
  expect(chart.points.map(({ date }) => date.x)).toEqual([80, 136, 192])
  expect(chart.points.map(({ dated, counted, valued }) => [dated, counted, valued])).toEqual([[true, true, true], [true, true, true], [true, true, true]])
  expect(chart.points.map(({ count }) => [count.text, count.suffixX])).toEqual([['5', null], ['6', null], ['2', 200]])
  expect(chart.points.map(({ value }) => value.y)).toEqual([expect.closeTo(93.06), expect.closeTo(67.22), expect.closeTo(42.74)])
  expect(chart.projection?.date.x).toBe(272)
})

test('a projection within days of the last week drops that week\'s date label, keeping its count', () => {
  const lastStart = weeks[2].start
  const chart = trendGeometry(weeks, 0.85, lastStart + 2 * day, 294)
  expect(chart.projection?.dateLabel).toBe('Nov 4')
  expect(chart.points.map(({ dated }) => dated)).toEqual([true, true, false])
  expect(chart.points.map(({ counted }) => counted)).toEqual([true, true, true])
  // A projection a week and a half out clears it.
  expect(trendGeometry(weeks, 0.85, lastStart + 10 * day, 294).points.every(({ dated }) => dated)).toBe(true)
})

test('crowded weeks thin to labels that never overlap, keeping the newest', () => {
  const many = Array.from({ length: 12 }, (_, index) => ({ start: oct19 + index * 7 * day, mastery: 0.3 + index * 0.04, sessions: 10 + index, partial: index === 11 }))
  const chart = trendGeometry(many, 0.85, oct19 + 200 * day, 260)
  const dated = chart.points.filter(({ dated }) => dated)
  expect(dated.length).toBeGreaterThan(1)
  expect(dated.length).toBeLessThan(many.length)
  for (let index = 1; index < dated.length; index++) expect(dated[index].date.left).toBeGreaterThanOrEqual(dated[index - 1].date.right)
  const shown = [...dated.map(({ date }) => date), chart.projection!.date]
  for (let index = 1; index < shown.length; index++) expect(shown[index].left).toBeGreaterThanOrEqual(shown[index - 1].right)
  expect(chart.points.at(-1)?.counted).toBe(true)
  expect([...chart.points.map(({ date }) => date), chart.projection!.date].every(({ left, right }) => left >= 0 && right <= 260)).toBe(true)
})

test('at font scale 2.0 the labels grow to the cap, stay inside the chart and the chart grows to fit them', () => {
  const chart = trendGeometry(weeks, 0.85, nov12, 294, 2)
  expect(chart.type).toMatchObject({ font: 18, label: 20 })
  expect(chart.height).toBeGreaterThan(188)
  expect(chart.type.sessionsY + chart.type.font / 2).toBeLessThanOrEqual(chart.height)
  expect(chart.type.dateY - chart.type.font).toBeGreaterThan(chart.bottom)
  // The left gutter widens by as much as "Sessions" does, so it fits as it does on the artboard.
  expect(chart.left - 64).toBeGreaterThanOrEqual(('Sessions'.length * (20 - 13) * 0.6))
  const labels = [...chart.points.flatMap(({ date, value, count, dated, valued, counted }) => [
    ...(dated ? [date] : []), ...(valued ? [value] : []), ...(counted ? [count] : [])]), chart.projection!.date]
  expect(labels.every(({ left, right }) => left >= 0 && right <= 294)).toBe(true)
  const dates = [...chart.points.filter(({ dated }) => dated).map(({ date }) => date), chart.projection!.date]
  for (let index = 1; index < dates.length; index++) expect(dates[index].left).toBeGreaterThanOrEqual(dates[index - 1].right)
  expect(chart.points.every(({ x }) => x >= chart.left && x <= chart.right)).toBe(true)
})

test('the chart sentence follows the artboard and reads every week\'s sessions', () => {
  expect(trendDescription([{ start: oct19, mastery: 0.29, sessions: 1, partial: true }], 0.85, null))
    .toBe('Line chart of weekly role mastery: 29% in the week of Oct 19 (1 session so far).')
  expect(trendDescription([], 0.85, nov12)).toBe('No weekly mastery recorded yet.')
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
