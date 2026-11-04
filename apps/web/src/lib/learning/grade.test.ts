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

it('cloze rejects a partial phrase that covers most of the key', () => {
  const payload: ItemPayload = { ...base, format: 'cloze', accepted_answers: ['within adult reach', 'out of reach of children'], model_answer: 'within adult reach' }
  expect(gradeAnswer(payload, { text: 'within reach' }).correct).toBe(false)
  expect(gradeAnswer(payload, { text: 'reach' }).correct).toBe(false)
  expect(gradeAnswer(payload, { text: 'within reach' }).correctAnswer).toBe('within adult reach')
})

it('cloze rejects duplicated tokens in place of the accepted phrase', () => {
  const payload: ItemPayload = { ...base, format: 'cloze', accepted_answers: ['within adult reach'] }
  expect(gradeAnswer(payload, { text: 'reach reach' }).correct).toBe(false)
})

it('cloze rejects an answer that drops negation', () => {
  const payload: ItemPayload = { ...base, format: 'cloze', accepted_answers: ['does not dissolve'] }
  expect(gradeAnswer(payload, { text: 'does dissolve' }).correct).toBe(false)
})

it.each<[ItemPayload['format'], string[], { numeric: boolean } | null]>([
  ['cloze', ['7'], { numeric: true }],
  ['cloze', ['0', '999'], { numeric: true }],
  ['cloze', ['seven'], { numeric: false }],
  ['cloze', ['7', 'seven'], { numeric: false }],
  ['cloze', ['1000'], { numeric: false }],
  ['cloze', ['-7'], { numeric: false }],
  ['cloze', ['7.5'], { numeric: false }],
  ['cloze', [' 7 '], { numeric: false }],
  ['mcq', ['7'], null],
  ['short', ['7'], null],
])('serves %s with accepted answers %j and blank %j', (format, accepted_answers, blank) => {
  const view = toItemView({ id: 'i', conceptId: 'c', conceptName: 'C', format, difficultyPrior: 3, payload: { ...base, format, accepted_answers } }, 'seed')
  expect(view.blank).toEqual(blank)
  expect(view.image).toBeNull()
})

const choices = (n: number, right: string[]) => 'abcde'.slice(0, n).split('').map((id) => ({ id, text: `T${id}`, is_correct: right.includes(id), feedback: `F${id}` }))
const multi: ItemPayload = { ...base, format: 'multi', options: choices(4, ['a', 'c']) }

it.each<[string, string[], boolean, number, number, number]>([
  ['exact', ['a', 'c'], true, 1, 2, 0],
  ['exact with duplicates and unknown ids', ['c', 'c', 'a', 'z'], true, 1, 2, 0],
  ['partial', ['a'], false, 0.5, 1, 0],
  ['extra', ['a', 'b', 'c'], false, 0.5, 2, 1],
  ['only wrong', ['b', 'd'], false, 0, 0, 2],
  ['none', [], false, 0, 0, 0],
])('grades multi: %s', (_, optionIds, correct, score, found, extra) => {
  const graded = gradeAnswer(multi, { optionIds })
  expect(graded).toMatchObject({ correct, score, correctAnswer: 'Ta / Tc', chosenFeedback: null })
  expect(graded).toMatchObject({ detail: { kind: 'multi', found, total: 2, extra } })
})

it('reveals every multi option with its note', () => {
  expect(gradeAnswer(multi, { optionIds: ['a', 'b'] })).toEqual({
    correct: false,
    correctAnswer: 'Ta / Tc',
    chosenFeedback: null,
    score: 0,
    detail: {
      kind: 'multi',
      found: 1,
      total: 2,
      extra: 1,
      options: [
        { id: 'a', text: 'Ta', correct: true, chosen: true, note: 'Fa' },
        { id: 'b', text: 'Tb', correct: false, chosen: true, note: 'Fb' },
        { id: 'c', text: 'Tc', correct: true, chosen: false, note: 'Fc' },
        { id: 'd', text: 'Td', correct: false, chosen: false, note: 'Fd' },
      ],
    },
  })
})

const order: ItemPayload = { ...base, format: 'order', options: choices(4, ['a', 'b', 'c', 'd']) }

it.each<[string, string[], boolean, number, number[]]>([
  ['exact', ['a', 'b', 'c', 'd'], true, 4, [1, 2, 3, 4]],
  ['adjacent swap', ['a', 'c', 'b', 'd'], false, 2, [1, 3, 2, 4]],
  ['reversed', ['d', 'c', 'b', 'a'], false, 0, [4, 3, 2, 1]],
])('grades order: %s', (_, answerOrder, correct, rightPositions, positions) => {
  const graded = gradeAnswer(order, { order: answerOrder })
  expect(graded).toMatchObject({ correct, score: rightPositions / 4, correctAnswer: 'Ta → Tb → Tc → Td', chosenFeedback: null })
  expect(graded).toMatchObject({ detail: { kind: 'order', rightPositions } })
  expect(graded).toMatchObject({
    detail: { steps: ['a', 'b', 'c', 'd'].map((id, i) => ({ id, text: `T${id}`, note: `F${id}`, yourPosition: positions[i] })) },
  })
})

it.each<[string, string, boolean]>([
  ['007', '7', true],
  ['7', '007', true],
  ['7 kg', '7', false],
  ['123457', '123456', false],
  ['0.07', '7', false],
  ['7', '0.07', false],
  ['0.07', '0.07', true],
  ['100.08', '100.07', false],
  ['9007199254740992', '9007199254740993', false],
])('cloze compares digit-only answers as numbers: %j vs accepted %j', (text, accepted, correct) => {
  expect(gradeAnswer({ ...base, format: 'cloze', accepted_answers: [accepted] }, { text }).correct).toBe(correct)
})

it('never serves an order item in the stored order, deterministically per seed', () => {
  const item = { id: 'i', conceptId: 'c', conceptName: 'C', format: 'order' as const, difficultyPrior: 3, payload: order }
  for (let n = 0; n < 200; n++) {
    const ids = toItemView(item, `seed${n}`).options.map((o) => o.id)
    expect(ids).not.toEqual(['a', 'b', 'c', 'd'])
    expect(ids).toEqual(toItemView(item, `seed${n}`).options.map((o) => o.id))
  }
})

it.each([
  [{ key: 'secret/key.png', alt: 'A graph', width: 640, height: 480 }, { src: '/media/items/i', alt: 'A graph', width: 640, height: 480 }],
  [undefined, null],
])('serves the image %j as %j without its key', (image, expected) => {
  const view = toItemView({ id: 'i', conceptId: 'c', conceptName: 'C', format: 'mcq', difficultyPrior: 3, payload: { ...mcq, image } }, 'seed')
  expect(view.image).toEqual(expected)
  expect(JSON.stringify(view)).not.toContain('secret/key')
})
