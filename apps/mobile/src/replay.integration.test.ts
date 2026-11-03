import { createElement } from 'react'
import { act, render } from '@testing-library/react-native'
import { useFonts } from '@expo-google-fonts/inter'
import { useURL } from 'expo-linking'
import RootLayout from './app/_layout'
import { useSession } from './lib/session-store'
import { deferReplay, holdTarget, releaseReplayHolds, takeHeldTarget } from './lib/held-target'

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

const signedOut = { status: 'signedOut' as const, user: null, needsDisclosure: false, branding: null,
  refresh: jest.fn(), setDisclosed: jest.fn() }
const ready = { ...signedOut, status: 'ready' as const, user: { id: 'u1', name: 'Learner', isAnonymous: false } }

beforeEach(() => {
  jest.clearAllMocks()
  releaseReplayHolds()
  takeHeldTarget()
  jest.mocked(useFonts).mockReturnValue([true, null])
  jest.mocked(useURL).mockReturnValue(null)
})

test('the layout replays a held link exactly once when the last hold ends', async () => {
  jest.mocked(useSession).mockReturnValue(ready)
  holdTarget('/unit/u1')
  const first = deferReplay()
  const second = deferReplay()
  const view = await render(createElement(RootLayout))
  expect(mockReplace).not.toHaveBeenCalled()
  await act(async () => { first() })
  expect(mockReplace).not.toHaveBeenCalled()
  await act(async () => { second() })
  expect(mockReplace).toHaveBeenCalledTimes(1)
  expect(mockReplace).toHaveBeenCalledWith('/unit/u1')
  await view.rerender(createElement(RootLayout))
  expect(mockReplace).toHaveBeenCalledTimes(1)
})
