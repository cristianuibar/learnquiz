import { expect, it } from 'vitest'
import { isAnswerReady } from './learning'
import type { Answer, ItemFormat } from './learning'

it.each<[ItemFormat, Answer, number, boolean]>([
  ['mcq', {}, 2, false],
  ['mcq', { optionId: '' }, 2, false],
  ['mcq', { optionId: 'a' }, 2, true],
  ['multi', {}, 2, false],
  ['multi', { optionIds: [] }, 2, false],
  ['multi', { optionIds: ['a'] }, 2, true],
  ['cloze', {}, 0, false],
  ['cloze', { text: '  ' }, 0, false],
  ['cloze', { text: '7' }, 0, true],
  ['short', {}, 0, false],
  ['short', { text: ' \n\t ' }, 0, false],
  ['short', { text: 'An answer.' }, 0, true],
  ['order', {}, 2, false],
  ['order', { order: [] }, 2, false],
  ['order', { order: ['a'] }, 2, false],
  ['order', { order: ['b', 'a'] }, 2, true],
  ['order', { order: ['a', 'b', 'c'] }, 2, false],
])('%s with %j and %i options is ready=%s', (format, answer, optionCount, ready) => {
  expect(isAnswerReady(format, answer, optionCount)).toBe(ready)
})
