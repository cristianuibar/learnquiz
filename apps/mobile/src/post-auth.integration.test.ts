import { act, fireEvent, renderRouter, screen } from 'expo-router/testing-library'
import { router } from 'expo-router'
import { Linking } from 'react-native'
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
jest.mock('expo-secure-store', () => {
  const values = new Map<string, string>()
  return {
    getItemAsync: jest.fn(async (key: string) => values.get(key) ?? null),
    setItemAsync: jest.fn(async (key: string, value: string) => { values.set(key, value) }),
    deleteItemAsync: jest.fn(async (key: string) => { values.delete(key) }),
  }
})
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
let facebookEnabled = false
const facebookState = 'a'.repeat(64)
const facebookCode = 'b'.repeat(64)
const facebookVerifier = 'c'.repeat(64)
const replies: Record<string, () => { data: unknown; token?: string }> = {
  '/api/v1/auth/capabilities': () => ({ data: { facebook: facebookEnabled } }),
  '/api/v1/auth/facebook/prepare': () => ({ data: { state: facebookState, verifier: facebookVerifier, expiresAt: Date.now() + 300_000, url: 'https://app.learnquiz.com/api/v1/auth/facebook/start?state=' + facebookState } }),
  '/api/v1/auth/facebook/exchange': () => ({ data: { token: 'facebook-bearer', user: { id: 'user-a' } } }),
  '/api/auth/organization/accept-invitation': () => ({ data: {} }),
  '/api/auth/sign-in/email': () => ({ data: {}, token: 'token-a' }),
  '/api/v1/session': () => ({ data: { user: { id: 'user-a', name: 'Ana', isAnonymous: false }, needsDisclosure } }),
  '/api/v1/branding': () => ({ data: null }),
  '/api/v1/invites/inv-1': () => ({ data: invite }),
}
// Anything else (the unit, push) never answers.
globalThis.fetch = jest.fn((input: RequestInfo | URL) => {
  const reply = replies[new URL(String(input)).pathname]?.()
  if (!reply) return new Promise<Response>(() => {})
  return Promise.resolve({ ok: true, status: 200, text: async () => JSON.stringify(reply.data),
    headers: { get: (name: string) => (name === 'set-auth-token' ? reply.token ?? null : null) } } as unknown as Response)
}) as typeof fetch

const flush = () => act(async () => { for (let i = 0; i < 20; i++) await Promise.resolve() })
const setIndexOpen = (open: boolean) => { mockIndexOpen = open; mockIndexListeners.forEach((listener) => listener()) }

beforeEach(async () => {
  await signOut()
  releaseReplayHolds()
  takeHeldTarget()
  needsDisclosure = false
  facebookEnabled = false
  jest.spyOn(Linking, 'openURL').mockResolvedValue(true)
  mockIndexOpen = true
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

test('hides Facebook when disabled and keeps email sign-in available', async () => {
  await renderRouter('src/app', { initialUrl: '/sign-in' })
  await flush()
  expect(screen.queryByRole('button', { name: 'Continue with Facebook' })).toBeNull()
  expect(screen.getByLabelText('Email')).toBeOnTheScreen()
  expect(screen.getByRole('button', { name: 'Sign in' })).toBeOnTheScreen()
})

async function openFacebook() {
  await fireEvent.press(await screen.findByRole('button', { name: 'Continue with Facebook' }))
  await flush()
  expect(Linking.openURL).toHaveBeenCalledWith('https://app.learnquiz.com/api/v1/auth/facebook/start?state=' + facebookState)
}
async function facebookReturn() {
  await act(async () => { router.push(`/sign-in?facebookState=${facebookState}&facebookCode=${facebookCode}`) })
  await flush()
}

test('exchanges the browser code, stores the bearer and opens Today', async () => {
  facebookEnabled = true
  const navigation = renderRouter('src/app', { initialUrl: '/sign-in' })
  await navigation
  await openFacebook()
  expect(getToken()).toBeNull()
  await facebookReturn()
  expect(getToken()).toBe('facebook-bearer')
  expect(navigation.getPathname()).toBe('/today')
  expect(screen.getByText('Today screen')).toBeOnTheScreen()
  expect(fetch).toHaveBeenCalledWith('https://app.learnquiz.com/api/v1/auth/facebook/exchange', expect.objectContaining({
    body: JSON.stringify({ code: facebookCode, verifier: facebookVerifier, redirectUri: 'learnquiz://sign-in' }),
  }))
})

test('Facebook from an invite accepts it and follows the email disclosure destination', async () => {
  facebookEnabled = true
  needsDisclosure = true
  const navigation = renderRouter('src/app', { initialUrl: '/join/inv-1' })
  await navigation
  expect(await screen.findByRole('header', { name: 'Train as a warehouse picker' })).toBeOnTheScreen()
  await openFacebook()
  await facebookReturn()
  expect(getToken()).toBe('facebook-bearer')
  expect(fetch).toHaveBeenCalledWith('https://app.learnquiz.com/api/auth/organization/accept-invitation', expect.objectContaining({
    body: JSON.stringify({ invitationId: 'inv-1' }), headers: expect.objectContaining({ Authorization: 'Bearer facebook-bearer' }),
  }))
  expect(navigation.getPathname()).toBe('/welcome')
  expect(screen.getByText('Before you start')).toBeOnTheScreen()
})

test('a persisted Facebook attempt can complete after a cold app launch', async () => {
  const store = require('expo-secure-store') as typeof import('expo-secure-store')
  await store.setItemAsync('lq.facebook.pending', JSON.stringify({
    state: facebookState, verifier: facebookVerifier, expiresAt: Date.now() + 300_000, target: null,
  }))
  const navigation = renderRouter('src/app', { initialUrl: `/sign-in?facebookState=${facebookState}&facebookCode=${facebookCode}` })
  await navigation
  await flush()
  expect(getToken()).toBe('facebook-bearer')
  expect(navigation.getPathname()).toBe('/today')
  expect(await store.getItemAsync('lq.facebook.pending')).toBeNull()
})

test('cancelling Facebook shows an actionable error and keeps the learner signed out', async () => {
  facebookEnabled = true
  const navigation = renderRouter('src/app', { initialUrl: '/sign-in' })
  await navigation
  await openFacebook()
  await act(async () => { router.push(`/sign-in?facebookState=${facebookState}&facebookError=cancelled`) })
  await flush()
  expect(getToken()).toBeNull()
  expect(navigation.getPathname()).toBe('/sign-in')
  expect(screen.getByText('Facebook sign-in was cancelled. Please try again.')).toBeOnTheScreen()
  expect(screen.getByLabelText('Email')).toBeOnTheScreen()
})
