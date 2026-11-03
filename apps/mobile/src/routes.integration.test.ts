import { useSyncExternalStore } from 'react'
import { act, fireEvent, renderRouter, screen } from 'expo-router/testing-library'
import { api } from './lib/api'
import { useSession } from './lib/session-store'
import { holdTarget, takeHeldTarget } from './lib/held-target'

jest.mock('./app/play/[sessionId]/index', () => ({ __esModule: true, default: () => null }))
jest.mock('@expo-google-fonts/inter', () => ({ useFonts: () => [true, null] }))
jest.mock('expo-splash-screen', () => ({ preventAutoHideAsync: jest.fn(), hideAsync: jest.fn() }))
jest.mock('expo-notifications', () => ({
  DEFAULT_ACTION_IDENTIFIER: 'expo.modules.notifications.actions.DEFAULT',
  getLastNotificationResponseAsync: jest.fn(async () => null),
  addNotificationResponseReceivedListener: jest.fn(() => ({ remove: jest.fn() })),
}))
jest.mock('./lib/session-store', () => ({
  SessionProvider: ({ children }: { children: unknown }) => children,
  useSession: jest.fn(),
}))
jest.mock('./lib/api', () => ({ api: jest.fn() }))
// Authentication and Profile's sign-out need the native secure store.
jest.mock('./lib/auth', () => ({
  signIn: jest.fn(), signUp: jest.fn(), signOut: jest.fn(), acceptInvitation: jest.fn(),
  subscribeAuth: jest.fn(() => () => {}),
}))
// The real Today screen loads /today; this file only checks that the route is reachable.
jest.mock('./app/(tabs)/today', () => ({
  __esModule: true,
  default: () => require('react').createElement(require('react-native').Text, null, 'Today screen'),
}))
jest.mock('react-native-gesture-handler', () => ({ GestureHandlerRootView: 'View' }))
jest.mock('react-native-keyboard-controller', () => ({
  KeyboardProvider: 'View',
  KeyboardAvoidingView: require('react-native').View,
  KeyboardAwareScrollView: require('react-native').ScrollView,
  useKeyboardState: () => false,
}))
jest.mock('expo-router/build/toolbar/native', () => ({ RouterToolbarHost: 'View', RouterToolbarItem: 'View' }))
jest.mock(require.resolve('expo-glass-effect', { paths: [require.resolve('expo-router')] }), () => ({
  GlassView: 'View', isLiquidGlassAvailable: () => false, isGlassEffectAPIAvailable: () => false,
}))
// The real join screen fetches its invite; this file only checks that the route is reachable.
jest.mock('./app/join/[invitationId]', () => ({
  __esModule: true,
  default: () => require('react').createElement(require('react-native').Text, null, 'Join'),
}))
jest.mock('expo-constants', () => ({
  __esModule: true, default: { executionEnvironment: 'standalone', expoConfig: { scheme: 'learnquiz' } },
}))

const signedOut = { status: 'signedOut' as const, user: null, needsDisclosure: false, branding: null,
  refresh: jest.fn(), setDisclosed: jest.fn() }
const ready = { ...signedOut, status: 'ready' as const, user: { id: 'u1', name: 'Learner', isAnonymous: false } }

beforeEach(() => { takeHeldTarget(); jest.mocked(api).mockReset() })
afterEach(() => { jest.useRealTimers() })

test('the actual router sends a signed-out private link to sign-in', async () => {
  jest.mocked(useSession).mockReturnValue(signedOut)
  const navigation = renderRouter('src/app', { initialUrl: '/settings' })
  await navigation
  expect(navigation.getPathname()).toBe('/sign-in')
  expect(screen.getByRole('header', { name: 'Sign in' })).toBeOnTheScreen()
  expect(screen.queryByText('Settings')).toBeNull()
})

test('sign-in prefills an editable email from the route without offering account creation', async () => {
  jest.mocked(useSession).mockReturnValue(signedOut)
  await renderRouter('src/app', { initialUrl: '/sign-in?email=returning%40example.com' })
  const email = screen.getByLabelText('Email')
  expect(email).toHaveProp('value', 'returning@example.com')
  expect(email).toHaveProp('keyboardType', 'email-address')
  expect(email).toHaveProp('autoComplete', 'email')
  expect(email).toHaveProp('autoCapitalize', 'none')
  expect(email).toHaveProp('autoCorrect', false)
  expect(screen.queryByText('Create an account')).toBeNull()
  expect(screen.queryByLabelText('Your name')).toBeNull()
  expect(screen.getByRole('button', { name: 'Sign in' })).toBeDisabled()
  await fireEvent.changeText(email, 'another@example.com')
  expect(screen.getByLabelText('Email')).toHaveProp('value', 'another@example.com')
  await fireEvent.changeText(screen.getByLabelText('Password'), 'password')
  expect(screen.getByRole('button', { name: 'Sign in' })).toBeEnabled()
  await fireEvent.changeText(email, '')
  expect(screen.getByRole('button', { name: 'Sign in' })).toBeDisabled()
})

test('the actual router sends an undisclosed private link to welcome', async () => {
  jest.mocked(useSession).mockReturnValue({ ...ready, needsDisclosure: true })
  const navigation = renderRouter('src/app', { initialUrl: '/play/session-1' })
  await navigation
  expect(navigation.getPathname()).toBe('/welcome')
  expect(screen.getByText('Before you start')).toBeOnTheScreen()
  expect(screen.getByRole('link', { name: 'Read the full privacy notice' })).toBeOnTheScreen()
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
  const setDisclosed = () => {
    snapshot = ready
    listeners.forEach((listener) => listener())
  }
  await transition({ ...ready, needsDisclosure: true, setDisclosed })
  expect(navigation.getPathname()).toBe('/welcome')
  jest.mocked(api).mockResolvedValue({ roleTopicId: null })
  await fireEvent.press(screen.getByRole('button', { name: 'Got it' }))
  expect(api).toHaveBeenCalledWith('/disclosure', { method: 'POST', body: {} })
  expect(navigation.getPathname()).toBe('/play/session-1')
  expect(navigation.getSearchParams()).toMatchObject({ from: 'notification' })
  expect(takeHeldTarget()).toBeNull()
})

function liveSession(initial: ReturnType<typeof useSession>) {
  let snapshot = initial
  const listeners = new Set<() => void>()
  const subscribe = (listener: () => void) => { listeners.add(listener); return () => { listeners.delete(listener) } }
  jest.mocked(useSession).mockImplementation(() => useSyncExternalStore(subscribe, () => snapshot))
  return {
    set(next: ReturnType<typeof useSession>) { snapshot = next; listeners.forEach((listener) => listener()) },
  }
}

function undisclosed(session: ReturnType<typeof liveSession>) {
  return { ...ready, needsDisclosure: true, setDisclosed: () => session.set(ready) }
}

test('Got it falls back to Today when the held link still cannot open', async () => {
  const session = liveSession(ready)
  session.set(undisclosed(session))
  holdTarget('/sign-in')
  const navigation = renderRouter('src/app', { initialUrl: '/' })
  await navigation
  expect(navigation.getPathname()).toBe('/welcome')
  jest.mocked(api).mockResolvedValue({ roleTopicId: null })
  await fireEvent.press(screen.getByRole('button', { name: 'Got it' }))
  expect(api).toHaveBeenCalledTimes(1)
  expect(navigation.getPathname()).toBe('/today')
  expect(screen.getByText('Today screen')).toBeOnTheScreen()
})

test('Got it can be retried after a failed save and then opens the held link', async () => {
  const session = liveSession(ready)
  session.set(undisclosed(session))
  holdTarget('/settings')
  const navigation = renderRouter('src/app', { initialUrl: '/' })
  await navigation
  expect(navigation.getPathname()).toBe('/welcome')
  jest.mocked(api).mockRejectedValueOnce(new Error('network down')).mockResolvedValueOnce({ roleTopicId: null })
  await fireEvent.press(screen.getByRole('button', { name: 'Got it' }))
  expect(screen.getByText("Couldn't save. Check your connection and try again.")).toBeOnTheScreen()
  expect(navigation.getPathname()).toBe('/welcome')
  await fireEvent.press(screen.getByRole('button', { name: 'Got it', disabled: false }))
  expect(api).toHaveBeenCalledTimes(2)
  expect(navigation.getPathname()).toBe('/settings')
})

test('Got it sends one acknowledge while the first tap is pending', async () => {
  const session = liveSession(ready)
  session.set(undisclosed(session))
  const navigation = renderRouter('src/app', { initialUrl: '/welcome' })
  await navigation
  let resolve!: (value: unknown) => void
  jest.mocked(api).mockReturnValue(new Promise((done) => { resolve = done }) as ReturnType<typeof api>)
  const gotIt = screen.getByRole('button', { name: 'Got it' })
  await fireEvent.press(gotIt)
  await fireEvent.press(gotIt)
  expect(api).toHaveBeenCalledTimes(1)
  expect(screen.getByRole('button', { name: 'Got it', busy: true })).toBeDisabled()
  await act(async () => { resolve({ roleTopicId: null }) })
  expect(navigation.getPathname()).toBe('/today')
})

test('review mode from Profile shows the branded copy and Got it returns without acknowledging', async () => {
  jest.mocked(useSession).mockReturnValue({ ...ready, branding: { name: 'Northwind', accent: null, logoUrl: null } })
  const navigation = renderRouter('src/app', { initialUrl: '/profile' })
  await navigation
  await fireEvent.press(screen.getByRole('link', { name: 'What we record' }))
  expect(navigation.getPathname()).toBe('/welcome')
  expect(screen.getByText('You and Northwind’s training admins.')).toBeOnTheScreen()
  await fireEvent.press(screen.getByRole('button', { name: 'Got it' }))
  expect(api).not.toHaveBeenCalled()
  expect(navigation.getPathname()).toBe('/profile')
  expect(screen.getByRole('header', { name: 'Training progress' })).toBeOnTheScreen()
})
