import { act, fireEvent, renderRouter, screen } from 'expo-router/testing-library'
import { router } from 'expo-router'
import * as SecureStore from 'expo-secure-store'
import { todayFixtures } from '@learnquiz/api/today'
import { acceptInvitation, getToken, signIn, signOut } from './lib/auth'
import { holdTarget, peekHeldTarget } from './lib/held-target'
import { setJSON } from './lib/kv'
import { tokenFingerprint } from './lib/token-fingerprint'

// The real root layout, session store, auth, kv, Today hook and Today cache.
// Every useSession() call is recorded with the bearer that was live at that moment.
const mockSeen: { status: string; userId: string | null; token: string | null }[] = []
jest.mock('./lib/session-store', () => {
  const actual = jest.requireActual('./lib/session-store')
  const auth = jest.requireActual('./lib/auth')
  return {
    ...actual,
    useSession: () => {
      const session = actual.useSession()
      mockSeen.push({ status: session.status, userId: session.user?.id ?? null, token: auth.getToken() })
      return session
    },
  }
})
// Today's real data hook and cache, without the full Today UI.
jest.mock('./app/(tabs)/today', () => ({
  __esModule: true,
  default: function TodayProbe() {
    const { today } = require('./lib/today').useToday()
    return require('react').createElement(require('react-native').Text, null, `today:${today?.topic?.title ?? '-'}`)
  },
}))
jest.mock('./app/play/[sessionId]/index', () => ({ __esModule: true, default: () => null }))
jest.mock('expo-secure-store', () => ({
  getItemAsync: jest.fn(async (key: string) => (key === 'lq.token' ? 'token-a' : null)),
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

const ana = { id: 'user-a', name: 'Ana', isAnonymous: false }
const bo = { id: 'user-b', name: 'Bo', isAnonymous: false }
type Reply = { data: unknown; token?: string }
function response({ data, token }: Reply): Response {
  return { ok: true, status: 200, text: async () => JSON.stringify(data),
    headers: { get: (name: string) => (name === 'set-auth-token' ? token ?? null : null) } } as unknown as Response
}
function deferred() {
  let resolve!: (reply: Reply) => void
  const promise = new Promise<Response>((done) => { resolve = (reply) => done(response(reply)) })
  return { promise, resolve }
}
// Path -> (bearer) -> reply. /api/v1/today never answers, so Today can only show its cache.
let routes: Record<string, (bearer: string | null) => Promise<Response>>
globalThis.fetch = jest.fn((input: RequestInfo | URL, init?: RequestInit) => {
  const authorization = (init?.headers as Record<string, string> | undefined)?.Authorization
  const route = routes[new URL(String(input)).pathname]
  return route ? route(authorization?.replace('Bearer ', '') ?? null) : new Promise<Response>(() => {})
}) as typeof fetch

const flush = () => act(async () => { for (let i = 0; i < 20; i++) await Promise.resolve() })
beforeEach(() => { mockSeen.length = 0 })
// Renders that ran under B's bearer with anything but B's own confirmed session.
const underBo = () => mockSeen.filter((seen) => seen.token === 'token-b')
const leaked = () => mockSeen.filter((seen) => seen.token === 'token-b' && seen.userId !== 'user-b' &&
  (seen.status === 'ready' || seen.userId !== null))

// Ana signed in on Profile, with her same-day Today cache on the phone.
async function anaOnProfile(sessionFor: Record<string, () => Promise<Response>>) {
  let nextToken = 'token-a'
  routes = {
    '/api/v1/session': (bearer) => sessionFor[bearer ?? '']?.() ?? new Promise(() => {}),
    '/api/v1/branding': async () => response({ data: null }),
    '/api/auth/sign-in/email': async () => response({ data: {}, token: nextToken }),
    '/api/auth/organization/accept-invitation': async () => response({ data: {} }),
  }
  // Each test starts with Ana's bearer, whatever the previous test left in auth.
  await signIn('ana@example.com', 'password')
  nextToken = 'token-b'
  const navigation = renderRouter('src/app', { initialUrl: '/profile' })
  await navigation
  expect(await screen.findByText('Ana')).toBeOnTheScreen()
  const day = new Date().toISOString().slice(0, 10)
  await setJSON('lq:today:user-a', { userId: 'user-a', day, branding: null,
    today: { ...todayFixtures.normal, topic: { ...todayFixtures.normal.topic!, title: "Ana's private topic" } } })
  return navigation
}

test("B's sign-in leaves A's session at once: while B's /session stalls nothing of A's shows", async () => {
  const forBo = deferred()
  await anaOnProfile({ 'token-a': async () => response({ data: { user: ana, needsDisclosure: false } }), 'token-b': () => forBo.promise })

  await act(async () => { await signIn('bo@example.com', 'password') })
  expect(getToken()).toBe('token-b')
  // The Profile already on screen stops showing Ana in the same update.
  expect(screen.queryByText('Ana')).toBeNull()
  // A Today screen opened now must not read or show Ana's cache.
  await act(async () => { router.navigate('/today') })
  await flush()
  expect(screen.queryByText("today:Ana's private topic")).toBeNull()
  expect(screen.queryByText('Ana')).toBeNull()
  expect(underBo().length).toBeGreaterThan(0)
  expect(leaked()).toEqual([])
  expect(mockSeen.at(-1)).toMatchObject({ status: 'loading', userId: null, token: 'token-b' })

  // B's /session answers: ready as Bo, and Today opens with Bo's (empty) data.
  await act(async () => { forBo.resolve({ data: { user: bo, needsDisclosure: false } }) })
  await flush()
  expect(mockSeen.at(-1)).toMatchObject({ status: 'ready', userId: 'user-b', token: 'token-b' })
  await act(async () => { router.navigate('/today') })
  expect(await screen.findByText('today:-')).toBeOnTheScreen()
  expect(leaked()).toEqual([])
})

test("a late /session answer for A's old token after B's sign-in is ignored", async () => {
  let anaCalls = 0
  const lateForAna = deferred()
  const forBo = deferred()
  await anaOnProfile({
    'token-a': () => (++anaCalls === 1 ? Promise.resolve(response({ data: { user: ana, needsDisclosure: false } })) : lateForAna.promise),
    'token-b': () => forBo.promise,
  })
  // A second /session for Ana's token is in flight (a join accept refreshes the session).
  await act(async () => { await acceptInvitation('invitation-1') })
  expect(anaCalls).toBe(2)
  await act(async () => { await signIn('bo@example.com', 'password') })

  // Applying it would re-render as Ana under Bo's bearer; ignoring it renders nothing.
  await act(async () => { lateForAna.resolve({ data: { user: ana, needsDisclosure: false } }) })
  await flush()
  expect(leaked()).toEqual([])
  expect(mockSeen.some((seen) => seen.status === 'ready' && seen.userId === 'user-a' && seen.token === 'token-b')).toBe(false)
  expect(mockSeen.at(-1)).toMatchObject({ status: 'loading', userId: null })

  await act(async () => { forBo.resolve({ data: { user: bo, needsDisclosure: false } }) })
  await flush()
  expect(mockSeen.at(-1)).toMatchObject({ status: 'ready', userId: 'user-b', token: 'token-b' })
  expect(underBo().length).toBeGreaterThan(0)
  expect(leaked()).toEqual([])
  expect(SecureStore.deleteItemAsync).not.toHaveBeenCalledWith('lq.token')
})

test('sign-in with a held unit while B\'s /session stalls: loading shows nothing signed in, then one replace opens the unit', async () => {
  const forBo = deferred()
  routes = {
    '/api/v1/session': (bearer) => (bearer === 'token-b' ? forBo.promise : new Promise(() => {})),
    '/api/v1/branding': async () => response({ data: null }),
    '/api/auth/sign-in/email': async () => response({ data: {}, token: 'token-b' }),
  }
  // Signed out, with Ana's saved session and Today cache left on the phone (a cleanup that failed).
  await signOut()
  const day = new Date().toISOString().slice(0, 10)
  await setJSON('lq:session', { owner: tokenFingerprint('token-a'), user: ana, needsDisclosure: false, branding: null })
  await setJSON('lq:today:user-a', { userId: 'user-a', day, branding: null,
    today: { ...todayFixtures.normal, topic: { ...todayFixtures.normal.topic!, title: "Ana's private topic" } } })

  const navigation = renderRouter('src/app', { initialUrl: '/sign-in' })
  await navigation
  expect(await screen.findByRole('header', { name: 'Sign in' })).toBeOnTheScreen()
  await fireEvent.changeText(screen.getByLabelText('Email'), 'bo@example.com')
  await fireEvent.changeText(screen.getByLabelText('Password'), 'password')
  holdTarget('/unit/u1')
  const replace = jest.spyOn(router, 'replace')
  await fireEvent.press(screen.getByRole('button', { name: 'Sign in' }))
  await flush()

  // Loading for Bo's bearer: no signed-in screen, nothing of Ana's, no navigation yet.
  expect(getToken()).toBe('token-b')
  expect(mockSeen.at(-1)).toMatchObject({ status: 'loading', userId: null, token: 'token-b' })
  expect(underBo().length).toBeGreaterThan(0)
  expect(leaked()).toEqual([])
  expect(navigation.getPathname()).toBe('/')
  for (const text of ['Unit', 'Training progress', 'Ana', "today:Ana's private topic"]) expect(screen.queryByText(text)).toBeNull()
  expect(screen.queryByRole('header', { name: 'Sign in' })).toBeNull()
  expect(replace).not.toHaveBeenCalled()
  expect(peekHeldTarget()).toBe('/unit/u1')

  await act(async () => { forBo.resolve({ data: { user: bo, needsDisclosure: false } }) })
  await flush()
  expect(navigation.getPathname()).toBe('/unit/u1')
  expect(screen.getByText('Unit')).toBeOnTheScreen()
  expect(replace.mock.calls.map(([target]) => target)).toEqual(['/unit/u1'])
  expect(peekHeldTarget()).toBeNull()
  expect(mockSeen.at(-1)).toMatchObject({ status: 'ready', userId: 'user-b', token: 'token-b' })
  expect(leaked()).toEqual([])
  replace.mockRestore()
})
