import { createElement } from 'react'
import { Appearance } from 'react-native'
import { applyAppearance } from './lib/appearance'
import { render, screen } from '@testing-library/react-native'
import { useFonts } from '@expo-google-fonts/inter'
import * as SplashScreen from 'expo-splash-screen'
import RootLayout from './app/_layout'
import { useSession } from './lib/session-store'
import { useURL } from 'expo-linking'
import { holdTarget, takeHeldTarget } from './lib/held-target'

let mockSystemScheme: 'light' | 'dark' = 'light'
let mockAppearance: 'light' | 'dark' | 'unspecified' = 'unspecified'
jest.mock('react-native/Libraries/Utilities/useColorScheme', () => ({
  __esModule: true,
  default: () => mockAppearance === 'unspecified' ? mockSystemScheme : mockAppearance,
}))
// Expose the native status-bar boundary so assertions observe its requested icon style.
jest.mock('expo-status-bar', () => ({
  StatusBar: ({ style }: { style: string }) => require('react').createElement(
    require('react-native').Text, { accessibilityLabel: 'Status bar icons' }, style,
  ),
}))

jest.mock('@expo-google-fonts/inter', () => ({ useFonts: jest.fn() }))
jest.mock('expo-splash-screen', () => ({ preventAutoHideAsync: jest.fn(), hideAsync: jest.fn() }))
jest.mock('./lib/session-store', () => ({
  SessionProvider: ({ children }: { children: unknown }) => children,
  useSession: jest.fn(),
}))
jest.mock('expo-linking', () => ({ useURL: jest.fn() }))
const mockReplace = jest.fn()
jest.mock('expo-router', () => {
  const React = require('react')
  const { Text } = require('react-native')
  const Stack = ({ children }: { children: unknown }) => React.createElement(Text, null, children)
  Stack.Screen = ({ name }: { name: string }) => React.createElement(Text, null, name)
  Stack.Protected = ({ guard, children }: { guard: boolean; children: unknown }) => guard ? children : null
  return { Stack, useRouter: () => ({ replace: mockReplace }), usePathname: () => '/settings' }
})
jest.mock('expo-notifications', () => ({
  DEFAULT_ACTION_IDENTIFIER: 'expo.modules.notifications.actions.DEFAULT',
  getLastNotificationResponseAsync: jest.fn(async () => null),
  addNotificationResponseReceivedListener: jest.fn(() => ({ remove: jest.fn() })),
}))
jest.mock('react-native-gesture-handler', () => ({ GestureHandlerRootView: 'View' }))
jest.mock('react-native-safe-area-context', () => ({ SafeAreaProvider: 'View' }))
jest.mock('react-native-keyboard-controller', () => ({ KeyboardProvider: 'View' }))

const fonts = jest.mocked(useFonts)
const session = jest.mocked(useSession)
const signedOut = { status: 'signedOut' as const, user: null, needsDisclosure: false, branding: null,
  refresh: jest.fn(), setDisclosed: jest.fn() }
const ready = { ...signedOut, status: 'ready' as const, user: { id: 'u1', name: 'Learner', isAnonymous: false } }

beforeEach(() => {
  jest.clearAllMocks()
  takeHeldTarget()
  fonts.mockReturnValue([true, null])
  session.mockReturnValue(signedOut)
  jest.mocked(useURL).mockReturnValue(null)
})

test('keeps routes behind the splash until fonts and the first session load resolve', async () => {
  fonts.mockReturnValue([false, null])
  session.mockReturnValue({ ...signedOut, status: 'loading' })
  const view = await render(createElement(RootLayout))
  expect(screen.queryByText('(auth)')).toBeNull()
  fonts.mockReturnValue([true, null])
  await view.rerender(createElement(RootLayout))
  expect(SplashScreen.hideAsync).not.toHaveBeenCalled()
  session.mockReturnValue(signedOut)
  await view.rerender(createElement(RootLayout))
  expect(screen.getByText('(auth)')).toBeOnTheScreen()
  expect(screen.getByText('join/[invitationId]')).toBeOnTheScreen()
  expect(screen.queryByText('welcome')).toBeNull()
  expect(screen.queryByText('(tabs)')).toBeNull()
  expect(SplashScreen.hideAsync).toHaveBeenCalledTimes(1)
})

test('opens the private routes only after disclosure', async () => {
  session.mockReturnValue({ ...ready, needsDisclosure: true })
  const view = await render(createElement(RootLayout))
  expect(screen.getByText('welcome')).toBeOnTheScreen()
  expect(screen.queryByText('(auth)')).toBeNull()
  expect(screen.queryByText('(tabs)')).toBeNull()
  expect(screen.queryByText('settings')).toBeNull()
  session.mockReturnValue(ready)
  await view.rerender(createElement(RootLayout))
  for (const name of ['(tabs)', 'play/loading', 'play/quick/[itemId]', 'play/[sessionId]/index',
    'play/[sessionId]/done', 'opt-in', 'settings', 'unit/[unitId]', 'flag']) {
    expect(screen.getByText(name)).toBeOnTheScreen()
  }
})

test('holds a cold link through sign-in and disclosure and replays it once', async () => {
  jest.mocked(useURL).mockReturnValue('learnquiz://play/s1?from=notification')
  session.mockReturnValue({ ...signedOut, status: 'loading' })
  const view = await render(createElement(RootLayout))
  session.mockReturnValue(signedOut)
  await view.rerender(createElement(RootLayout))
  expect(mockReplace).not.toHaveBeenCalled()
  session.mockReturnValue({ ...ready, needsDisclosure: true })
  await view.rerender(createElement(RootLayout))
  expect(mockReplace).not.toHaveBeenCalled()
  session.mockReturnValue(ready)
  await view.rerender(createElement(RootLayout))
  expect(mockReplace).toHaveBeenCalledWith('/play/s1?from=notification')
  expect(takeHeldTarget()).toBeNull()
  await view.rerender(createElement(RootLayout))
  expect(mockReplace).toHaveBeenCalledTimes(1)
})

test('replays a held notification path when the session gate opens', async () => {
  holdTarget('/unit/unit-1')
  const view = await render(createElement(RootLayout))
  expect(mockReplace).not.toHaveBeenCalled()
  session.mockReturnValue(ready)
  await view.rerender(createElement(RootLayout))
  expect(mockReplace).toHaveBeenCalledWith('/unit/unit-1')
})

test('surfaces a font loading error', async () => {
  fonts.mockReturnValue([false, new Error('Font load failed')])
  await expect(render(createElement(RootLayout))).rejects.toThrow('Font load failed')
  expect(SplashScreen.hideAsync).not.toHaveBeenCalled()
})


test.each([
  ['light', 'system', 'dark'],
  ['dark', 'system', 'light'],
  ['dark', 'light', 'dark'],
  ['light', 'dark', 'light'],
] as const)('status bar on system %s with %s appearance uses %s icons', async (system, choice, icons) => {
  mockSystemScheme = system
  mockAppearance = 'unspecified'
  const set = jest.spyOn(Appearance, 'setColorScheme').mockImplementation((value) => {
    mockAppearance = value ?? 'unspecified'
  })
  try {
    const view = await render(createElement(RootLayout))
    applyAppearance(choice)
    await view.rerender(createElement(RootLayout))
    expect(screen.getByLabelText('Status bar icons')).toHaveTextContent(icons)
  } finally {
    set.mockRestore()
    mockAppearance = 'unspecified'
  }
})
