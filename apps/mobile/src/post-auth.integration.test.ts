import { act, fireEvent, renderRouter, screen } from 'expo-router/testing-library'
import { router } from 'expo-router'
import { getToken, signOut } from './lib/auth'
import { holdTarget, peekHeldTarget, releaseReplayHolds, takeHeldTarget } from './lib/held-target'

// #536: who makes the post-auth decision. The real root layout, session store,
// auth, sign-in, index and Join screens; only native modules and fetch are fakes.

// Index can be held back so that its focus effect runs only after the layout's
// effect has seen '/'. On a phone the focus event can arrive after that effect;
// in jest a child effect otherwise always runs first.
let mockIndexOpen = true
const mockIndexListeners = new Set<() => void>()
jest.mock('./app/index', () => {
  const React = require('react')
  const actual = jest.requireActual('./app/index')
  const subscribe = (listener: () => void) => { mockIndexListeners.add(listener); return () => { mockIndexListeners.delete(listener) } }
  return {
    __esModule: true,
    default: function LateIndex() {
      const open = React.useSyncExternalStore(subscribe, () => mockIndexOpen)
      return open ? React.createElement(actual.default) : null
    },
  }
})
jest.mock('./app/(tabs)/today', () => ({
  __esModule: true,
  default: () => require('react').createElement(require('react-native').Text, null, 'Today screen'),
}))
jest.mock('./app/play/[sessionId]/index', () => ({ __esModule: true, default: () => null }))
jest.mock('expo-secure-store', () => ({
  getItemAsync: jest.fn(async () => null),
  setItemAsync: jest.fn(async () => {}),
  deleteItemAsync: jest.fn(async () => {}),
}))
jest.mock('expo-sqlite/kv-store', () => {
  const values = new Map<string, string>()
  return { AsyncStorage: {
    getItemAsync: async (key: string) => values.get(key) ?? null,
    setItemAsync: async (key: string, value: string) => { values.set(key, value) },
    removeItemAsync: async (key: string) => values.delete(key),
    getAllKeysAsync: async () => [...values.keys()],
  } }
})
jest.mock('expo-image', () => ({ Image: () => null }))
jest.mock('@expo-google-fonts/inter', () => ({ useFonts: () => [true, null] }))
jest.mock('expo-splash-screen', () => ({ preventAutoHideAsync: jest.fn(), hideAsync: jest.fn() }))
jest.mock('expo-notifications', () => ({
  DEFAULT_ACTION_IDENTIFIER: 'expo.modules.notifications.actions.DEFAULT',
  getLastNotificationResponseAsync: jest.fn(async () => null),
  addNotificationResponseReceivedListener: jest.fn(() => ({ remove: jest.fn() })),
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
jest.mock('expo-constants', () => ({
  __esModule: true, default: { executionEnvironment: 'standalone', expoConfig: { scheme: 'learnquiz' } },
}))

const invite = {
  company: 'Northwind Logistics', email: 'jordan@northwind.example', name: 'Jordan Reyes', status: 'pending',
  otherAccount: false, roleName: 'Warehouse picker', accent: null, logoUrl: null,
}
let needsDisclosure = false
type Reply = { data: unknown; token?: string; status?: number }
const replies: Record<string, () => Reply | Promise<Reply>> = {
  '/api/auth/sign-in/email': () => ({ data: {}, token: 'token-a' }),
  '/api/v1/session': () => ({ data: { user: { id: 'user-a', name: 'Ana', isAnonymous: false }, needsDisclosure } }),
  '/api/v1/branding': () => ({ data: null }),
  '/api/v1/invites/inv-1': () => ({ data: invite }),
}
const baseReplies = { ...replies }
// Anything else (the unit, push) never answers.
globalThis.fetch = jest.fn(async (input: RequestInfo | URL) => {
  const make = replies[new URL(String(input)).pathname]
  if (!make) return new Promise<Response>(() => {})
  const reply = await make()
  const status = reply.status ?? 200
  return { ok: status < 400, status, text: async () => JSON.stringify(reply.data),
    headers: { get: (name: string) => (name === 'set-auth-token' ? reply.token ?? null : null) } } as unknown as Response
}) as typeof fetch

function deferred<T>() {
  let resolve!: (value: T) => void
  const promise = new Promise<T>((res) => { resolve = res })
  return { promise, resolve }
}

const flush = () => act(async () => { for (let i = 0; i < 20; i++) await Promise.resolve() })
const setIndexOpen = (open: boolean) => { mockIndexOpen = open; mockIndexListeners.forEach((listener) => listener()) }

beforeEach(async () => {
  await signOut()
  releaseReplayHolds()
  takeHeldTarget()
  needsDisclosure = false
  mockIndexOpen = true
  for (const path of Object.keys(replies)) if (!(path in baseReplies)) delete replies[path]
})
afterEach(() => { jest.restoreAllMocks() })

async function submitSignIn() {
  await fireEvent.changeText(screen.getByLabelText('Email'), 'ana@example.com')
  await fireEvent.changeText(screen.getByLabelText('Password'), 'password')
  await fireEvent.press(screen.getByRole('button', { name: 'Sign in' }))
  await flush()
  expect(getToken()).toBe('token-a')
}

test("the layout leaves '/' to index even when its effect sees '/' before index's focus", async () => {
  const navigation = renderRouter('src/app', { initialUrl: '/sign-in' })
  await navigation
  expect(await screen.findByRole('header', { name: 'Sign in' })).toBeOnTheScreen()
  holdTarget('/unit/u1')
  const replace = jest.spyOn(router, 'replace')
  setIndexOpen(false)
  await submitSignIn()

  // Ready on '/', and index has not decided yet: the layout must not replay the link.
  expect(navigation.getPathname()).toBe('/')
  expect(replace).not.toHaveBeenCalled()
  expect(peekHeldTarget()).toBe('/unit/u1')

  // Index's focus arrives and makes the single decision.
  await act(async () => { setIndexOpen(true) })
  await flush()
  expect(navigation.getPathname()).toBe('/unit/u1')
  expect(replace.mock.calls.map(([target]) => target)).toEqual(['/unit/u1'])
  expect(peekHeldTarget()).toBeNull()
})

async function signInOverJoin(held: string | null) {
  const navigation = renderRouter('src/app', { initialUrl: '/join/inv-1' })
  await navigation
  expect(await screen.findByRole('header', { name: 'Train as a warehouse picker' })).toBeOnTheScreen()
  // A warm link to sign-in opens over the invitation.
  await act(async () => { router.push('/sign-in') })
  expect(navigation.getPathname()).toBe('/sign-in')
  if (held) holdTarget(held)
  const replace = jest.spyOn(router, 'replace')
  await submitSignIn()
  return { navigation, replace }
}

test('signing in over Join without a held link goes on to Today through index', async () => {
  const { navigation, replace } = await signInOverJoin(null)
  expect(navigation.getPathname()).toBe('/today')
  expect(screen.getByText('Today screen')).toBeOnTheScreen()
  expect(replace.mock.calls.map(([target]) => target)).toEqual(['/', '/(tabs)/today'])
})

test('signing in over Join with a held unit opens the unit once, decided by index', async () => {
  const { navigation, replace } = await signInOverJoin('/unit/u1')
  expect(navigation.getPathname()).toBe('/unit/u1')
  expect(replace.mock.calls.map(([target]) => target)).toEqual(['/', '/unit/u1'])
  expect(peekHeldTarget()).toBeNull()
})

test('signing in over Join that still needs Disclosure opens it and keeps the held link', async () => {
  needsDisclosure = true
  const { navigation, replace } = await signInOverJoin('/unit/u1')
  expect(navigation.getPathname()).toBe('/welcome')
  expect(screen.getByText('Before you start')).toBeOnTheScreen()
  expect(replace.mock.calls.map(([target]) => target)).toEqual(['/', '/welcome'])
  expect(peekHeldTarget()).toBe('/unit/u1')
})

test('going Back from sign-in to Join while signed out stays on Join', async () => {
  const navigation = renderRouter('src/app', { initialUrl: '/join/inv-1' })
  await navigation
  expect(await screen.findByRole('header', { name: 'Train as a warehouse picker' })).toBeOnTheScreen()
  await act(async () => { router.push('/sign-in') })
  const replace = jest.spyOn(router, 'replace')
  await act(async () => { router.back() })
  await flush()
  expect(navigation.getPathname()).toBe('/join/inv-1')
  expect(replace).not.toHaveBeenCalled()
  expect(screen.getByRole('button', { name: 'Create account' })).toBeOnTheScreen()
})

// #553: a warm sign-in link opens over Join while Join's own attempt runs. The
// protected sign-in screen can only be on top while signed out, so it opens
// during Join's sign-up and drops out once that sign-up stores its token, with
// the accept still in flight. Join, not the layout's handoff, owns what follows.
test('a sign-in link over Join while its accept runs leaves the failed accept on Join with its retry', async () => {
  const signUp = deferred<Reply>()
  const accept = deferred<Reply>()
  const accepted = jest.fn()
  replies['/api/auth/sign-up/email'] = () => signUp.promise
  replies['/api/auth/organization/accept-invitation'] = () => { accepted(); return accept.promise }
  const navigation = renderRouter('src/app', { initialUrl: '/join/inv-1' })
  await navigation
  expect(await screen.findByRole('header', { name: 'Train as a warehouse picker' })).toBeOnTheScreen()
  await fireEvent.changeText(screen.getByLabelText('Create a password'), 'correct horse')
  await fireEvent.press(screen.getByRole('button', { name: 'Create account' }))

  await act(async () => { router.push('/sign-in') })
  expect(navigation.getPathname()).toBe('/sign-in')
  const replace = jest.spyOn(router, 'replace')

  // Join's sign-up lands: the session turns ready, sign-in drops out over Join,
  // and the accept is still running.
  await act(async () => { signUp.resolve({ data: {}, token: 'token-a' }) })
  await flush()
  expect(getToken()).toBe('token-a')
  expect(accepted).toHaveBeenCalledTimes(1)
  expect(navigation.getPathname()).toBe('/join/inv-1')
  expect(replace).not.toHaveBeenCalled()

  await act(async () => { accept.resolve({ data: {}, status: 500 }) })
  await flush()
  expect(navigation.getPathname()).toBe('/join/inv-1')
  expect(replace).not.toHaveBeenCalled()
  expect(screen.getByText('Couldn’t join. Try again.')).toBeOnTheScreen()
  const retry = screen.getByRole('button', { name: 'Join Northwind Logistics' })
  expect(retry).toBeOnTheScreen()

  // The retry is Join's: it accepts again and goes on to Today.
  replies['/api/auth/organization/accept-invitation'] = () => { accepted(); return { data: {} } }
  await fireEvent.press(retry)
  await flush()
  expect(accepted).toHaveBeenCalledTimes(2)
  expect(navigation.getPathname()).toBe('/today')
  expect(replace.mock.calls.map(([target]) => target)).toEqual(['/(tabs)/today'])
})

test('after a failed Join sign-up, a sign-in link over the idle Join still hands off to index', async () => {
  replies['/api/auth/sign-up/email'] = () => ({ data: {}, status: 500 })
  const navigation = renderRouter('src/app', { initialUrl: '/join/inv-1' })
  await navigation
  expect(await screen.findByRole('header', { name: 'Train as a warehouse picker' })).toBeOnTheScreen()
  await fireEvent.changeText(screen.getByLabelText('Create a password'), 'correct horse')
  await fireEvent.press(screen.getByRole('button', { name: 'Create account' }))
  await flush()
  // Join's attempt ended on its error; the learner is still signed out.
  expect(screen.getByText('Couldn’t sign in. Try again.')).toBeOnTheScreen()
  expect(getToken()).toBeNull()

  await act(async () => { router.push('/sign-in') })
  expect(navigation.getPathname()).toBe('/sign-in')
  const replace = jest.spyOn(router, 'replace')
  await submitSignIn()
  expect(navigation.getPathname()).toBe('/today')
  expect(replace.mock.calls.map(([target]) => target)).toEqual(['/', '/(tabs)/today'])
})
