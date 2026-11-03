import { isAnswerReady } from '@learnquiz/api'
import { multiRows, toggleOption } from './multi'

const options = [
  { id: 'a', text: 'Alpha' },
  { id: 'b', text: 'Beta' },
  { id: 'c', text: 'Gamma' },
]

describe('toggleOption', () => {
  test('toggles on from empty and from undefined', () => {
    expect(toggleOption(options, [], 'b')).toEqual(['b'])
    expect(toggleOption(options, undefined, 'a')).toEqual(['a'])
  })

  test('toggles an already selected option off', () => {
    expect(toggleOption(options, ['a', 'b'], 'a')).toEqual(['b'])
  })

  test('keeps option order regardless of tap order', () => {
    const afterC = toggleOption(options, undefined, 'c')
    expect(toggleOption(options, afterC, 'a')).toEqual(['a', 'c'])
  })

  test('does not mutate the input array', () => {
    const selected = ['c']
    const result = toggleOption(options, selected, 'a')
    expect(selected).toEqual(['c'])
    expect(result).not.toBe(selected)
  })

  test('ignores ids that are not options', () => {
    expect(toggleOption(options, ['b'], 'zzz')).toEqual(['b'])
    expect(toggleOption(options, undefined, 'zzz')).toEqual([])
  })

  test('an answer is ready only while at least one option is selected', () => {
    const on = toggleOption(options, undefined, 'b')
    expect(isAnswerReady('multi', { optionIds: on }, options.length)).toBe(true)
    const off = toggleOption(options, on, 'b')
    expect(isAnswerReady('multi', { optionIds: off }, options.length)).toBe(false)
  })
})

describe('multiRows', () => {
  test('reflects the selection and stays enabled before reveal', () => {
    const rows = multiRows(options, ['a', 'c'], null, false)
    expect(rows.map((row) => row.selected)).toEqual([true, false, true])
    expect(rows.every((row) => row.mark === null && !row.disabled)).toBe(true)
    expect(rows.map((row) => row.text)).toEqual(['Alpha', 'Beta', 'Gamma'])
  })

  test('treats a missing selection as nothing selected', () => {
    expect(multiRows(options, undefined, null, false).some((row) => row.selected)).toBe(false)
  })

  test('with marks set, disables every row and keeps chosen rows selected with their mark', () => {
    const rows = multiRows(options, ['a', 'b'], { a: 'correct', b: 'wrong', c: 'correct' }, false)
    expect(rows.every((row) => row.disabled)).toBe(true)
    expect(rows[0]).toMatchObject({ selected: true, mark: 'correct' })
    expect(rows[1]).toMatchObject({ selected: true, mark: 'wrong' })
    expect(rows[2]).toMatchObject({ selected: false, mark: 'correct' })
  })

  test('an option without a mark gets null', () => {
    const rows = multiRows(options, ['a'], { a: 'correct' }, false)
    expect(rows[1].mark).toBeNull()
    expect(rows[1].disabled).toBe(true)
  })

  test('propagates disabled without marks', () => {
    expect(multiRows(options, ['a'], null, true).every((row) => row.disabled)).toBe(true)
  })
})
