import { createElement as h, useState } from 'react'
import { Dimensions, StyleSheet } from 'react-native'
import { fireEvent, render, screen } from '@testing-library/react-native'
import type { Confidence } from '@learnquiz/api'
import { ThemeProvider } from '../../theme/ThemeProvider'
import { ConfidencePicker } from './ConfidencePicker'

const windowSize = Dimensions.get('window')

afterEach(() => Dimensions.set({ window: windowSize }))

describe.each([1, 2])('at font scale %s', (fontScale) => {
  beforeEach(() => Dimensions.set({ window: { ...windowSize, width: 320, fontScale } }))

  test.each([false, true])('all confidence labels can wrap, including selected labels; compact: %s', async (compact) => {
    function Picker() {
      const [value, onChange] = useState<Confidence | null>(null)
      return h(ConfidencePicker, { value, onChange, compact })
    }
    await render(h(ThemeProvider, { children: h(Picker) }))

    for (const label of ['Sure', 'Unsure', 'Guessing']) {
      await fireEvent.press(screen.getByRole('radio', { name: label }))
      expect(screen.getByRole('radio', { name: label, checked: true })).toBeOnTheScreen()

      // Check every option after each selection, when the checkmark also needs room.
      for (const option of ['Sure', 'Unsure', 'Guessing']) {
        const text = screen.getByText(option)
        expect(text.props.numberOfLines).toBeUndefined()
        expect(text.props.allowFontScaling).not.toBe(false)
        expect(text.props.maxFontSizeMultiplier).toBeUndefined()
        expect(text).toHaveStyle({ flexShrink: 1, textAlign: 'center' })
        const button = screen.getByRole('radio', { name: option })
        const style = StyleSheet.flatten(button.props.style)
        expect(style.minHeight).toBeGreaterThanOrEqual(44)
        expect(style.height).toBeUndefined()
        expect(style.maxHeight).toBeUndefined()
      }
    }
    expect(screen.getByText('How sure are you?').props.numberOfLines).toBeUndefined()
  })
})
