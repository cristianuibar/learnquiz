import { clozeAnswer, clozeMaxLength, splitClozeStem } from './cloze'

test('splits words around the first marker', () => {
  expect(splitClozeStem('The quick ____ jumps high')).toEqual({
    before: ['The', 'quick'],
    prefix: '', suffix: '',
    after: ['jumps', 'high'],
  })
})

test('marker at the start leaves before empty', () => {
  expect(splitClozeStem('____ jumps high')).toEqual({ before: [], prefix: '', suffix: '', after: ['jumps', 'high'] })
})

test('marker at the end leaves after empty', () => {
  expect(splitClozeStem('The quick ____')).toEqual({ before: ['The', 'quick'], prefix: '', suffix: '', after: [] })
})

test('missing marker keeps every word before the blank', () => {
  expect(splitClozeStem('No blank here')).toEqual({ before: ['No', 'blank', 'here'], prefix: '', suffix: '', after: [] })
})

test('only the first marker splits; later markers stay literal', () => {
  expect(splitClozeStem('a ____ b ____ c')).toEqual({ before: ['a'], prefix: '', suffix: '', after: ['b', '____', 'c'] })
})

test('extra whitespace is ignored but punctuation is preserved', () => {
  expect(splitClozeStem('  Hello,   world  ____  again!  ')).toEqual({
    before: ['Hello,', 'world'],
    prefix: '', suffix: '',
    after: ['again!'],
  })
})

test.each([
  ['The pallet limit is ____.', '.', []],
  ['Lift ____, then rest', ',', ['then', 'rest']],
  ['Lift ____... then rest', '...', ['then', 'rest']],
])('keeps punctuation beside the blank in %s', (stem, suffix, after) => {
  expect(splitClozeStem(stem)).toMatchObject({ suffix, after })
})

test('max length is 3 for numbers and 40 for words', () => {
  expect(clozeMaxLength(true)).toBe(3)
  expect(clozeMaxLength(false)).toBe(40)
})

test('numeric input strips pasted text then limits to 3 digits', () => {
  expect(clozeAnswer('a1b2c3d4', true)).toEqual({ text: '123' })
})

test('numeric input keeps digits found after invalid characters', () => {
  expect(clozeAnswer('ab12cd34', true)).toEqual({ text: '123' })
})

test('numeric input strips unicode digits and keeps ascii order', () => {
  expect(clozeAnswer('١٢345', true)).toEqual({ text: '345' })
})

test('word input keeps punctuation, case and spacing up to 40 chars', () => {
  expect(clozeAnswer('  Hello, World!  ', false)).toEqual({ text: '  Hello, World!  ' })
  expect(clozeAnswer('a'.repeat(50), false)).toEqual({ text: 'a'.repeat(40) })
})

test('answer is always a text object, including empty and zero values', () => {
  expect(clozeAnswer('', true)).toEqual({ text: '' })
  expect(clozeAnswer('', false)).toEqual({ text: '' })
  expect(clozeAnswer('0', true)).toEqual({ text: '0' })
  expect(clozeAnswer('007', true)).toEqual({ text: '007' })
})


test.each([
  ['costs $____.', ['costs'], '$', '.', []],
  ['(____) items', [], '(', ')', ['items']],
  ['the "____" sign', ['the'], '"', '"', ['sign']],
  ['a ____kg load', ['a'], '', 'kg', ['load']],
  ["the ____'s door", ['the'], '', "'s", ['door']],
  ['a pre____post word', ['a'], 'pre', 'post', ['word']],
])('keeps all attached characters beside the field in %s', (stem, before, prefix, suffix, after) => {
  expect(splitClozeStem(stem as string)).toEqual({ before, prefix, suffix, after })
})
