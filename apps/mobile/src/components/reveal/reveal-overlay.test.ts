import { createElement as h } from 'react'
import { act, fireEvent, render, screen } from '@testing-library/react-native'
import { setUpTests } from 'react-native-reanimated'
import { themes } from '@learnquiz/tokens/native'
import type { ItemView, Reveal } from '@learnquiz/api'
import { ThemeProvider } from '../../theme/ThemeProvider'
import { RevealOverlay, type RevealOverlayProps } from './reveal-overlay'

jest.mock('../../lib/haptics', () => ({ resultHaptic: jest.fn() }))
jest.mock('../../lib/report', () => ({ sendReport: jest.fn() }))
jest.mock('react-native-keyboard-controller', () => ({ KeyboardAvoidingView: require('react-native').View }))
jest.mock('react-native-safe-area-context', () => ({ useSafeAreaInsets: () => ({ top: 24, bottom: 0, left: 0, right: 0 }) }))

setUpTests()
beforeEach(() => jest.useFakeTimers())
afterEach(() => jest.useRealTimers())

const reveal: Reveal = {
  diagramConceptId: null, attemptId: 'attempt', state: 'D', correct: false, xp: 0, critical: false, correctOptionIds: ['record'], detail: null,
  score: 0, feedback: null, missingPoints: [], correctAnswer: 'Record the damage', chosenFeedback: null, explanation: 'Record before moving.',
  sourceQuote: null, sourceTitle: 'Receiving SOP', sourceVersion: 3, mixUps: [], returnsThisSession: false,
  pKnownBefore: 0.2, pKnownAfter: 0.3,
}
const item: ItemView = { id: 'i', conceptId: 'c', conceptName: 'Receiving', format: 'mcq', stem: 'What first?', options: [], blank: null, image: null, difficulty: 1 }

function overlay(props: Partial<RevealOverlayProps>, scheme: 'light' | 'dark' = 'light') {
  return h(ThemeProvider, {
    scheme,
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

describe.each(['light', 'dark'] as const)('%s result grabber', (scheme) => {
  test.each([
    ['correct', { state: 'A', correct: true, xp: 10, sourceQuote: 'Record first.' }],
    ['unsure', { state: 'B', correct: true, xp: 10 }],
    ['not quite', { state: 'C' }],
    ['sure and wrong', { state: 'D' }],
    ['no source', { state: 'A', correct: true, xp: 10, sourceQuote: null }],
    ['partly right', { state: 'P', detail: { kind: 'multi', found: 1, total: 2, extra: 1, options: [] } }],
  ] satisfies [string, Partial<Reveal>][])('%s overlays the handle without changing band padding', async (_name, result) => {
    await render(overlay({ reveal: { ...reveal, ...result } }, scheme))
    const grabber = screen.getByTestId('sheet-grabber', { includeHiddenElements: true })
    expect(grabber).toHaveStyle({ position: 'absolute', top: 8, width: 36, height: 4, backgroundColor: themes[scheme].borderStrong })
    expect(grabber).toHaveProp('accessibilityElementsHidden', true)
    expect(grabber).toHaveProp('importantForAccessibility', 'no-hide-descendants')
    expect(screen.getByRole('header', { name: /^(Correct|Not quite|Partly right)/ })).toHaveStyle({ paddingTop: 24, paddingBottom: 16 })
  })

  test('Report hides the handle and Back restores it on the same risen sheet', async () => {
    await render(overlay({}, scheme))
    const sheet = screen.getByTestId('sheet-grabber', { includeHiddenElements: true }).parent!
    await act(() => jest.advanceTimersByTime(300))
    expect(sheet).toHaveAnimatedStyle({ opacity: 1, transform: [{ translateY: 0 }] })
    await fireEvent.press(screen.getByRole('button', { name: 'Report this question' }))
    expect(screen.queryByTestId('sheet-grabber', { includeHiddenElements: true })).toBeNull()
    expect(sheet).toBeOnTheScreen()
    expect(sheet).toHaveAnimatedStyle({ opacity: 1, transform: [{ translateY: 0 }] })
    await fireEvent.press(screen.getByRole('button', { name: 'Back to result' }))
    expect(screen.getByTestId('sheet-grabber', { includeHiddenElements: true }).parent).toBe(sheet)
    expect(sheet).toHaveAnimatedStyle({ opacity: 1, transform: [{ translateY: 0 }] })
  })
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
