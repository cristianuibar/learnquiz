import { describe, expect, it } from 'vitest'
import { criticalRows, formatShortDate, percentText, programLabel, trendGeometry, unitAriaLabel, type Profile, type WeekPoint } from './progress.ts'

const date = (day: string) => Date.parse(`${day}T00:00:00Z`)
const weeks: WeekPoint[] = [
  { start: date('2026-10-19'), mastery: 0.29, sessions: 5, partial: false },
  { start: date('2026-10-26'), mastery: 0.48, sessions: 6, partial: false },
  { start: date('2026-11-02'), mastery: 0.66, sessions: 2, partial: true },
]

describe('percentText', () => {
  it.each([
    [0.66, false, '66%'], [0.4, true, '~40%'], [0, false, '0%'], [1, false, '100%'], [0.846, false, '85%'],
  ] as const)('formats %s (estimate=%s) as %s', (value, estimate, expected) => {
    expect(percentText(value, estimate)).toBe(expected)
  })
})

describe('unitAriaLabel', () => {
  it.each([
    ['learning', 'Receiving', 0.82, 3, 0, false, 'Unit 1, Receiving: 82%, Still learning, 3 critical concepts'],
    ['learning', 'Picking', 0.68, 0, 1, true, 'Unit 2, Picking, Next up: 68%, Still learning'],
    ['estimate', 'Safety', 0.4, 1, 3, false, 'Unit 4, Safety: about 40%, Placement estimate, not practiced yet, 1 critical concept'],
    ['mastered', 'Receiving', 0.85, 0, 0, false, 'Unit 1, Receiving: 85%, Mastered'],
    ['not_started', 'Returns', 0, 0, 4, false, 'Unit 5, Returns: 0%, Not started'],
    ['locked', 'Returns', 0, 0, 4, false, 'Unit 5, Returns: 0%, Locked'],
  ] as const)('announces %s units', (state, name, mastery, criticalCount, index, isNext, expected) => {
    expect(unitAriaLabel({ state, name, mastery, criticalCount }, index, isNext)).toBe(expected)
  })
})

describe('dates and program labels', () => {
  it('formats dates in UTC across month and year boundaries', () => {
    expect(formatShortDate(date('2026-11-12'))).toBe('Nov 12')
    expect(formatShortDate(Date.parse('2026-10-31T23:30:00-02:00'))).toBe('Nov 1')
    expect(formatShortDate(Date.parse('2026-12-31T23:30:00-02:00'))).toBe('Jan 1')
  })

  it('uses the onboarding schedule when present and the role benchmark otherwise', () => {
    expect(programLabel({ day: 16, days: 30 }, 0.85)).toBe('Day 16 of 30')
    expect(programLabel({ day: 1, days: 14 }, 0.7)).toBe('Day 1 of 14')
    expect(programLabel(null, 0.846)).toBe('Benchmark 85%')
  })
})

describe('criticalRows', () => {
  const error = (id: string, at: number, correctedAt: number | null): Profile['confidentErrors'][number] => ({ id, conceptId: id, concept: id, at, correctedAt })

  it('puts uncorrected errors first, newest within each group, and caps the rows at five', () => {
    const errors = [error('corrected-old', 2, 0), error('open-old', 1, null), error('corrected-new', 7, date('2026-10-30')), error('open-new', 5, null), error('corrected-mid', 6, 1), error('open-mid', 3, null)]
    const before = structuredClone(errors)
    const rows = criticalRows(errors)
    expect(rows.map((row) => row.id)).toEqual(['open-new', 'open-mid', 'open-old', 'corrected-new', 'corrected-mid'])
    expect(rows.slice(0, 3).map((row) => row.chipText)).toEqual(['Comes back first', 'Comes back first', 'Comes back first'])
    expect(rows[3]).toEqual({ ...errors[2], chipText: 'Corrected Oct 30' })
    expect(errors).toEqual(before)
  })

  it('handles no errors and a correction at the Unix epoch', () => {
    expect(criticalRows([])).toEqual([])
    expect(criticalRows([error('corrected', -1, 0)])[0].chipText).toBe('Corrected Jan 1')
  })
})

describe('trendGeometry', () => {
  it('reproduces the design points and projection in a 368 by 160 box', () => {
    const chart = trendGeometry(weeks, 0.85, date('2026-11-12'), 368)
    expect(chart.height).toBe(160)
    expect(chart.points.map((point) => point.x)).toEqual([80, 136, 192])
    chart.points.forEach((point, index) => expect(point.y).toBeCloseTo([105.1, 79.2, 54.7][index], 1))
    expect(chart.projection).toEqual({ at: date('2026-11-12'), x: 272, y: chart.benchmarkY })
    expect(chart.benchmarkY).toBeCloseTo(28.9, 1)
    expect(chart.points.map(({ sessions, partial }) => ({ sessions, partial }))).toEqual([{ sessions: 5, partial: false }, { sessions: 6, partial: false }, { sessions: 2, partial: true }])
    expect(chart.description).toBe('Weekly role mastery: 29% in the week of Oct 19, 48% in the week of Oct 26, 66% in the week of Nov 2; projected to reach the 85% benchmark on Nov 12.')
  })

  it.each([368, 294])('compresses a 40-day span to fit width %s while keeping dates linear', (width) => {
    const end = weeks[0].start + 40 * 86_400_000
    const chart = trendGeometry(weeks, 0.85, end, width)
    expect(chart.projection!.x).toBeCloseTo(width - 22)
    expect((chart.points[1].x - chart.points[0].x) / (chart.projection!.x - chart.points[0].x)).toBeCloseTo(7 / 40)
    expect(chart.points.every((point) => point.x >= chart.left && point.x <= chart.right)).toBe(true)
  })

  it('sorts dates without changing the input and uses elapsed days for irregular intervals', () => {
    const input = [weeks[2], weeks[0], { ...weeks[1], start: weeks[0].start + 3 * 86_400_000 }]
    const before = structuredClone(input)
    expect(trendGeometry(input, 0.85, null, 368).points.map((point) => point.x)).toEqual([80, 104, 192])
    expect(input).toEqual(before)
  })

  it('handles empty and single-point histories without invalid coordinates', () => {
    const empty = trendGeometry([], 0.85, date('2026-11-12'), 368)
    expect(empty.points).toEqual([])
    expect(empty.projection).toBeNull()
    expect(empty.description).toBe('No weekly mastery recorded yet.')
    const single = trendGeometry([weeks[0]], 0.85, null, 368)
    expect(single.points[0].x).toBe(80)
    expect(single.projection).toBeNull()
    expect(single.description).toBe('Weekly role mastery: 29% in the week of Oct 19.')
    expect(trendGeometry([weeks[0]], 0.85, date('2026-11-12'), 368).projection!.x).toBe(272)
  })

  it('does not project backwards or after the benchmark is reached', () => {
    expect(trendGeometry(weeks, 0.85, weeks[0].start, 368).projection).toBeNull()
    expect(trendGeometry(weeks, 0.85, weeks[2].start, 368).projection).toBeNull()
    const chart = trendGeometry([{ ...weeks[0], mastery: 0.85 }], 0.85, date('2026-11-12'), 368)
    expect(chart.projection).toBeNull()
    expect(chart.description).not.toContain('projected')
  })

  it('maps zero and full mastery to the plot bounds', () => {
    const chart = trendGeometry([{ ...weeks[0], mastery: 0 }, { ...weeks[1], mastery: 1 }], 0.5, null, 368)
    expect(chart.points.map((point) => point.y)).toEqual([chart.bottom, chart.top])
    expect(chart.benchmarkY).toBe(76.5)
  })
})
