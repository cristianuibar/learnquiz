import { useSyncExternalStore } from 'react'
import { act, renderRouter, screen } from 'expo-router/testing-library'
import { useSession } from './lib/session-store'
import { holdTarget, takeHeldTarget } from './lib/held-target'

jest.mock('@expo-google-fonts/inter', () => ({ useFonts: () => [true, null] }))
jest.mock('expo-splash-screen', () => ({ preventAutoHideAsync: jest.fn(), hideAsync: jest.fn() }))
jest.mock('./lib/session-store', () => ({
  SessionProvider: ({ children }: { children: unknown }) => children,
  useSession: jest.fn(),
}))
// The real Today screen loads /today; this file only checks that the route is reachable.
jest.mock('./app/(tabs)/today', () => ({
  __esModule: true,
  default: () => require('react').createElement(require('react-native').Text, null, 'Today screen'),
}))
jest.mock('react-native-gesture-handler', () => ({ GestureHandlerRootView: 'View' }))
jest.mock('react-native-keyboard-controller', () => ({ KeyboardProvider: 'View' }))
jest.mock('expo-router/build/toolbar/native', () => ({ RouterToolbarHost: 'View', RouterToolbarItem: 'View' }))
jest.mock(require.resolve('expo-glass-effect', { paths: [require.resolve('expo-router')] }), () => ({
  GlassView: 'View', isLiquidGlassAvailable: () => false, isGlassEffectAPIAvailable: () => false,
}))
jest.mock('expo-constants', () => ({
  __esModule: true, default: { executionEnvironment: 'standalone', expoConfig: { scheme: 'learnquiz' } },
}))

const signedOut = { status: 'signedOut' as const, user: null, needsDisclosure: false, branding: null,
  refresh: jest.fn(), setDisclosed: jest.fn() }
const ready = { ...signedOut, status: 'ready' as const, user: { id: 'u1', name: 'Learner', isAnonymous: false } }

beforeEach(() => { takeHeldTarget() })
afterEach(() => { jest.useRealTimers() })

test('the actual router sends a signed-out private link to sign-in', async () => {
  jest.mocked(useSession).mockReturnValue(signedOut)
  const navigation = renderRouter('src/app', { initialUrl: '/settings' })
  await navigation
  expect(navigation.getPathname()).toBe('/sign-in')
  expect(screen.getByText('Sign in')).toBeOnTheScreen()
  expect(screen.queryByText('Settings')).toBeNull()
})

test('the actual router sends an undisclosed private link to welcome', async () => {
  jest.mocked(useSession).mockReturnValue({ ...ready, needsDisclosure: true })
  const navigation = renderRouter('src/app', { initialUrl: '/play/session-1' })
  await navigation
  expect(navigation.getPathname()).toBe('/welcome')
  expect(screen.getByText('Welcome')).toBeOnTheScreen()
})

test('the actual router opens private routes after disclosure', async () => {
  jest.mocked(useSession).mockReturnValue(ready)
  const navigation = renderRouter('src/app', { initialUrl: '/settings' })
  await navigation
  expect(navigation.getPathname()).toBe('/settings')
  expect(screen.getByText('Settings')).toBeOnTheScreen()
})

test('the actual router leaves invitations reachable while signed out', async () => {
  jest.mocked(useSession).mockReturnValue(signedOut)
  const navigation = renderRouter('src/app', { initialUrl: '/join/invitation-1' })
  await navigation
  expect(navigation.getPathname()).toBe('/join/invitation-1')
  expect(screen.getByText('Join')).toBeOnTheScreen()
})

test('the actual router keeps sign-in closed for a signed-in learner', async () => {
  jest.mocked(useSession).mockReturnValue(ready)
  const navigation = renderRouter('src/app', { initialUrl: '/sign-in' })
  await navigation
  expect(navigation.getPathname()).toBe('/today')
  expect(screen.getByText('Today screen')).toBeOnTheScreen()
  expect(screen.queryByText('Sign in')).toBeNull()
})

test('the actual router replays a held target after startup, sign-in and disclosure', async () => {
  let snapshot: ReturnType<typeof useSession> = { ...signedOut, status: 'loading' }
  const listeners = new Set<() => void>()
  const subscribe = (listener: () => void) => { listeners.add(listener); return () => { listeners.delete(listener) } }
  jest.mocked(useSession).mockImplementation(() => useSyncExternalStore(subscribe, () => snapshot))
  holdTarget('/play/session-1?from=notification')
  const navigation = renderRouter('src/app', { initialUrl: '/' })
  await navigation
  const transition = async (next: ReturnType<typeof useSession>) => {
    await act(async () => { snapshot = next; listeners.forEach((listener) => listener()) })
  }
  await transition(signedOut)
  expect(navigation.getPathname()).toBe('/sign-in')
  await transition({ ...ready, needsDisclosure: true })
  expect(navigation.getPathname()).toBe('/welcome')
  await transition(ready)
  expect(navigation.getPathname()).toBe('/play/session-1')
  expect(navigation.getSearchParams()).toMatchObject({ from: 'notification' })
  expect(takeHeldTarget()).toBeNull()
})
