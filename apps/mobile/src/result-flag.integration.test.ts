import { act, fireEvent, renderRouter, screen } from 'expo-router/testing-library'
import { todayFixtures } from '@learnquiz/api/today'
import { AccessibilityInfo } from 'react-native'
import { router } from 'expo-router'
import { signIn } from './lib/auth'

const Native: typeof import('react-native') = require('react-native')

// The real root layout, session store, auth and Profile screen; only native
// modules, fetch and the screens around Profile are fakes.
jest.mock('./app/(auth)/sign-in', () => ({
  __esModule: true,
  default: function SignIn() {
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

const profile = { name: 'Ana', role: null, started: true, mastery: 0.66, benchmark: 0.85,
  onboarding: { day: 16, days: 30 }, proficiency: { achievedAt: null, projectedAt: null }, weeks: [], units: [],
  confidentErrors: [
    { id: 'a', conceptId: 'concept-1', concept: 'Check sign-off', at: 0, correctedAt: null },
    { id: 'b', conceptId: 'concept-2', concept: 'Record damage', at: 1, correctedAt: null },
  ] }
let signInToken = 'token-a'
let flagReply: () => Promise<{ status: number; data: unknown }>
const flagRequests = () => jest.mocked(fetch).mock.calls.filter(([url]) => String(url).endsWith('/api/v1/me/result-flags'))

beforeEach(async () => {
  jest.clearAllMocks()
  signInToken = 'token-a'
  flagReply = async () => ({ status: 200, data: { ok: true } })
  globalThis.fetch = jest.fn(async (input: RequestInfo | URL) => {
    const path = new URL(String(input)).pathname
    if (path === '/api/v1/me/result-flags') {
      const reply = await flagReply()
      return { ok: reply.status === 200, status: reply.status, text: async () => JSON.stringify(reply.data),
        headers: { get: () => null } } as unknown as Response
    }
    const data = path === '/api/auth/sign-in/email' ? {} : path === '/api/v1/me/profile' ? profile
      : path === '/api/v1/session' ? { user: { id: signInToken, name: 'Ana', isAnonymous: false }, needsDisclosure: false }
      : path === '/api/v1/today' ? todayFixtures.normal : null
    return { ok: true, status: 200, text: async () => JSON.stringify(data),
      headers: { get: (name: string) => name === 'set-auth-token' ? signInToken : null } } as unknown as Response
  }) as typeof fetch
  jest.spyOn(AccessibilityInfo, 'announceForAccessibility').mockImplementation(() => {})
  await signIn('ana@example.com', 'password')
})
afterEach(() => { jest.restoreAllMocks() })

async function openFlag() {
  const navigation = renderRouter('src/app', { initialUrl: '/profile' })
  await navigation
  await fireEvent.press(await screen.findByRole('button', { name: 'Flag an unfair result for Check sign-off' }))
  expect(await screen.findByText('Tell your training team what looks wrong. A person reviews every flag.')).toBeOnTheScreen()
  expect(navigation.getPathname()).toBe('/flag')
  return { navigation }
}

test('opens the concept flag from Profile, sends the note, returns and announces success', async () => {
  jest.spyOn(Native, 'findNodeHandle').mockReturnValue(42)
  const focus = jest.spyOn(AccessibilityInfo, 'setAccessibilityFocus').mockImplementation(() => {})
  const { navigation } = await openFlag()
  await act(async () => { await jest.advanceTimersByTimeAsync(100) })
  expect(focus).toHaveBeenCalledWith(42)
  expect(screen.getByRole('header', { name: 'Flag an unfair result' })).toBeVisible()
  focus.mockClear()
  const note = screen.getByLabelText('Note')
  expect(note.props.multiline).toBe(true)
  expect(note.props.maxLength).toBe(500)
  expect(screen.getByText('Up to 500 characters')).toBeOnTheScreen()
  expect(note.props.accessibilityHint).toBe('Up to 500 characters')
  expect(screen.getByRole('button', { name: 'Send' })).toBeDisabled()
  await fireEvent.changeText(note, ' \n\t ')
  expect(screen.getByRole('button', { name: 'Send' })).toBeDisabled()
  await fireEvent.changeText(note, '  My answer followed the procedure.  ')
  await fireEvent.press(screen.getByRole('button', { name: 'Send' }))
  expect(await screen.findByText('Training progress')).toBeOnTheScreen()
  expect(navigation.getPathname()).toBe('/profile')
  await act(async () => { await jest.advanceTimersByTimeAsync(100) })
  expect(focus).toHaveBeenCalledWith(42)
  expect(flagRequests()).toHaveLength(1)
  expect(flagRequests()[0][1]).toMatchObject({ method: 'POST', headers: { Authorization: 'Bearer token-a' },
    body: JSON.stringify({ conceptId: 'concept-1', note: 'My answer followed the procedure.' }) })
  expect(AccessibilityInfo.announceForAccessibility).toHaveBeenCalledWith('Flag sent')
  // Only the arrival focus remains after mockClear above. The old same-tick
  // announcement ran before this focus and was interrupted by TalkBack.
  expect(focus.mock.invocationCallOrder.at(-1)).toBeLessThan(
    jest.mocked(AccessibilityInfo.announceForAccessibility).mock.invocationCallOrder[0],
  )
})

test('keeps the note on failure, and allows a retry', async () => {
  await openFlag()
  flagReply = async () => ({ status: 503, data: { error: 'Unavailable' } })
  await fireEvent.changeText(screen.getByLabelText('Note'), 'Please check this answer.')
  await fireEvent.press(screen.getByRole('button', { name: 'Send' }))
  expect(await screen.findByText('Could not send your flag. Try again.')).toBeOnTheScreen()
  expect(screen.getByLabelText('Note').props.value).toBe('Please check this answer.')
  expect(AccessibilityInfo.announceForAccessibility).not.toHaveBeenCalled()
  flagReply = async () => ({ status: 200, data: { ok: true } })
  await fireEvent.press(screen.getByRole('button', { name: 'Send' }))
  expect(await screen.findByText('Training progress')).toBeOnTheScreen()
  expect(flagRequests()).toHaveLength(2)
})

test('Send stays busy while pending and a double tap sends once', async () => {
  await openFlag()
  let finish!: (reply: { status: number; data: unknown }) => void
  flagReply = () => new Promise((resolve) => { finish = resolve })
  await fireEvent.changeText(screen.getByLabelText('Note'), 'Please check this answer.')
  await fireEvent.press(screen.getByRole('button', { name: 'Send' }))
  expect(screen.getByRole('button', { name: 'Send' }).props.accessibilityState).toMatchObject({ busy: true, disabled: true })
  await fireEvent.press(screen.getByRole('button', { name: 'Send' }))
  expect(flagRequests()).toHaveLength(1)
  await act(async () => { finish({ status: 200, data: { ok: true } }) })
  expect(await screen.findByText('Training progress')).toBeOnTheScreen()
})

test.each([200, 503])('a pending %s response cannot navigate or show errors under a different token', async (status) => {
  const { navigation } = await openFlag()
  let finish!: (reply: { status: number; data: unknown }) => void
  flagReply = () => new Promise((resolve) => { finish = resolve })
  await fireEvent.changeText(screen.getByLabelText('Note'), 'Private note from A')
  await fireEvent.press(screen.getByRole('button', { name: 'Send' }))
  await act(async () => {
    signInToken = 'token-b'
    await signIn('bea@example.com', 'password')
  })
  // index owns the new session's destination. Reopen its form before A's
  // response arrives, so an old success cannot dismiss B's active screen.
  expect(navigation.getPathname()).toBe('/today')
  await act(async () => { router.push({ pathname: '/flag', params: { conceptId: 'concept-1' } }) })
  expect(await screen.findByLabelText('Note')).toBeOnTheScreen()
  await act(async () => { finish({ status, data: { ok: true } }) })
  expect(navigation.getPathname()).toBe('/flag')
  expect(screen.getByLabelText('Note').props.value).toBe('')
  expect(screen.queryByText('Could not send your flag. Try again.')).toBeNull()
  expect(AccessibilityInfo.announceForAccessibility).not.toHaveBeenCalled()
  expect(flagRequests()).toHaveLength(1)
})

test('Back cancels the pending form and its late success does not announce', async () => {
  const { navigation } = await openFlag()
  let finish!: (reply: { status: number; data: unknown }) => void
  flagReply = () => new Promise((resolve) => { finish = resolve })
  await fireEvent.changeText(screen.getByLabelText('Note'), 'Please check this answer.')
  await fireEvent.press(screen.getByRole('button', { name: 'Send' }))
  await fireEvent.press(screen.getByRole('button', { name: 'Back to Training progress' }))
  expect(await screen.findByText('Training progress')).toBeOnTheScreen()
  expect(flagRequests()[0][1]?.signal?.aborted).toBe(true)
  await act(async () => { finish({ status: 200, data: { ok: true } }) })
  expect(navigation.getPathname()).toBe('/profile')
  expect(AccessibilityInfo.announceForAccessibility).not.toHaveBeenCalled()
})

test('a direct route without a concept cannot send', async () => {
  await renderRouter('src/app', { initialUrl: '/flag' })
  expect(await screen.findByText('Open a result from Training progress to flag it.')).toBeOnTheScreen()
  await fireEvent.changeText(screen.getByLabelText('Note'), 'Please check this answer.')
  expect(screen.getByRole('button', { name: 'Send' })).toBeDisabled()
  expect(flagRequests()).toHaveLength(0)
})

test('each critical-step button names and opens its own concept', async () => {
  await renderRouter('src/app', { initialUrl: '/profile' })
  expect(await screen.findByRole('button', { name: 'Flag an unfair result for Check sign-off' })).toBeOnTheScreen()
  await fireEvent.press(screen.getByRole('button', { name: 'Flag an unfair result for Record damage' }))
  await fireEvent.changeText(await screen.findByLabelText('Note'), 'Please review this result.')
  await fireEvent.press(screen.getByRole('button', { name: 'Send' }))
  expect(flagRequests()[0][1]?.body).toBe(JSON.stringify({ conceptId: 'concept-2', note: 'Please review this result.' }))
})

test('Back from a directly opened flag falls back to Training progress', async () => {
  const navigation = renderRouter('src/app', { initialUrl: '/flag?conceptId=concept-1' })
  await navigation
  expect(router.canGoBack()).toBe(false)
  await fireEvent.press(await screen.findByRole('button', { name: 'Back to Training progress' }))
  expect(await screen.findByText('Training progress')).toBeOnTheScreen()
  expect(navigation.getPathname()).toBe('/profile')
})
