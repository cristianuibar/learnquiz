import { expect, it } from 'vitest'
import { z } from 'zod'
import { ItemBatch, ItemPayload } from './schemas'

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

const item = { stem: 'Pick', accepted_answers: [], model_answer: 'm', explanation: 'e', difficulty: 2, source_quote: null, grounded: false, bloom: 'remember' }
const options = (correct: boolean[]) => correct.map((is_correct, i) => ({ id: 'abcdef'[i], text: `T${i}`, is_correct, feedback: `F${i}` }))

it.each([
  ['multi', [true, true, false, false], true],
  ['multi', [true, false, false, false], false],
  ['multi', [true, true, true, true], false],
  ['multi', [true, true, false], false],
  ['order', [true, true, true], true],
  ['order', [true, true], false],
  ['order', [true, true, true, true, true, true], false],
  ['order', [true, false, true], false],
])('%s with options %j parses: %s', (format, correct, ok) => {
  expect(ItemPayload.safeParse({ ...item, format, options: options(correct) }).success).toBe(ok)
})

it('rejects a multi option without feedback and an order with steps out of id order', () => {
  const multi = options([true, true, false, false])
  multi[2].feedback = ' '
  expect(ItemPayload.safeParse({ ...item, format: 'multi', options: multi }).success).toBe(false)
  expect(ItemPayload.safeParse({ ...item, format: 'order', options: options([true, true, true]).reverse() }).success).toBe(false)
})

it('accepts an image only with alt text', () => {
  const mcq = { ...item, format: 'mcq', options: options([true, false, false]) }
  const image = { key: 'items/x.png', alt: 'A torque wrench', width: 640, height: 480 }
  expect(ItemPayload.safeParse({ ...mcq, image }).success).toBe(true)
  expect(ItemPayload.safeParse({ ...mcq, image: { ...image, alt: '' } }).success).toBe(false)
})

it('keeps the model-facing item batch schema strict and free of image', () => {
  const { items } = z.toJSONSchema(ItemBatch).properties as { items: { items: { properties: object; required: string[] } } }
  expect(Object.keys(items.items.properties).sort()).toEqual([...items.items.required].sort())
  expect(items.items.properties).not.toHaveProperty('image')
})
