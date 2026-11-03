import { barValueText, clock, deltaText, gainWidths, percent, scoreLine, streakLabel } from './summary-format'

describe('clock', () => {
  test.each([
    [292_000, '4:52'],
    [59_999, '0:59'],
    [0, '0:00'],
    [3_725_000, '62:05'],
    [-5000, '0:00'],
    [NaN, '0:00'],
  ])('%p -> %p', (ms, expected) => {
    expect(clock(ms)).toBe(expected)
  })
})

describe('percent', () => {
  test('rounds and clamps', () => {
    expect(percent(0.723)).toBe(72)
    expect(percent(1.4)).toBe(100)
    expect(percent(-0.2)).toBe(0)
    expect(percent(NaN)).toBe(0)
  })
})

describe('deltaText', () => {
  test('up, down and no change', () => {
    expect(deltaText(0.58, 0.723)).toBe('72%, up from 58%')
    expect(deltaText(0.58, 0.52)).toBe('52%, down from 58%')
    expect(deltaText(0.58, 0.58)).toBe('58%, no change')
  })

  test('compares rounded percents', () => {
    expect(deltaText(0.581, 0.584)).toBe('58%, no change')
  })
})

describe('barValueText', () => {
  test('with benchmark', () => {
    expect(barValueText(0.58, 0.72, 0.85)).toBe('72%, up from 58%. Benchmark 85%')
  })
  test('without benchmark', () => {
    expect(barValueText(0.58, 0.72, null)).toBe('72%, up from 58%')
  })
})

describe('gainWidths', () => {
  test('rise', () => {
    expect(gainWidths(0.58, 0.72)).toEqual({ before: 58, gain: 14 })
  })
  test('fall', () => {
    expect(gainWidths(0.58, 0.52)).toEqual({ before: 52, gain: 0 })
  })
  test('clamps', () => {
    expect(gainWidths(-1, 2)).toEqual({ before: 0, gain: 100 })
  })
})

describe('streakLabel', () => {
  test('values', () => {
    expect(streakLabel(0)).toBeNull()
    expect(streakLabel(-2)).toBeNull()
    expect(streakLabel(1)).toBe('1 day in a row')
    expect(streakLabel(5)).toBe('5 days in a row')
  })
})

describe('scoreLine', () => {
  test('without ungraded', () => {
    expect(scoreLine({ correct: 16, total: 20, durationMs: 292_000, ungraded: 0 })).toBe('16 of 20 correct · 4:52')
  })
  test('with ungraded', () => {
    expect(scoreLine({ correct: 16, total: 20, durationMs: 292_000, ungraded: 2 })).toBe(
      '16 of 20 correct · 4:52 · 2 not graded',
    )
  })
})
