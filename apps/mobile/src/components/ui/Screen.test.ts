import { createElement as h, useRef } from 'react'
import type { Text as NativeText } from 'react-native'
import { act, fireEvent, render, screen } from '@testing-library/react-native'
import { useSafeAreaInsets } from 'react-native-safe-area-context'
import { useKeyboardState } from 'react-native-keyboard-controller'
import { ThemeProvider } from '../../theme/ThemeProvider'
import { Screen, useHeadingFocus } from './Screen'
import { Text } from './Text'
import { Button } from './Button'
import { AlertRow } from './AlertRow'
import { Mark } from './Mark'

const Native: typeof import('react-native') = require('react-native')

jest.mock('react-native-safe-area-context', () => ({ useSafeAreaInsets: jest.fn() }))
jest.mock('react-native-keyboard-controller', () => ({
  KeyboardAvoidingView: require('react-native').View,
  KeyboardAwareScrollView: require('react-native').ScrollView,
  useKeyboardState: jest.fn(),
}))

beforeEach(() => {
  jest.mocked(useSafeAreaInsets).mockReturnValue({ top: 24, bottom: 32, left: 0, right: 0 })
  jest.mocked(useKeyboardState).mockReturnValue(false)
})

afterEach(() => jest.restoreAllMocks())

test('a mounted heading receives accessibility focus', async () => {
  let frame: FrameRequestCallback = () => {}
  jest.spyOn(global, 'requestAnimationFrame').mockImplementation((callback) => { frame = callback; return 1 })
  jest.spyOn(Native, 'findNodeHandle').mockReturnValue(42)
  const focus = jest.spyOn(Native.AccessibilityInfo, 'setAccessibilityFocus').mockImplementation(() => {})
  const nativeHeading = {} as NativeText
  function Heading() {
    const ref = useRef<NativeText>(nativeHeading)
    useHeadingFocus(ref)
    return h(Text, { header: true, variant: 'title1' }, 'Before you start')
  }
  await render(h(ThemeProvider, { children: h(Screen, { children: h(Heading) }) }))
  expect(screen.getByRole('header', { name: 'Before you start' })).toBeOnTheScreen()
  await act(() => frame(0))
  expect(Native.findNodeHandle).toHaveBeenCalledWith(nativeHeading)
  expect(focus).toHaveBeenCalledWith(42)
})

test('unmounting cancels the pending heading focus', async () => {
  jest.spyOn(global, 'requestAnimationFrame').mockReturnValue(7)
  const cancel = jest.spyOn(global, 'cancelAnimationFrame').mockImplementation(() => {})
  function Heading() {
    const ref = useRef<NativeText>(null)
    useHeadingFocus(ref)
    return h(Text, { ref, header: true }, 'Today')
  }
  const view = await render(h(ThemeProvider, { children: h(Heading) }))
  await view.unmount()
  expect(cancel).toHaveBeenCalledWith(7)
})

test('the dock keeps its safe-area spacing and drops the inset above the keyboard', async () => {
  const onPress = jest.fn()
  const content = h(Screen, {
    dock: h(Button, { children: 'Got it', onPress }),
    footer: h(Native.View, null, h(Mark), h(Text, null, 'Training by Learn Quiz')),
    children: h(Text, { header: true }, 'Before you start'),
  })
  const view = await render(h(ThemeProvider, { children: content }))
  const dock = screen.getByRole('button', { name: 'Got it' }).parent
  expect(dock).toHaveStyle({ paddingBottom: 44 })
  expect(screen.getByText('Training by Learn Quiz')).toBeOnTheScreen()
  jest.mocked(useKeyboardState).mockReturnValue(true)
  await view.rerender(h(ThemeProvider, { children: content }))
  expect(screen.getByRole('button', { name: 'Got it' }).parent).toHaveStyle({ paddingBottom: 12 })
  await fireEvent.press(screen.getByRole('button', { name: 'Got it' }))
  expect(onPress).toHaveBeenCalledTimes(1)
})

test('blocking errors announce their text assertively', async () => {
  await render(h(ThemeProvider, { children: h(AlertRow, null, 'Couldn’t check your answer. It’s saved on this phone.') }))
  const alert = screen.getByRole('alert', { name: 'Couldn’t check your answer. It’s saved on this phone.' })
  expect(alert).toHaveProp('accessibilityLiveRegion', 'assertive')
})
