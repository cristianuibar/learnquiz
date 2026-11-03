import { createElement } from 'react'
import { act, render } from '@testing-library/react-native'
import type { NotificationResponse } from 'expo-notifications'
import { useFonts } from '@expo-google-fonts/inter'
import RootLayout from '../app/_layout'
import { useSession } from './session-store'
import { quickRoute, useNotificationObserver } from './notification-observer'
import { takeHeldTarget } from './held-target'

const DEFAULT_ACTION = 'expo.modules.notifications.actions.DEFAULT'

const mockPush = jest.fn()
const mockReplace = jest.fn()
const mockRouter = { push: mockPush, replace: mockReplace }
jest.mock('expo-router', () => {
  const React = require('react')
  const { Text } = require('react-native')
  const Stack = ({ children }: { children: unknown }) => React.createElement(Text, null, children)
  Stack.Screen = ({ name }: { name: string }) => React.createElement(Text, null, name)
  Stack.Protected = ({ guard, children }: { guard: boolean; children: unknown }) => guard ? children : null
  return { Stack, useRouter: () => mockRouter }
})
jest.mock('@expo-google-fonts/inter', () => ({ useFonts: jest.fn() }))
jest.mock('expo-splash-screen', () => ({ preventAutoHideAsync: jest.fn(), hideAsync: jest.fn() }))
jest.mock('./session-store', () => ({
  SessionProvider: ({ children }: { children: unknown }) => children,
  useSession: jest.fn(),
}))
jest.mock('expo-linking', () => ({ useURL: () => null }))
jest.mock('react-native-gesture-handler', () => ({ GestureHandlerRootView: 'View' }))
jest.mock('react-native-safe-area-context', () => ({ SafeAreaProvider: 'View' }))
jest.mock('react-native-keyboard-controller', () => ({ KeyboardProvider: 'View' }))

const signedOut = { status: 'signedOut' as const, user: null, needsDisclosure: false, branding: null,
  refresh: jest.fn(), setDisclosed: jest.fn() }
const ready = { ...signedOut, status: 'ready' as const, user: { id: 'u1', name: 'Learner', isAnonymous: false } }
const session = jest.mocked(useSession)
const fonts = jest.mocked(useFonts)

const mockGetLast = jest.fn()
const mockRemove = jest.fn()
const mockAddListener = jest.fn()
jest.mock('expo-notifications', () => ({
  DEFAULT_ACTION_IDENTIFIER: 'expo.modules.notifications.actions.DEFAULT',
  getLastNotificationResponseAsync: (...args: unknown[]) => mockGetLast(...args),
  addNotificationResponseReceivedListener: (...args: unknown[]) => mockAddListener(...args),
}))

function tap(identifier: string, url: unknown, actionIdentifier: string = DEFAULT_ACTION): NotificationResponse {
  return {
    actionIdentifier,
    notification: { request: { identifier, content: { data: { url } } } },
  } as unknown as NotificationResponse
}

function Harness({ ready }: { ready: boolean }) {
  useNotificationObserver(ready)
  return null
}

function listener(): (response: NotificationResponse) => void {
  return mockAddListener.mock.calls[0][0] as (response: NotificationResponse) => void
}

beforeEach(() => {
  jest.clearAllMocks()
  takeHeldTarget()
  mockGetLast.mockResolvedValue(null)
  mockAddListener.mockImplementation(() => ({ remove: mockRemove }))
  session.mockReturnValue(signedOut)
  fonts.mockReturnValue([true, null])
})

test.each([
  ['/play/quick/i1', { itemId: 'i1' }],
  ['/play/quick/i1?pushId=p1', { itemId: 'i1', pushId: 'p1' }],
  ['/play/quick/a-b_c-9?pushId=x-y_z-0', { itemId: 'a-b_c-9', pushId: 'x-y_z-0' }],
  ['/play/quick/ABC123', { itemId: 'ABC123' }],
])('quickRoute accepts %s', (url, expected) => {
  expect(quickRoute(url)).toEqual(expected)
})

test.each([
  '/sign-in',
  '//evil',
  'https://evil',
  '/play/quick/a/b',
  'javascript:',
  'javascript:alert(1)',
  '/play/quick/i1?other=1',
  '/play/quick/i1?pushId=p1&x=1',
  '/play/quick/i1?pushId=p1&redirect=//evil',
  '/play/quick/i1#frag',
  '/play/quick/',
  '/play/quick',
  '/play/quick/i1?pushId=',
  '/play/quick/i1?pushid=p1',
  '/play/quick/i 1',
  '/play/quick/i1 ',
  '/play/quick/i1\n',
  '',
])('quickRoute rejects %s', (url) => {
  expect(quickRoute(url)).toBeNull()
})

test.each([[null], [undefined], [42], [{}]])('quickRoute rejects non-string %s', (url) => {
  expect(quickRoute(url)).toBeNull()
})

test('cold last response navigates with pushId when ready', async () => {
  mockGetLast.mockResolvedValue(tap('cold-1', '/play/quick/i1?pushId=p1'))
  await render(createElement(Harness, { ready: true }))
  await act(async () => {})
  expect(mockPush).toHaveBeenCalledTimes(1)
  expect(mockPush).toHaveBeenCalledWith('/play/quick/i1?pushId=p1')
  expect(takeHeldTarget()).toBeNull()
})

test('warm listener navigates while ready', async () => {
  await render(createElement(Harness, { ready: true }))
  await act(async () => {
    listener()(tap('warm-1', '/play/quick/i1'))
  })
  expect(mockPush).toHaveBeenCalledWith('/play/quick/i1')
  expect(takeHeldTarget()).toBeNull()
})

test('same request identifier via cold and warm navigates once', async () => {
  mockGetLast.mockResolvedValue(tap('dup-1', '/play/quick/i1?pushId=p1'))
  await render(createElement(Harness, { ready: true }))
  await act(async () => {})
  await act(async () => {
    listener()(tap('dup-1', '/play/quick/i1?pushId=p1'))
  })
  expect(mockPush).toHaveBeenCalledTimes(1)
})

test('custom action identifier is ignored on both routes', async () => {
  mockGetLast.mockResolvedValue(tap('cold-custom', '/play/quick/i1', 'custom-action'))
  await render(createElement(Harness, { ready: true }))
  await act(async () => {})
  await act(async () => {
    listener()(tap('warm-custom', '/play/quick/i1', 'custom-action'))
  })
  expect(mockPush).not.toHaveBeenCalled()
  expect(takeHeldTarget()).toBeNull()
})

test('unrecognized payload URLs never navigate nor hold', async () => {
  await render(createElement(Harness, { ready: true }))
  for (const [index, url] of ['https://evil', '/sign-in', '/play/quick/a/b'].entries()) {
    await act(async () => {
      listener()(tap(`bad-${index}`, url))
    })
  }
  expect(mockPush).not.toHaveBeenCalled()
  expect(takeHeldTarget()).toBeNull()
})

test('tap while not ready holds the target instead of pushing', async () => {
  await render(createElement(Harness, { ready: false }))
  await act(async () => {
    listener()(tap('held-1', '/play/quick/i1?pushId=p1'))
  })
  expect(mockPush).not.toHaveBeenCalled()
  expect(takeHeldTarget()).toBe('/play/quick/i1?pushId=p1')
})

test('delayed cold lookup uses the ready value at resolution time', async () => {
  let resolveCold!: (value: NotificationResponse | null) => void
  mockGetLast.mockReturnValue(new Promise<NotificationResponse | null>((resolve) => { resolveCold = resolve }))
  const view = await render(createElement(Harness, { ready: false }))
  await view.rerender(createElement(Harness, { ready: true }))
  await act(async () => {
    resolveCold(tap('cold-late', '/play/quick/i1?pushId=p1'))
  })
  expect(mockPush).toHaveBeenCalledWith('/play/quick/i1?pushId=p1')
  expect(takeHeldTarget()).toBeNull()
})

test('unmount removes the listener and ignores a late cold response', async () => {
  let resolveCold!: (value: NotificationResponse | null) => void
  mockGetLast.mockReturnValue(new Promise<NotificationResponse | null>((resolve) => { resolveCold = resolve }))
  const view = await render(createElement(Harness, { ready: true }))
  await act(async () => {
    view.unmount()
  })
  expect(mockRemove).toHaveBeenCalledTimes(1)
  await act(async () => {
    resolveCold(tap('cold-after-unmount', '/play/quick/i1'))
    listener()(tap('queued-after-unmount', '/play/quick/i1'))
  })
  expect(mockPush).not.toHaveBeenCalled()
  expect(takeHeldTarget()).toBeNull()
})

test('rejected cold lookup leaves the warm listener working', async () => {
  mockGetLast.mockRejectedValue(new Error('gone'))
  await render(createElement(Harness, { ready: true }))
  await act(async () => {})
  await act(async () => {
    listener()(tap('warm-after-reject', '/play/quick/i1'))
  })
  expect(mockPush).toHaveBeenCalledWith('/play/quick/i1')
  expect(takeHeldTarget()).toBeNull()
})

test('replays a pending tap after sign-in and disclosure exactly once', async () => {
  mockGetLast.mockResolvedValue(tap('push-1', '/play/quick/i1?pushId=p1'))
  const view = await render(createElement(RootLayout))
  expect(mockPush).not.toHaveBeenCalled()
  expect(mockReplace).not.toHaveBeenCalled()
  session.mockReturnValue({ ...ready, needsDisclosure: true })
  await view.rerender(createElement(RootLayout))
  expect(mockPush).not.toHaveBeenCalled()
  expect(mockReplace).not.toHaveBeenCalled()
  session.mockReturnValue(ready)
  await view.rerender(createElement(RootLayout))
  expect(mockReplace).toHaveBeenCalledTimes(1)
  expect(mockReplace).toHaveBeenCalledWith('/play/quick/i1?pushId=p1')
  expect(takeHeldTarget()).toBeNull()
  await act(async () => { listener()(tap('push-1', '/play/quick/i1?pushId=p1')) })
  await view.rerender(createElement(RootLayout))
  expect(mockReplace).toHaveBeenCalledTimes(1)
  expect(mockPush).not.toHaveBeenCalled()
})

test('holds a tap until fonts mount the root navigator', async () => {
  fonts.mockReturnValue([false, null])
  session.mockReturnValue(ready)
  mockGetLast.mockResolvedValue(tap('fonts-1', '/play/quick/i1'))
  const view = await render(createElement(RootLayout))
  expect(mockPush).not.toHaveBeenCalled()
  expect(mockReplace).not.toHaveBeenCalled()
  fonts.mockReturnValue([true, null])
  await view.rerender(createElement(RootLayout))
  expect(mockReplace).toHaveBeenCalledTimes(1)
  expect(mockReplace).toHaveBeenCalledWith('/play/quick/i1')
})
