import { createElement as h, type ReactNode } from 'react'
import { fireEvent, render, screen } from '@testing-library/react-native'
import type { ItemView, Reveal } from '@learnquiz/api'
import { ThemeProvider } from '../../theme/ThemeProvider'
import { RevealOverlay, type RevealOverlayProps } from './reveal-overlay'

jest.mock('../../lib/haptics', () => ({ resultHaptic: jest.fn() }))
jest.mock('../../lib/report', () => ({ sendReport: jest.fn() }))
jest.mock('../sheet/sheet', () => ({
  Sheet: (props: { band?: ReactNode; body: ReactNode; foot?: ReactNode }) => {
    const { View: V } = require('react-native')
    const { createElement } = require('react')
    return createElement(V, null, props.band, props.body, props.foot)
  },
}))

const reveal: Reveal = {
  diagramConceptId: null, attemptId: 'attempt', state: 'D', correct: false, xp: 0, critical: false, correctOptionIds: ['record'], detail: null,
  score: 0, feedback: null, missingPoints: [], correctAnswer: 'Record the damage', chosenFeedback: null, explanation: 'Record before moving.',
  sourceQuote: null, sourceTitle: 'Receiving SOP', sourceVersion: 3, mixUps: [], returnsThisSession: false,
  pKnownBefore: 0.2, pKnownAfter: 0.3,
}
const item: ItemView = { id: 'i', conceptId: 'c', conceptName: 'Receiving', format: 'mcq', stem: 'What first?', options: [], blank: null, image: null, difficulty: 1 }

function overlay(props: Partial<RevealOverlayProps>) {
  return h(ThemeProvider, {
    children: h(RevealOverlay, {
      reveal, item, answer: {}, confidence: 'sure', onContinue: jest.fn(), busy: false, error: null, branding: null, ...props,
    }),
  })
}

test('Report is hidden while Continue is pending and returns when it fails', async () => {
  const view = await render(overlay({ busy: false }))
  expect(screen.getByRole('button', { name: 'Report this question' })).toBeOnTheScreen()
  await view.rerender(overlay({ busy: true }))
  expect(screen.queryByRole('button', { name: 'Report this question' })).toBeNull()
  await view.rerender(overlay({ busy: false, error: "Couldn't load the next question." }))
  expect(screen.getByRole('button', { name: 'Report this question' })).toBeOnTheScreen()
})

test('a retry after a failed Got it sends the reflection from the first attempt', async () => {
  const onContinue = jest.fn()
  const view = await render(overlay({ onContinue }))
  await fireEvent.changeText(screen.getByLabelText('In one line: why does this matter?'), 'I mixed up the steps')
  await fireEvent.press(screen.getByRole('button', { name: 'Got it' }))
  await view.rerender(overlay({ onContinue, error: "Couldn't load the next question." }))
  await fireEvent.changeText(screen.getByLabelText('In one line: why does this matter?'), 'Something else')
  await fireEvent.press(screen.getByRole('button', { name: 'Got it' }))
  expect(onContinue.mock.calls).toEqual([
    [{ why: 'I mixed up the steps', reported: false }],
    [{ why: 'I mixed up the steps', reported: false }],
  ])
})
