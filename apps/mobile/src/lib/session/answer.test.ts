import type { Answer, Draft, ItemFormat, ItemView } from '@learnquiz/api'
import { ApiError } from '../api'
import { answerBody, answerError } from './answer'

jest.mock('../auth', () => ({ getToken: jest.fn(), handleUnauthorized: jest.fn() }))

const item: ItemView = {
  id: 'item-a', conceptId: 'concept-a', conceptName: 'Concept', format: 'mcq', stem: 'Question?',
  options: [{ id: 'a', text: 'A' }, { id: 'b', text: 'B' }], blank: null, image: null, difficulty: 1,
}
const draft: Draft = {
  answer: { optionId: 'a', optionIds: ['a', 'b'], order: ['b', 'a'], text: 'My answer' },
  confidence: 'sure',
}

test.each<[ItemFormat, Answer]>([
  ['mcq', { optionId: 'a' }],
  ['multi', { optionIds: ['a', 'b'] }],
  ['cloze', { text: 'My answer' }],
  ['short', { text: 'My answer' }],
  ['order', { order: ['b', 'a'] }],
])('sends only the %s answer and keeps request metadata', (format, answer) => {
  expect(answerBody({ ...item, format }, draft, 1234)).toEqual({
    itemId: 'item-a', answer, confidence: 'sure', responseMs: 1234,
  })
})

test('preserves a typed text answer exactly', () => {
  expect(answerBody({ ...item, format: 'short' }, {
    answer: { text: '  Keep my wording.\n' }, confidence: 'guess',
  }, 0)).toEqual({
    itemId: 'item-a', answer: { text: '  Keep my wording.\n' }, confidence: 'guess', responseMs: 0,
  })
})

test.each<ItemFormat>(['multi', 'order'])('keeps %s request stable if the draft changes', (format) => {
  const changing: Draft = { answer: { optionIds: ['a'], order: ['b', 'a'] }, confidence: 'unsure' }
  const body = answerBody({ ...item, format }, changing, 20)
  changing.answer.optionIds!.push('b')
  changing.answer.order!.reverse()
  expect(body.answer).toEqual(format === 'multi' ? { optionIds: ['a'] } : { order: ['b', 'a'] })
})

test('a conflict requests a session resync', () => {
  expect(answerError(new ApiError(409, 'The session has moved on'))).toBe('resync')
})

test.each([
  new ApiError(null, 'Network request failed'),
  new ApiError(null, 'Request timed out after 130000 ms'),
  new ApiError(500, 'Server failed'),
  new ApiError(503, 'Service unavailable'),
  new ApiError(400, 'Invalid answer'),
  new Error('Unexpected failure'),
  null,
  { status: 409 },
])('shows the error row for any non-API-conflict failure: %p', (error) => {
  expect(answerError(error)).toBe('error')
})
