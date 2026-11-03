import { createElement } from 'react'
import { render, screen } from '@testing-library/react-native'
import { useFonts } from '@expo-google-fonts/inter'
import * as SplashScreen from 'expo-splash-screen'
import RootLayout from './app/_layout'

jest.mock('@expo-google-fonts/inter', () => ({ useFonts: jest.fn() }))
jest.mock('expo-splash-screen', () => ({ preventAutoHideAsync: jest.fn(), hideAsync: jest.fn() }))
jest.mock('expo-router', () => ({
  Stack: () => require('react').createElement(require('react-native').Text, null, 'Routes'),
}))
jest.mock('react-native-gesture-handler', () => ({ GestureHandlerRootView: 'View' }))
jest.mock('react-native-safe-area-context', () => ({ SafeAreaProvider: 'View' }))
jest.mock('react-native-keyboard-controller', () => ({ KeyboardProvider: 'View' }))

const fonts = jest.mocked(useFonts)

beforeEach(() => {
  jest.mocked(SplashScreen.hideAsync).mockClear()
})

test('keeps routes behind the splash screen until fonts load', async () => {
  fonts.mockReturnValue([false, null])
  const view = await render(createElement(RootLayout))
  expect(screen.queryByText('Routes')).toBeNull()
  expect(SplashScreen.hideAsync).not.toHaveBeenCalled()
  fonts.mockReturnValue([true, null])
  await view.rerender(createElement(RootLayout))
  expect(screen.getByText('Routes')).toBeOnTheScreen()
  expect(SplashScreen.hideAsync).toHaveBeenCalledTimes(1)
})

test('surfaces a font loading error', async () => {
  fonts.mockReturnValue([false, new Error('Font load failed')])
  await expect(render(createElement(RootLayout))).rejects.toThrow('Font load failed')
  expect(SplashScreen.hideAsync).not.toHaveBeenCalled()
})
