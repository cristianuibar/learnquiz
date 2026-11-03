import type { Answer, ItemView, Reveal } from '@learnquiz/api'
import { MAX_MIX_UPS, mixUpLines, orderLists, wrongReveal, yourAnswerLabel } from './wrong-reveal'

const ANSWER_TEXT = 'Photograph the damage and note it on the delivery receipt'
const WRONG_TEXT = 'Move it straight to Quarantine bay Q1'

function reveal(overrides: Partial<Reveal> = {}): Reveal {
  return {
    diagramConceptId: null,
    attemptId: 'attempt-1',
    state: 'C',
    correct: false,
    xp: 0,
    critical: false,
    correctOptionIds: null,
    detail: null,
    score: 0,
    feedback: null,
    missingPoints: [],
    correctAnswer: ANSWER_TEXT,
    chosenFeedback: null,
    explanation: 'The receipt is your only proof.',
    sourceQuote: 'Note any damage on the receipt before signing.',
    sourceTitle: 'Receiving guide',
    sourceVersion: 1,
    mixUps: [],
    returnsThisSession: true,
    pKnownBefore: 0.3,
    pKnownAfter: 0.2,
    ...overrides,
  }
}

function item(overrides: Partial<ItemView> = {}): ItemView {
  return {
    id: 'item-1',
    conceptId: 'concept-1',
    conceptName: 'Damaged goods',
    format: 'mcq',
    stem: 'A pallet arrives with crushed boxes. What do you do first?',
    options: [
      { id: 'a', text: ANSWER_TEXT },
      { id: 'b', text: WRONG_TEXT },
    ],
    blank: null,
    image: null,
    difficulty: 0.5,
    ...overrides,
  }
}

const correctPair = { tone: 'correct', label: 'The answer', kind: 'text', value: ANSWER_TEXT }

describe('yourAnswerLabel', () => {
  test.each([
    ['mcq', 'You chose'],
    ['multi', 'You chose'],
    ['cloze', 'You wrote'],
    ['short', 'Your answer'],
    ['order', 'Your order'],
  ] as const)('%s reads "%s"', (format, label) => {
    expect(yourAnswerLabel(format)).toBe(label)
  })
})

describe('mcq not quite', () => {
  test('pairs the answer with the option the learner chose and shows the note', () => {
    const result = wrongReveal(
      reveal({ chosenFeedback: '  Quarantine comes after the receipt is marked.  ', critical: true }),
      item(),
      { optionId: 'b' },
      'notQuite',
    )
    expect(result.pairs).toEqual([
      correctPair,
      { tone: 'wrong', label: 'You chose', kind: 'text', value: WRONG_TEXT },
    ])
    expect(result.note).toBe('Quarantine comes after the receipt is marked.')
    expect(result.whyItFeltRight).toBeNull()
    expect(result.whatActuallyMatters).toBeNull()
    expect(result.critical).toBe(false)
  })

  test('an unknown option id leaves only the answer pair', () => {
    const result = wrongReveal(reveal(), item(), { optionId: 'zzz' }, 'notQuite')
    expect(result.pairs).toEqual([correctPair])
  })

  test('blank chosen feedback falls back to the explanation', () => {
    const result = wrongReveal(reveal({ chosenFeedback: '  ' }), item(), { optionId: 'b' }, 'notQuite')
    expect(result.note).toBe('The receipt is your only proof.')
  })

  test('no chosen feedback and a blank explanation give no note', () => {
    const result = wrongReveal(reveal({ explanation: ' ' }), item(), { optionId: 'b' }, 'notQuite')
    expect(result.note).toBeNull()
  })
})

describe('other formats', () => {
  test('cloze shows the trimmed text the learner wrote', () => {
    const result = wrongReveal(reveal(), item({ format: 'cloze', options: [] }), { text: '  receipt  ' }, 'notQuite')
    expect(result.pairs).toEqual([
      correctPair,
      { tone: 'wrong', label: 'You wrote', kind: 'text', value: 'receipt' },
    ])
  })

  test('a blank cloze answer leaves only the answer pair', () => {
    const result = wrongReveal(reveal(), item({ format: 'cloze', options: [] }), { text: '   ' }, 'notQuite')
    expect(result.pairs).toEqual([correctPair])
  })

  test('multi joins the chosen option texts and drops unknown ids', () => {
    const result = wrongReveal(reveal(), item({ format: 'multi' }), { optionIds: ['a', 'nope', 'b'] }, 'notQuite')
    expect(result.pairs[1]).toEqual({ tone: 'wrong', label: 'You chose', kind: 'text', value: `${ANSWER_TEXT}, ${WRONG_TEXT}` })
  })
})

describe('short answers', () => {
  const shortItem = () => item({ format: 'short', options: [] })

  test('puts the learner first and carries feedback and trimmed missing points', () => {
    const result = wrongReveal(
      reveal({ feedback: 'You missed the receipt step.', missingPoints: [' note on receipt ', '', '  ', 'photograph'] }),
      shortItem(),
      { text: 'Call the supplier' },
      'notQuite',
    )
    expect(result.pairs).toEqual([
      { tone: 'wrong', label: 'Your answer', kind: 'text', value: 'Call the supplier' },
      correctPair,
    ])
    expect(result.feedback).toBe('You missed the receipt step.')
    expect(result.missingPoints).toEqual(['note on receipt', 'photograph'])
  })

  test('mcq ignores feedback and missing points on the reveal', () => {
    const result = wrongReveal(
      reveal({ feedback: 'Grader says no.', missingPoints: ['a point'] }),
      item(),
      { optionId: 'b' },
      'notQuite',
    )
    expect(result.feedback).toBeNull()
    expect(result.missingPoints).toEqual([])
  })
})

describe('sure and wrong', () => {
  const sure = (overrides: Partial<Reveal> = {}) =>
    wrongReveal(reveal({ state: 'D', ...overrides }), item(), { optionId: 'b' }, 'sureWrong')

  test('has no note, explains what matters and mirrors critical', () => {
    const result = sure({ critical: true, chosenFeedback: 'Not yet.' })
    expect(result.note).toBeNull()
    expect(result.whatActuallyMatters).toBe('The receipt is your only proof.')
    expect(result.critical).toBe(true)
    expect(sure({ critical: false }).critical).toBe(false)
  })

  test('shows only the first two trimmed non-empty mix-ups under a heading', () => {
    const result = sure({ mixUps: ['  First mistake ', '', 'Second mistake', 'Third mistake'] })
    expect(result.whyItFeltRight).toEqual({ heading: 'Why it felt right', lines: ['First mistake', 'Second mistake'] })
  })

  test('mixUpLines caps at MAX_MIX_UPS', () => {
    expect(MAX_MIX_UPS).toBe(2)
    expect(mixUpLines(['a', 'b', 'c', 'd'])).toEqual(['a', 'b'])
  })

  test('falls back to the chosen feedback without a heading', () => {
    const result = sure({ mixUps: [], chosenFeedback: ' It looks safe. ' })
    expect(result.whyItFeltRight).toEqual({ heading: null, lines: ['It looks safe.'] })
  })

  test('has nothing to say about why it felt right without mix-ups or feedback', () => {
    expect(sure({ mixUps: [], chosenFeedback: null }).whyItFeltRight).toBeNull()
  })
})

test.each([true, false])('returnsThisSession %s passes through', (value) => {
  const result = wrongReveal(reveal({ returnsThisSession: value }), item(), { optionId: 'b' }, 'notQuite')
  expect(result.returnsThisSession).toBe(value)
})

describe('order items', () => {
  const orderItem = () =>
    item({
      format: 'order',
      options: [
        { id: 's1', text: 'Photograph' },
        { id: 's2', text: 'Note on receipt' },
        { id: 's3', text: 'Quarantine' },
      ],
    })

  test('with step detail lists the right order and the learner order by position', () => {
    const result = wrongReveal(
      reveal({
        detail: {
          kind: 'order',
          rightPositions: 1,
          steps: [
            { id: 's1', text: 'Photograph', note: '', yourPosition: 3 },
            { id: 's2', text: 'Note on receipt', note: '', yourPosition: 1 },
            { id: 's3', text: 'Quarantine', note: '', yourPosition: 0 },
          ],
        },
      }),
      orderItem(),
      { order: ['s2', 's1'] },
      'notQuite',
    )
    expect(result.pairs).toEqual([
      { tone: 'correct', label: 'The order', kind: 'list', items: ['Photograph', 'Note on receipt', 'Quarantine'] },
      { tone: 'wrong', label: 'Your order', kind: 'list', items: ['Note on receipt', 'Photograph'] },
    ])
  })

  test('without detail maps the submitted order through the options and keeps the text answer', () => {
    const result = wrongReveal(reveal(), orderItem(), { order: ['s3', 'gone', 's1'] }, 'notQuite')
    expect(result.pairs).toEqual([
      correctPair,
      { tone: 'wrong', label: 'Your order', kind: 'list', items: ['Quarantine', 'Photograph'] },
    ])
  })

  test('orderLists has no right order without detail', () => {
    expect(orderLists(reveal(), orderItem(), { order: ['s3', 'gone', 's1'] })).toEqual({
      theOrder: null,
      yourOrder: ['Quarantine', 'Photograph'],
    })
  })

  test('without detail or a submitted order shows only the answer', () => {
    const answer: Answer = {}
    const result = wrongReveal(reveal(), orderItem(), answer, 'notQuite')
    expect(result.pairs).toEqual([correctPair])
  })
})
