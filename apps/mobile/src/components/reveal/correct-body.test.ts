import { createElement as h } from 'react'
import { fireEvent, render, screen } from '@testing-library/react-native'
import type { ItemView, Reveal } from '@learnquiz/api'
import { revealModel } from '@learnquiz/api/reveal'
import { themes, typography } from '@learnquiz/tokens/native'
import { ThemeProvider } from '../../theme/ThemeProvider'
import { CorrectBody } from './correct-body'

const base: Reveal = {
  diagramConceptId: null, attemptId: 'attempt', state: 'A', correct: true, xp: 10, critical: false, correctOptionIds: null, detail: null,
  score: 1, feedback: null, missingPoints: [], correctAnswer: 'Record the damage', chosenFeedback: null, explanation: 'Record before moving.',
  sourceQuote: 'Photograph the damage before moving anything.', sourceTitle: 'Receiving SOP', sourceVersion: 3, mixUps: [], returnsThisSession: false,
  pKnownBefore: 0.2, pKnownAfter: 0.5,
}
const item: ItemView = { id: 'i', conceptId: 'c', conceptName: 'Receiving', format: 'short', stem: 'What first?', options: [], blank: null, image: null, difficulty: 1 }
const submitted = 'I would photograph the damage.'
const quoteLabel = 'Quote: Photograph the damage before moving anything., Receiving SOP · v3'

function body(overrides: Partial<Reveal> = {}, scheme: 'light' | 'dark' = 'light', hasCompany = false) {
  const reveal = { ...base, ...overrides }
  return h(ThemeProvider, {
    scheme,
    children: h(CorrectBody, {
      model: revealModel(reveal, { hasCompany }), reveal, item, answer: { text: submitted }, reflection: '', onReflection: jest.fn(),
    }),
  })
}

describe.each(['light', 'dark'] as const)('%s correct reveal body', (scheme) => {
  test('correctSure leads with the answer and opens its explanation and quote on request', async () => {
    await render(body({}, scheme))
    expect(screen.getByText(base.correctAnswer)).toHaveStyle(typography.bodyLg)
    expect(screen.queryByText('The answer')).toBeNull()
    const why = screen.getByRole('button', { name: 'Why', expanded: false })
    expect(screen.queryByText(base.explanation)).toBeNull()
    expect(screen.queryByLabelText(quoteLabel)).toBeNull()

    await fireEvent.press(why)
    expect(screen.getByRole('button', { name: 'Why', expanded: true })).toBeOnTheScreen()
    expect(screen.getByText(base.explanation)).toBeOnTheScreen()
    expect(screen.getByLabelText(quoteLabel)).toBeOnTheScreen()
  })

  test('correctUnsure shows the answer, explanation and quote without a Why control', async () => {
    await render(body({ state: 'B' }, scheme))
    expect(screen.getByText(base.correctAnswer)).toHaveStyle(typography.bodyLg)
    expect(screen.getByText(base.explanation)).toBeOnTheScreen()
    expect(screen.getByLabelText(quoteLabel)).toBeOnTheScreen()
    expect(screen.queryByRole('button', { name: 'Why' })).toBeNull()
    expect(screen.queryByText('The answer')).toBeNull()
  })

  test.each([
    ['A', true, 'Not quoted from your SOP'],
    ['B', false, 'Not quoted from a source'],
  ] as const)('noSource for state %s shows the answer, explanation and information line', async (state, hasCompany, line) => {
    await render(body({ state, sourceQuote: null }, scheme, hasCompany))
    expect(screen.getByText(base.correctAnswer)).toHaveStyle(typography.bodyLg)
    expect(screen.getByText(base.explanation)).toBeOnTheScreen()
    expect(screen.getByText(line)).toHaveStyle({ ...typography.caption, color: themes[scheme].inkMuted })
    expect(screen.queryByLabelText(/^Quote:/)).toBeNull()
    expect(screen.queryByRole('button', { name: 'Why' })).toBeNull()
  })

  test('ungraded shows the submitted answer, model answer and feedback sentence', async () => {
    const feedback = 'Compare your answer with the model answer. Your learning progress has not changed.'
    await render(body({ state: 'ungraded', attemptId: null, correct: false, score: null, xp: 0, feedback }, scheme))
    expect(screen.getByText('Your answer')).toBeOnTheScreen()
    expect(screen.getByText(submitted)).toHaveStyle(typography.bodyLg)
    expect(screen.getByText('The answer')).toBeOnTheScreen()
    expect(screen.getByText(base.correctAnswer)).toHaveStyle(typography.bodyLg)
    expect(screen.getByText(feedback)).toBeOnTheScreen()
    expect(screen.queryByText(base.explanation)).toBeNull()
    expect(screen.queryByLabelText(/^Quote:/)).toBeNull()
    expect(screen.queryByRole('button', { name: 'Why' })).toBeNull()
  })
})

test('a new result resets the Why disclosure even for the same question', async () => {
  const view = await render(body())
  await fireEvent.press(screen.getByRole('button', { name: 'Why' }))
  expect(screen.getByText(base.explanation)).toBeOnTheScreen()
  await view.rerender(body({ attemptId: 'next-attempt' }))
  expect(screen.getByRole('button', { name: 'Why', expanded: false })).toBeOnTheScreen()
  expect(screen.queryByText(base.explanation)).toBeNull()
  expect(screen.queryByLabelText(quoteLabel)).toBeNull()
})
