import { act, fireEvent, renderRouter, screen } from 'expo-router/testing-library'
import * as SecureStore from 'expo-secure-store'
import { todayFixtures } from '@learnquiz/api/today'
import { getToken, signIn } from './lib/auth'

// The real root layout, session store, auth and Settings screen; only native
// modules, fetch and the screens around Profile are fakes.
let mockSignInMounts = 0
jest.mock('./app/(auth)/sign-in', () => ({
  __esModule: true,
  default: function SignIn() {
    require('react').useEffect(() => { mockSignInMounts++ }, [])
    return require('react').createElement(require('react-native').Text, null, 'Sign-in screen')
  },
}))
jest.mock('./app/(tabs)/today', () => ({ __esModule: true, default: () => null }))
jest.mock('./app/play/[sessionId]/index', () => ({ __esModule: true, default: () => null }))
jest.mock('expo-secure-store', () => ({
  getItemAsync: jest.fn(async () => 'token-a'),
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

const replies: Record<string, { data: unknown; token?: string }> = {
  '/api/auth/sign-in/email': { data: {}, token: 'token-a' },
  '/api/v1/session': { data: { user: { id: 'user-a', name: 'Ana', isAnonymous: false }, needsDisclosure: false } },
  // The tab bar loads Today to decide whether Path is open.
  '/api/v1/today': { data: todayFixtures.normal },
  '/api/v1/branding': { data: null },
  '/api/v1/me/profile': { data: { name: 'Ana', role: null, started: true, mastery: 0.66, benchmark: 0.85,
    onboarding: { day: 16, days: 30 }, proficiency: { achievedAt: null, projectedAt: null }, weeks: [], units: [], confidentErrors: [] } },
  '/api/auth/get-session': { data: { user: { email: 'ana@example.com' } } },
  '/api/v1/push/settings': { data: { prefs: { paused: false, startMinute: 420, endMinute: 930, days: [1, 2], timezone: 'UTC' }, company: null } },
  '/api/auth/sign-out': { data: {} },
}
globalThis.fetch = jest.fn(async (input: RequestInfo | URL) => {
  const reply = replies[new URL(String(input)).pathname]
  return { ok: true, status: 200, text: async () => JSON.stringify(reply?.data ?? null),
    headers: { get: (name: string) => (name === 'set-auth-token' ? reply?.token ?? null : null) } } as unknown as Response
}) as typeof fetch

beforeEach(async () => {
  // expo-router installs its Reanimated mock after imports; supply the missing native hook.
  require('react-native-reanimated').useReducedMotion = () => true
  mockSignInMounts = 0
  jest.mocked(SecureStore.deleteItemAsync).mockReset().mockResolvedValue()
  await signIn('ana@example.com', 'password')
})

test.each([
  ['succeeds', () => {}],
  ['fails', () => { jest.mocked(SecureStore.deleteItemAsync).mockRejectedValue(new Error('Keystore unavailable')) }],
])('when sign-out cleanup %s, Settings lands on sign-in once with no unhandled rejection', async (_name, arrange) => {
  const unhandled = jest.fn()
  process.on('unhandledRejection', unhandled)
  try {
    const navigation = renderRouter('src/app', { initialUrl: '/profile' })
    await navigation
    expect(await screen.findByText('Ana')).toBeOnTheScreen()

    expect(screen.queryByRole('link', { name: 'What we record' })).toBeNull()
    expect(screen.queryByRole('button', { name: 'Sign out' })).toBeNull()
    await fireEvent.press(screen.getByRole('button', { name: 'Settings' }))
    expect(await screen.findByRole('header', { name: 'Settings' })).toBeOnTheScreen()

    arrange()
    await fireEvent.press(screen.getByRole('button', { name: 'Sign out' }))
    expect(await screen.findByText('Sign-in screen')).toBeOnTheScreen()
    // Let the rest of the press handler and any later navigation run.
    await act(async () => { await jest.advanceTimersByTimeAsync(1_000) })

    expect(navigation.getPathname()).toBe('/sign-in')
    expect(mockSignInMounts).toBe(1)
    expect(getToken()).toBeNull()
    expect(SecureStore.deleteItemAsync).toHaveBeenCalledWith('lq.token')
    expect(unhandled).not.toHaveBeenCalled()
  } finally {
    process.off('unhandledRejection', unhandled)
  }
})


test.each([false, true])('Profile shows company-admin visibility only for companyMember=%s', async (companyMember) => {
  replies['/api/v1/session'].data = {
    user: { id: 'user-a', name: 'Ana', isAnonymous: false }, needsDisclosure: false, companyMember,
  }
  try {
    const navigation = renderRouter('src/app', { initialUrl: '/profile' })
    await navigation
    expect(await screen.findByText('Ana')).toBeOnTheScreen()
    const visibility = screen.queryByText("Your company's training admins see this same page.")
    if (companyMember) expect(visibility).toBeOnTheScreen()
    else expect(visibility).toBeNull()
  } finally {
    replies['/api/v1/session'].data = {
      user: { id: 'user-a', name: 'Ana', isAnonymous: false }, needsDisclosure: false,
    }
  }
})
