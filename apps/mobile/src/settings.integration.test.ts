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
  getPermissionsAsync: jest.fn(async () => ({ status: 'granted' })),
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
  '/api/v1/push/settings': { data: { prefs: { paused: false, startMinute: 420, endMinute: 930, days: [1, 2], timezone: 'UTC' }, company: { name: 'Northwind', startMinute: 360, endMinute: 1080, days: [1, 2, 3, 4, 5], timezone: 'UTC' } } },
  '/api/auth/sign-out': { data: {} },
}
let saveReply: (init?: RequestInit) => Promise<Response>
const saves: unknown[] = []
globalThis.fetch = jest.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
  if (new URL(String(input)).pathname === '/api/v1/push/preferences') {
    saves.push(JSON.parse(String(init?.body)))
    expect(init?.headers).toEqual(expect.objectContaining({ Authorization: 'Bearer token-a' }))
    return saveReply(init)
  }
  const reply = replies[new URL(String(input)).pathname]
  return { ok: true, status: 200, text: async () => JSON.stringify(reply?.data ?? null),
    headers: { get: (name: string) => (name === 'set-auth-token' ? reply?.token ?? null : null) } } as unknown as Response
}) as typeof fetch

beforeEach(async () => {
  jest.useFakeTimers()
  // expo-router installs its Reanimated mock after imports; supply the missing native hook.
  require('react-native-reanimated').useReducedMotion = () => true
  await require('./lib/kv').remove('device:appearance')
  jest.mocked(require('expo-notifications').getPermissionsAsync).mockResolvedValue({ status: 'granted' })
  saves.length = 0
  saveReply = async () => ({ ok: true, status: 200, text: async () => '{}', headers: { get: () => null } }) as unknown as Response
  mockSignInMounts = 0
  jest.mocked(SecureStore.deleteItemAsync).mockReset().mockResolvedValue()
  await signIn('ana@example.com', 'password')
})

afterEach(() => { jest.useRealTimers(); jest.restoreAllMocks() })

test('Settings saves a day then pauses serially, reverting a rejected pause to the confirmed days', async () => {
  const { settingsSaveFailed } = require('@learnquiz/api/system-copy')
  await renderRouter('src/app', { initialUrl: '/settings' })
  expect(await screen.findByText('ana@example.com')).toBeOnTheScreen()
  expect(screen.getByRole('switch', { name: 'Send me questions' })).toBeChecked()
  let finish!: (response: Response) => void
  saveReply = () => new Promise((resolve) => { finish = resolve })
  await fireEvent.press(screen.getByRole('togglebutton', { name: 'Monday' }))
  expect(screen.getByRole('togglebutton', { name: 'Monday' })).toHaveProp('accessibilityState', expect.objectContaining({ checked: false }))
  await fireEvent.press(screen.getByRole('switch', { name: 'Send me questions' }))
  expect(saves).toEqual([expect.objectContaining({ days: [2], paused: false })])
  const success = { ok: true, status: 200, text: async () => '{}', headers: { get: () => null } } as unknown as Response
  await act(async () => { finish(success) })
  expect(saves).toEqual([expect.objectContaining({ days: [2], paused: false }), expect.objectContaining({ days: [2], paused: true })])
  await act(async () => { finish({ ...success, ok: false, status: 400, text: async () => JSON.stringify({ error: 'Choose hours inside company hours' }) }) })
  expect(screen.getByRole('switch', { name: 'Send me questions' })).toBeChecked()
  expect(screen.getByRole('togglebutton', { name: 'Monday' })).toHaveProp('accessibilityState', expect.objectContaining({ checked: false }))
  expect(screen.getAllByText(settingsSaveFailed)).toHaveLength(1)
})

test('the last day stays pressed and TalkBack announces why', async () => {
  const { AccessibilityInfo } = require('react-native')
  const announce = jest.spyOn(AccessibilityInfo, 'announceForAccessibility')
  await renderRouter('src/app', { initialUrl: '/settings' })
  await screen.findByText('ana@example.com')
  await fireEvent.press(screen.getByRole('togglebutton', { name: 'Monday' }))
  await fireEvent.press(screen.getByRole('togglebutton', { name: 'Tuesday' }))
  expect(screen.getByRole('togglebutton', { name: 'Tuesday' })).toHaveProp('accessibilityState', expect.objectContaining({ checked: true }))
  expect(announce).toHaveBeenCalledWith('At least one day')
  expect(saves).toHaveLength(1)
})

test('time fields offer company choices, save the selection, and Appearance has radio semantics', async () => {
  await renderRouter('src/app', { initialUrl: '/settings' })
  await screen.findByText('ana@example.com')
  expect(screen.getByLabelText('Appearance')).toHaveProp('accessibilityRole', 'radiogroup')
  expect(screen.getByRole('radio', { name: 'System' })).toBeChecked()
  await fireEvent.press(screen.getByRole('button', { name: 'From 7:00 AM' }))
  expect(screen.getByRole('radio', { name: '6:00 AM' })).toBeOnTheScreen()
  expect(screen.queryByRole('radio', { name: '3:30 PM' })).toBeNull()
  await fireEvent.press(screen.getByRole('radio', { name: '6:00 AM' }))
  expect(screen.getByRole('button', { name: 'From 6:00 AM' })).toBeOnTheScreen()
  expect(saves).toEqual([expect.objectContaining({ startMinute: 360, endMinute: 930 })])
})

test('Back from Settings restores accessibility focus to the Profile Settings icon', async () => {
  const Native = require('react-native')
  jest.spyOn(Native, 'findNodeHandle').mockImplementation((node: unknown) =>
    (node as { props?: { accessibilityLabel?: string } })?.props?.accessibilityLabel === 'Settings' ? 7 : 42)
  const focus = jest.spyOn(Native.AccessibilityInfo, 'setAccessibilityFocus').mockImplementation(() => {})
  const navigation = renderRouter('src/app', { initialUrl: '/profile' })
  await navigation
  await screen.findByText('Ana')
  await fireEvent.press(screen.getByRole('button', { name: 'Settings' }))
  await screen.findByText('ana@example.com')
  await act(async () => { await jest.advanceTimersByTimeAsync(100) })
  focus.mockClear()
  await fireEvent.press(screen.getByRole('button', { name: 'Back' }))
  await act(async () => { await jest.advanceTimersByTimeAsync(100) })
  expect(navigation.getPathname()).toBe('/profile')
  expect(focus).toHaveBeenLastCalledWith(7)
})

test('Appearance applies immediately and reverts to System with one alert if device storage fails', async () => {
  const { Appearance } = require('react-native')
  const setColorScheme = jest.spyOn(Appearance, 'setColorScheme')
  await renderRouter('src/app', { initialUrl: '/settings' })
  await screen.findByText('ana@example.com')
  let reject!: (error: Error) => void
  jest.spyOn(require('./lib/kv'), 'setJSON').mockImplementation(() => new Promise((_resolve, no) => { reject = no }))
  await fireEvent.press(screen.getByRole('radio', { name: 'Light' }))
  expect(screen.getByRole('radio', { name: 'Light' })).toBeChecked()
  expect(setColorScheme).toHaveBeenLastCalledWith('light')
  await act(async () => { reject(new Error('disk full')) })
  expect(screen.getByRole('radio', { name: 'System' })).toBeChecked()
  expect(setColorScheme).toHaveBeenLastCalledWith(null)
  expect(screen.getAllByText(require('@learnquiz/api/system-copy').settingsSaveFailed)).toHaveLength(1)
})

test('denied Android permission turns the switch off and Open settings opens the app settings', async () => {
  jest.mocked(require('expo-notifications').getPermissionsAsync).mockResolvedValue({ status: 'denied' })
  const openSettings = jest.spyOn(require('react-native').Linking, 'openSettings').mockResolvedValue(undefined)
  await renderRouter('src/app', { initialUrl: '/settings' })
  await screen.findByText('ana@example.com')
  expect(screen.getByRole('switch', { name: 'Send me questions' })).not.toBeChecked()
  expect(screen.getByText('Notifications are off for Learn Quiz in Android settings.')).toBeOnTheScreen()
  await fireEvent.press(screen.getByRole('button', { name: 'Open settings' }))
  expect(openSettings).toHaveBeenCalledTimes(1)
  expect(saves).toHaveLength(0)
})

test('turning on an unregistered device enables push once and preserves a day changed during registration', async () => {
  const push = require('./lib/push')
  const native = { registered: false, permission: 'granted', token: null }
  jest.spyOn(push, 'pushStatus').mockResolvedValueOnce(native).mockResolvedValue({ ...native, registered: true, token: 'expo-token' })
  let enabled!: (result: string) => void
  const enable = jest.spyOn(push, 'enablePush').mockImplementation(() => new Promise((resolve) => { enabled = resolve }))
  await renderRouter('src/app', { initialUrl: '/settings' })
  await screen.findByText('ana@example.com')
  expect(screen.getByRole('switch', { name: 'Send me questions' })).not.toBeChecked()
  await fireEvent.press(screen.getByRole('switch', { name: 'Send me questions' }))
  await fireEvent.press(screen.getByRole('switch', { name: 'Send me questions' }))
  expect(enable).toHaveBeenCalledTimes(1)
  await fireEvent.press(screen.getByRole('togglebutton', { name: 'Monday' }))
  await act(async () => { enabled('granted') })
  expect(screen.getByRole('switch', { name: 'Send me questions' })).toBeChecked()
  expect(screen.getByRole('togglebutton', { name: 'Monday' })).toHaveProp('accessibilityState', expect.objectContaining({ checked: false }))
  expect(saves).toEqual([expect.objectContaining({ days: [2] }), expect.objectContaining({ days: [2], paused: false })])
})
