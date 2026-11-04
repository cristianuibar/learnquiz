import { createElement as h } from 'react'
import { StyleSheet } from 'react-native'
import { act, render, screen } from '@testing-library/react-native'
import type { Reveal } from '@learnquiz/api'
import { themes } from '@learnquiz/tokens/native'
import { ThemeProvider } from '../../theme/ThemeProvider'
import { QuickResult } from './QuickResult'

const Native: typeof import('react-native') = require('react-native')

jest.mock('react-native-keyboard-controller', () => ({
  KeyboardAvoidingView: require('react-native').View,
  KeyboardAwareScrollView: require('react-native').ScrollView,
  useKeyboardState: jest.fn(),
}))

afterEach(() => jest.restoreAllMocks())

const reveal: Reveal = {
  diagramConceptId: null, attemptId: 'attempt', state: 'A', correct: true, xp: 10,
  critical: false, correctOptionIds: null, detail: null, score: 1, feedback: null,
  missingPoints: [], correctAnswer: 'Record the damage', chosenFeedback: null,
  explanation: 'Record before moving.', sourceQuote: null, sourceTitle: null,
  sourceVersion: null, mixUps: [], returnsThisSession: false, pKnownBefore: 0.2, pKnownAfter: 0.5,
}

describe.each(['light', 'dark'] as const)('%s quick result', (scheme) => {
  test('the visually hidden done heading remains reachable and receives accessibility focus', async () => {
    let frame: FrameRequestCallback = () => {}
    jest.spyOn(global, 'requestAnimationFrame').mockImplementation((callback) => { frame = callback; return 1 })
    jest.spyOn(Native, 'findNodeHandle').mockReturnValue(42)
    const focus = jest.spyOn(Native.AccessibilityInfo, 'setAccessibilityFocus').mockImplementation(() => {})
    await render(h(ThemeProvider, {
      scheme, children: h(QuickResult, { reveal, chosenText: reveal.correctAnswer, reviewsLeft: 3 }),
    }))
    const heading = screen.getByRole('header', { name: 'Quick question done' })
    expect(StyleSheet.flatten(heading.props.style).opacity).not.toBe(0)
    expect(heading).toHaveStyle({
      position: 'absolute', width: 1, height: 1, overflow: 'hidden', color: themes[scheme].surfacePage,
    })
    await act(() => frame(0))
    expect(Native.findNodeHandle).toHaveBeenCalled()
    expect(focus).toHaveBeenCalledWith(42)
  })

  test('the compact band shows and announces Correct without XP', async () => {
    await render(h(ThemeProvider, {
      scheme, children: h(QuickResult, { reveal, chosenText: reveal.correctAnswer, reviewsLeft: 3 }),
    }))
    const band = screen.getByRole('header', { name: 'Correct' })
    expect(band).toBeOnTheScreen()
    expect(band.parent).toHaveProp('accessibilityLiveRegion', 'polite')
    expect(screen.getAllByRole('header', { name: 'Correct' })).toHaveLength(1)
    expect(screen.queryByText(/\bXP\b/)).toBeNull()
    expect(screen.queryByLabelText(/\bXP\b/)).toBeNull()
  })
})
