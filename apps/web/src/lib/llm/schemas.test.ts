import { expect, it } from 'vitest'
import { ItemPayload } from './schemas'

it('accepts cloze drafts only when the stem contains exactly one blank', () => {
  const draft = {
    format: 'cloze',
    options: [],
    accepted_answers: ['Paris'],
    model_answer: 'Paris',
    explanation: 'Paris is the capital of France.',
    difficulty: 1,
    source_quote: null,
    grounded: false,
    bloom: 'remember',
  }
  const stems = ['The capital of France is ____.', 'The capital of France is Paris.', '____ is the capital of ____.']

  expect(stems.map((stem) => ItemPayload.safeParse({ ...draft, stem }).success)).toEqual([true, false, false])
})
