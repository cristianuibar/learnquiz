import { act, fireEvent, renderRouter, screen } from 'expo-router/testing-library'
import * as SecureStore from 'expo-secure-store'
import { todayFixtures } from '@learnquiz/api/today'
import { getToken, signIn } from './lib/auth'
import { unregisterPush } from './lib/push'
import { SIGN_OUT_WAIT_MS } from './lib/session-store'

// #541: every sign-out the learner can trigger ends signed out, even when the push
// unregistration (#500) never settles. The real root layout, session store, auth,
// Today and Join screens; only native modules, fetch and the push unregister are fakes.
jest.mock('./lib/push', () => ({ ...jest.requireActual('./lib/push'), unregisterPush: jest.fn() }))
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
  otherAccount: true, roleName: 'Warehouse picker', accent: null, logoUrl: null,
}
const replies: Record<string, { data: unknown; token?: string }> = {
  '/api/auth/sign-in/email': { data: {}, token: 'token-a' },
  '/api/auth/sign-out': { data: {} },
  '/api/v1/session': { data: { user: { id: 'user-a', name: 'Ana', isAnonymous: false }, needsDisclosure: false } },
  '/api/v1/branding': { data: null },
  // No role and no topic: Today shows its empty state with a Sign out link.
  '/api/v1/today': { data: { ...todayFixtures.normal, topic: null, role: null } },
  '/api/v1/invites/inv-1': { data: invite },
}
const fetchMock = jest.fn(async (input: RequestInfo | URL, _init?: RequestInit) => {
  const reply = replies[new URL(String(input)).pathname]
  return { ok: true, status: 200, text: async () => JSON.stringify(reply?.data ?? null),
    headers: { get: (name: string) => (name === 'set-auth-token' ? reply?.token ?? null : null) } } as unknown as Response
})
globalThis.fetch = fetchMock as unknown as typeof fetch
const revocations = () => fetchMock.mock.calls.filter(([url]) => String(url).endsWith('/api/auth/sign-out'))

beforeEach(async () => {
  fetchMock.mockClear()
  jest.mocked(SecureStore.deleteItemAsync).mockClear()
  // A stalled keystore or SQLite read while unregistering push: it never settles.
  jest.mocked(unregisterPush).mockReset().mockImplementation(() => new Promise<void>(() => {}))
  await signIn('ana@example.com', 'password')
})

async function signOutStalls(press: () => Promise<void>) {
  await press()
  expect(unregisterPush).toHaveBeenCalledTimes(1)
  // Before the sign-out wait runs out, the learner is still signed in.
  await act(async () => { await jest.advanceTimersByTimeAsync(SIGN_OUT_WAIT_MS - 1_000) })
  expect(getToken()).toBe('token-a')
  await act(async () => { await jest.advanceTimersByTimeAsync(2_000) })
  expect(getToken()).toBeNull()
  expect(SecureStore.deleteItemAsync).toHaveBeenCalledWith('lq.token')
  // The bearer is still revoked on the server, sent while it was current.
  expect(revocations()).toHaveLength(1)
  expect(revocations()[0][1]?.headers).toMatchObject({ Authorization: 'Bearer token-a' })
}

test("Today's empty-state sign-out ends signed out when the push unregister hangs", async () => {
  const navigation = renderRouter('src/app', { initialUrl: '/today' })
  await navigation
  expect(await screen.findByText('No training yet')).toBeOnTheScreen()

  await signOutStalls(() => fireEvent.press(screen.getByRole('button', { name: 'Sign out' })))
  expect(navigation.getPathname()).toBe('/sign-in')
  expect(screen.getByRole('header', { name: 'Sign in' })).toBeOnTheScreen()
})

test("Join's switch-account ends signed out when the push unregister hangs", async () => {
  const navigation = renderRouter('src/app', { initialUrl: '/join/inv-1' })
  await navigation
  const switchAccount = await screen.findByRole('button', { name: `Sign in as ${invite.email}` })
  expect(screen.getByText(`You’re signed in as Ana. This invite is for ${invite.email}.`)).toBeOnTheScreen()

  await signOutStalls(() => fireEvent.press(switchAccount))
  // Join stays open and returns to its own sign-in form for the invited email.
  expect(navigation.getPathname()).toBe('/join/inv-1')
  expect(screen.getByLabelText('Password')).toBeOnTheScreen()
  expect(screen.getByRole('button', { name: 'Sign in' })).toBeOnTheScreen()
  expect(screen.queryByText(/You’re signed in as Ana/)).toBeNull()
})
