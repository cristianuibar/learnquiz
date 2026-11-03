import { describe, expect, it } from 'vitest'
import type { Reveal, RevealDetail } from './learning.ts'
import { optionMarks, revealModel } from './reveal.ts'

function result(overrides: Partial<Reveal> = {}): Reveal {
  return {
    diagramConceptId: null,
    attemptId: 'attempt',
    state: 'A',
    correct: true,
    xp: 10,
    critical: false,
    correctOptionIds: ['record'],
    detail: null,
    score: 1,
    feedback: null,
    missingPoints: [],
    correctAnswer: 'Record the damage',
    chosenFeedback: null,
    explanation: 'Record before moving.',
    sourceQuote: 'Photograph the damage before moving anything.',
    sourceTitle: 'Receiving SOP',
    sourceVersion: 3,
    mixUps: [],
    returnsThisSession: false,
    pKnownBefore: 0.2,
    pKnownAfter: 0.5,
    ...overrides,
  }
}

const multi: Extract<RevealDetail, { kind: 'multi' }> = {
  kind: 'multi',
  found: 1,
  total: 2,
  extra: 1,
  options: [
    { id: 'hazmat', text: 'Hazmat-labeled cartons', correct: true, chosen: true, note: 'Needs sign-off.' },
    { id: 'seal', text: 'Broken seal', correct: true, chosen: false, note: 'needs sign-off.' },
    { id: 'heavy', text: 'Heavy cartons', correct: false, chosen: false, note: 'No sign-off needed.' },
    { id: 'mixed', text: 'Mixed-SKU', correct: false, chosen: true, note: 'no sign-off needed.' },
  ],
}

describe('revealModel', () => {
  const cases = [
    { state: 'A', variant: 'correctSure', tone: 'correct', heading: 'Correct', xpText: '+10 XP', announcement: 'Correct, 10 XP' },
    { state: 'B', variant: 'correctUnsure', tone: 'correct', heading: 'Correct', xpText: '+10 XP', announcement: 'Correct, 10 XP' },
    { state: 'C', variant: 'notQuite', tone: 'wrong', heading: 'Not quite', xpText: null, announcement: 'Not quite' },
    { state: 'D', variant: 'sureWrong', tone: 'wrong', heading: 'Not quite', xpText: null, announcement: 'Not quite' },
    { state: 'P', variant: 'partial', tone: 'learning', heading: 'Partly right', xpText: null, announcement: 'Partly right' },
    { state: 'ungraded', variant: 'ungraded', tone: 'neutral', heading: 'Couldn’t grade this answer', xpText: null, announcement: 'Couldn’t grade this answer' },
  ] as const

  it.each(cases.flatMap((row) => [true, false].map((quoted) => ({ ...row, quoted }))))(
    'maps $state with quoted=$quoted to its result and disclosure behavior',
    ({ state, variant, tone, heading, xpText, announcement, quoted }) => {
      const correct = state === 'A' || state === 'B'
      const noSource = correct && !quoted
      const showWhy = state === 'A' && quoted
      expect(revealModel(result({ state, sourceQuote: quoted ? 'Source quote' : null }), { hasCompany: true })).toEqual({
        variant: noSource ? 'noSource' : variant,
        tone,
        heading,
        xpText,
        counts: null,
        announcement,
        continueLabel: state === 'D' ? 'Got it' : 'Continue',
        showWhy,
        openByDefault: !showWhy,
        noQuoteLine: noSource ? 'Not quoted from your SOP' : null,
        partialLines: [],
      })
    },
  )

  it.each(['A', 'B'] as const)('omits XP for %s when none was earned', (state) => {
    const model = revealModel(result({ state, xp: 0 }), { hasCompany: false })
    expect(model.xpText).toBeNull()
    expect(model.announcement).toBe('Correct')
  })

  it.each([-10, 1, 25])('formats %i XP without a signed announcement', (xp) => {
    const model = revealModel(result({ xp }), { hasCompany: false })
    expect(model.xpText).toBe(xp > 0 ? `+${xp} XP` : null)
    expect(model.announcement).toBe(xp > 0 ? `Correct, ${xp} XP` : 'Correct')
  })

  it.each([
    [true, 'Not quoted from your SOP'],
    [false, 'Not quoted from a source'],
  ] as const)('describes a missing source for hasCompany=%s', (hasCompany, expected) => {
    const model = revealModel(result({ sourceQuote: null }), { hasCompany })
    expect(model.noQuoteLine).toBe(expected)
    expect(model.openByDefault).toBe(true)
    expect(model.showWhy).toBe(false)
  })

  it('treats a present quote as sourced even without source metadata', () => {
    expect(revealModel(result({ sourceTitle: null, sourceVersion: null }), { hasCompany: false })).toMatchObject({
      variant: 'correctSure', showWhy: true, noQuoteLine: null,
    })
  })

  it.each([
    [0, 2, 0, '0 of 2 found', 'Partly right, 0 of 2 found'],
    [1, 1, 0, '1 of 1 found', 'Partly right, 1 of 1 found'],
    [1, 2, 1, '1 of 2 found · 1 extra', 'Partly right, 1 of 2 found, 1 extra'],
    [2, 3, 2, '2 of 3 found · 2 extra', 'Partly right, 2 of 3 found, 2 extra'],
  ])('formats partial counts %i/%i with %i extra', (found, total, extra, counts, announcement) => {
    const model = revealModel(result({ state: 'P', detail: { ...multi, found, total, extra } }), { hasCompany: true })
    expect(model.counts).toBe(counts)
    expect(model.announcement).toBe(announcement)
    expect(model.xpText).toBeNull()
  })

  it('pairs missed and extra lines with icons, omitting options that were handled correctly', () => {
    const model = revealModel(result({ state: 'P', detail: multi }), { hasCompany: true })
    expect(model.partialLines).toEqual([
      { id: 'seal', icon: 'check', text: 'Broken seal: needs sign-off. You missed it.' },
      { id: 'mixed', icon: 'x', text: 'Mixed-SKU: no sign-off needed.' },
    ])
  })

  it.each(['', ' \n\t '])('uses readable missed and extra lines for an empty note %j', (note) => {
    const detail = { ...multi, options: multi.options.map((option) => ({ ...option, note })) }
    expect(revealModel(result({ state: 'P', detail }), { hasCompany: false }).partialLines).toEqual([
      { id: 'seal', icon: 'check', text: 'Broken seal. You missed it.' },
      { id: 'mixed', icon: 'x', text: 'Mixed-SKU was not needed.' },
    ])
  })

  it('does not invent multi-select counts or lines for an order detail', () => {
    const detail: RevealDetail = { kind: 'order', rightPositions: 1, steps: [] }
    expect(revealModel(result({ state: 'P', detail }), { hasCompany: false })).toMatchObject({
      counts: null, partialLines: [], announcement: 'Partly right',
    })
  })

  it('keeps multi-select details out of a non-partial reveal', () => {
    expect(revealModel(result({ state: 'D', detail: multi }), { hasCompany: true })).toMatchObject({
      counts: null, partialLines: [], announcement: 'Not quite',
    })
  })
})

describe('optionMarks', () => {
  it('marks the correct mcq option when it was picked', () => {
    expect(optionMarks(result(), ['record'])).toEqual({ record: 'correct' })
  })

  it('marks a missed correct mcq option and the wrong pick', () => {
    expect(optionMarks(result({ state: 'D', correct: false }), ['move'])).toEqual({
      record: 'correct', move: 'wrong',
    })
  })

  it('marks every multi-select option using its grading and chosen detail', () => {
    expect(optionMarks(result({ state: 'P', correctOptionIds: null, detail: multi }), [])).toEqual({
      hazmat: 'correct', seal: 'correct', heavy: 'rest', mixed: 'wrong',
    })
  })

  it('uses picked ids for multi-select and marks correct options before wrong picks', () => {
    const detail = { ...multi, options: multi.options.map((option) => ({ ...option, chosen: false })) }
    expect(optionMarks(result({ state: 'P', correctOptionIds: null, detail }), ['hazmat', 'mixed'])).toEqual({
      hazmat: 'correct', seal: 'correct', heavy: 'rest', mixed: 'wrong',
    })
  })

  it('deduplicates option ids and includes all revealed correct answers', () => {
    expect(optionMarks(result({ correctOptionIds: ['record', 'check', 'record'] }), ['record', 'record'])).toEqual({
      record: 'correct', check: 'correct',
    })
  })

  it('leaves an ungraded pick neutral', () => {
    expect(optionMarks(result({ state: 'ungraded', correctOptionIds: null }), ['record'])).toEqual({ record: 'rest' })
  })

  it('leaves all multi-select options neutral when grading was unavailable', () => {
    expect(optionMarks(result({ state: 'ungraded', detail: multi }), ['mixed'])).toEqual({
      record: 'rest', hazmat: 'rest', seal: 'rest', heavy: 'rest', mixed: 'rest',
    })
  })

  it('returns no marks for a text answer', () => {
    expect(optionMarks(result({ correctOptionIds: null }), [])).toEqual({})
  })
})
