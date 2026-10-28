import { describe, expect, it } from 'vitest'
import type { ItemPayload } from '@/lib/llm/schemas'
import { gradeAnswer, normalize, toItemView } from './grade'

const base: Omit<ItemPayload, 'format'> = { stem: 's', options: [], accepted_answers: [], model_answer: 'm', explanation: '', difficulty: 3, source_quote: null, grounded: true, bloom: 'remember' }
const cloze: ItemPayload = { ...base, format: 'cloze', accepted_answers: ['Mitochondria', 'cat'] }
const opts = ['a', 'b', 'c', 'd'].map((id) => ({ id, text: `T${id}`, is_correct: id === 'b', feedback: `F${id}` }))
const mcq: ItemPayload = { ...base, format: 'mcq', options: opts }

describe('grade', () => {
  it('normalizes case, accents, punctuation and spaces', () => {
    expect(normalize('  Éléphant,  GRIS! ')).toBe('elephant gris')
  })
  it('allows one typo only for answers of 6+ characters', () => {
    expect(gradeAnswer(cloze, { text: 'mitochondira' }).correct).toBe(false) // transposition = 2 edits
    expect(gradeAnswer(cloze, { text: 'Mitochondri' }).correct).toBe(true)
    expect(gradeAnswer(cloze, { text: 'cut' }).correct).toBe(false)
  })
  it('returns feedback for the chosen wrong option', () => {
    expect(gradeAnswer(mcq, { optionId: 'c' })).toEqual({ correct: false, correctAnswer: 'Tb', chosenFeedback: 'Fc' })
    expect(gradeAnswer(mcq, { optionId: 'b' }).correct).toBe(true)
  })
  it('shuffles options by seed and hides answers', () => {
    const item = { id: 'i', conceptId: 'c', conceptName: 'C', format: 'mcq' as const, difficultyPrior: 3, payload: mcq }
    const view = toItemView(item, 'seed')
    expect(view.options).toEqual(toItemView(item, 'seed').options)
    expect(view.options.map((o) => o.id).sort()).toEqual(['a', 'b', 'c', 'd'])
    expect(JSON.stringify(view)).not.toContain('is_correct')
  })
})

it('cloze accepts a partial phrase that covers most of the key', () => {
  const payload: ItemPayload = { ...base, format: 'cloze', accepted_answers: ['within adult reach', 'out of reach of children'], model_answer: 'within adult reach' }
  expect(gradeAnswer(payload, { text: 'within reach' }).correct).toBe(true)
  expect(gradeAnswer(payload, { text: 'reach' }).correct).toBe(false)
  expect(gradeAnswer(payload, { text: 'within reach' }).correctAnswer).toBe('within adult reach')
})
