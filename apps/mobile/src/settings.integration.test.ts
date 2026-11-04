import { act, fireEvent, renderRouter, screen, within } from 'expo-router/testing-library'
import * as SecureStore from 'expo-secure-store'
import { todayFixtures } from '@learnquiz/api/today'
import type { PushSettings } from './lib/settings-rules'
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
// The selected-option check is decorative (hidden from TalkBack); a tagged stand-in lets tests find it.
jest.mock('lucide-react-native', () => ({
  ...jest.requireActual('lucide-react-native'),
  Check: () => require('react').createElement(require('react-native').View, { testID: 'selected-check' }),
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
const defaultPushSettings = replies['/api/v1/push/settings'].data
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
  replies['/api/v1/push/settings'].data = JSON.parse(JSON.stringify(defaultPushSettings))
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
  const Native: typeof import('react-native') = require('react-native')
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
  expect(setColorScheme).toHaveBeenLastCalledWith('unspecified')
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

test('Back lets a submitted preference and its queued edit finish without aborting either write', async () => {
  let finish!: (response: Response) => void
  const signals: (AbortSignal | null | undefined)[] = []
  saveReply = (init) => { signals.push(init?.signal); return new Promise((resolve) => { finish = resolve }) }
  const navigation = renderRouter('src/app', { initialUrl: '/profile' })
  await navigation
  await screen.findByText('Ana')
  await fireEvent.press(screen.getByRole('button', { name: 'Settings' }))
  await screen.findByText('ana@example.com')
  await fireEvent.press(screen.getByRole('togglebutton', { name: 'Monday' }))
  await fireEvent.press(screen.getByRole('switch', { name: 'Send me questions' }))
  await fireEvent.press(screen.getByRole('button', { name: 'Back' }))
  expect(navigation.getPathname()).toBe('/profile')
  expect(signals[0]?.aborted).toBe(false)
  const success = { ok: true, status: 200, text: async () => '{}', headers: { get: () => null } } as unknown as Response
  await act(async () => { finish(success) })
  expect(saves).toEqual([expect.objectContaining({ days: [2], paused: false }), expect.objectContaining({ days: [2], paused: true })])
  expect(signals[1]?.aborted).toBe(false)
  await act(async () => { finish(success) })
})

test.each(['pause', 'day', 'from', 'to'])('a %s change saves inside narrowed company hours', async (control) => {
  const settings = replies['/api/v1/push/settings'].data as PushSettings
  settings.prefs = { ...settings.prefs, startMinute: 540, endMinute: 1020 }
  settings.company = { ...settings.company!, startMinute: 600, endMinute: 960 }
  await renderRouter('src/app', { initialUrl: '/settings' })
  await screen.findByText('ana@example.com')
  if (control === 'pause') await fireEvent.press(screen.getByRole('switch', { name: 'Send me questions' }))
  else if (control === 'day') await fireEvent.press(screen.getByRole('togglebutton', { name: 'Monday' }))
  else {
    await fireEvent.press(screen.getByRole('button', { name: control === 'from' ? /^From / : /^To / }))
    await fireEvent.press(screen.getByRole('radio', { name: control === 'from' ? '10:30 AM' : '3:00 PM' }))
  }
  expect(saves).toHaveLength(1)
  const body = saves[0] as PushSettings['prefs']
  expect(body.startMinute).toBeGreaterThanOrEqual(600)
  expect(body.endMinute).toBeLessThanOrEqual(960)
  expect(body.endMinute - body.startMinute).toBeGreaterThanOrEqual(30)
})

test('a learner whose company dropped every chosen day can still pause and change hours (#669)', async () => {
  const { settingsSaveFailed } = require('@learnquiz/api/system-copy')
  const settings = replies['/api/v1/push/settings'].data as PushSettings
  settings.prefs.days = []
  // Mirrors the bearer PUT validator on main: an empty days array is a 400, an omitted one is accepted.
  saveReply = async (init) => {
    const body = JSON.parse(String(init?.body))
    const rejected = Array.isArray(body.days) && body.days.length === 0
    return { ok: !rejected, status: rejected ? 400 : 200, headers: { get: () => null },
      text: async () => JSON.stringify(rejected ? { error: 'Choose days inside Mon–Fri' } : {}) } as unknown as Response
  }
  await renderRouter('src/app', { initialUrl: '/settings' })
  await screen.findByText('ana@example.com')
  await fireEvent.press(screen.getByRole('switch', { name: 'Send me questions' }))
  expect(screen.getByRole('switch', { name: 'Send me questions' })).not.toBeChecked()
  await fireEvent.press(screen.getByRole('button', { name: 'To 3:30 PM' }))
  await fireEvent.press(screen.getByRole('radio', { name: '4:00 PM' }))
  expect(screen.getByRole('button', { name: 'To 4:00 PM' })).toBeOnTheScreen()
  expect(screen.queryByText(settingsSaveFailed)).toBeNull()
  expect(saves).toEqual([expect.objectContaining({ paused: true }), expect.objectContaining({ paused: true, endMinute: 960 })])
  expect(saves.every((body) => !Object.hasOwn(body as object, 'days'))).toBe(true)
})

test('enabling notifications without a company keeps the device timezone in the preference PUT', async () => {
  const settings = replies['/api/v1/push/settings'].data as PushSettings
  settings.company = null
  settings.prefs.timezone = 'UTC'
  const realFormat = Intl.DateTimeFormat
  jest.spyOn(Intl, 'DateTimeFormat').mockImplementation((locales, options) => new realFormat(locales, { ...options, timeZone: 'America/Los_Angeles' }))
  const push = require('./lib/push')
  jest.spyOn(push, 'pushStatus').mockResolvedValueOnce({ registered: false, permission: 'granted', token: null })
    .mockResolvedValue({ registered: true, permission: 'granted', token: 'expo-token' })
  jest.spyOn(push, 'enablePush').mockResolvedValue('granted')
  await renderRouter('src/app', { initialUrl: '/settings' })
  await screen.findByText('ana@example.com')
  await fireEvent.press(screen.getByRole('switch', { name: 'Send me questions' }))
  expect(saves).toEqual([expect.objectContaining({ timezone: 'America/Los_Angeles', paused: false })])
})

test.each(['select', 'close', 'Android Back'])('the time sheet returns focus to its opener after %s', async (action) => {
  const Native: typeof import('react-native') = require('react-native')
  jest.spyOn(Native, 'findNodeHandle').mockImplementation((node: unknown) =>
    (node as { props?: { accessibilityLabel?: string } })?.props?.accessibilityLabel?.startsWith('To ') ? 17 : 42)
  const focus = jest.spyOn(Native.AccessibilityInfo, 'setAccessibilityFocus').mockImplementation(() => {})
  const listeners: (() => boolean)[] = []
  const original = Native.BackHandler.addEventListener
  jest.spyOn(Native.BackHandler, 'addEventListener').mockImplementation((event, listener) => {
    listeners.push(() => listener({ type: 'hardwareBackPress', timeStamp: Date.now() }) ?? false)
    return original(event, listener)
  })
  await renderRouter('src/app', { initialUrl: '/settings' })
  await screen.findByText('ana@example.com')
  await fireEvent.press(screen.getByRole('button', { name: 'To 3:30 PM' }))
  await act(async () => { await jest.advanceTimersByTimeAsync(100) })
  expect(screen.queryByRole('header', { name: 'Settings' })).toBeNull()
  focus.mockClear()
  if (action === 'select') await fireEvent.press(screen.getByRole('radio', { name: '4:00 PM' }))
  else if (action === 'close') await fireEvent.press(screen.getByRole('button', { name: 'Close' }))
  else await act(async () => { expect(listeners.at(-1)?.()).toBe(true) })
  await act(async () => { await jest.advanceTimersByTimeAsync(100) })
  expect(screen.getByRole('header', { name: 'Settings' })).toBeOnTheScreen()
  expect(focus).toHaveBeenLastCalledWith(17)
})

test('the Settings top bar stays outside the scrolling content', async () => {
  const Native: typeof import('react-native') = require('react-native')
  await renderRouter('src/app', { initialUrl: '/settings' })
  await screen.findByText('ana@example.com')
  const heading = screen.getByRole('header', { name: 'Settings' })
  for (let parent = heading.parent; parent; parent = parent.parent) {
    expect(parent.type).not.toBe(Native.ScrollView)
    expect(String(parent.type)).not.toMatch(/^RCTScrollView$/)
  }
  // The account section still lives in the scrollable region.
  let accountParent = screen.getByRole('header', { name: 'Account' }).parent
  while (accountParent && !/ScrollView/.test(String(accountParent.type))) accountParent = accountParent.parent
  expect(accountParent).not.toBeNull()
})

test('at font scale 2, full day labels have room to wrap as controls and keep their label typography', async () => {
  const Native: typeof import('react-native') = require('react-native')
  jest.spyOn(Native, 'useWindowDimensions').mockReturnValue({ width: 360, height: 740, scale: 1, fontScale: 2 })
  await renderRouter('src/app', { initialUrl: '/settings' })
  await screen.findByText('ana@example.com')
  const wednesday = screen.getByRole('togglebutton', { name: 'Wednesday' })
  const label = screen.getByText('Wed')
  expect(label).toHaveStyle({ fontSize: 14, lineHeight: 20, fontFamily: 'Inter_600SemiBold', flexShrink: 0 })
  expect(wednesday).toHaveStyle({ flexShrink: 0, flexWrap: 'nowrap' })
  expect(wednesday.parent).toHaveStyle({ flexWrap: 'wrap' })
  const width = Native.StyleSheet.flatten(wednesday.props.style).minWidth
  // At a 360 dp viewport, three complete controls fit per row and four don't.
  // A 48 dp control would wrap a scaled label inside the control instead.
  expect(width * 3 + 16).toBeLessThanOrEqual(328)
  expect(width * 4 + 24).toBeGreaterThan(328)
  expect(screen.getByText('7:00 AM')).toHaveStyle({ fontSize: 17, lineHeight: 24 })
})

test('at font scale 2, selected days, Appearance and time options show the check and keep room for the label (#669)', async () => {
  const Native: typeof import('react-native') = require('react-native')
  jest.spyOn(Native, 'useWindowDimensions').mockReturnValue({ width: 360, height: 740, scale: 1, fontScale: 2 })
  await renderRouter('src/app', { initialUrl: '/settings' })
  await screen.findByText('ana@example.com')
  const minWidth = (node: ReturnType<typeof screen.getByRole>) => Native.StyleSheet.flatten(node.props.style).minWidth
  const monday = screen.getByRole('togglebutton', { name: 'Monday' })
  const wednesday = screen.getByRole('togglebutton', { name: 'Wednesday' })
  expect(within(monday).getByTestId('selected-check')).toBeOnTheScreen()
  expect(within(wednesday).queryByTestId('selected-check')).toBeNull()
  // Same-length labels: the selected control adds the 16 dp check and its 4 dp gap, so "Mon" never squeezes.
  expect(minWidth(monday)).toBe(minWidth(wednesday) + 20)
  expect(within(monday).getByText('Mon')).toHaveStyle({ flexShrink: 0 })
  expect(monday).toHaveStyle({ flexWrap: 'nowrap' })
  expect(within(screen.getByRole('radio', { name: 'System' })).getByTestId('selected-check')).toBeOnTheScreen()
  expect(within(screen.getByRole('radio', { name: 'Light' })).queryByTestId('selected-check')).toBeNull()
  await fireEvent.press(screen.getByRole('button', { name: 'To 3:30 PM' }))
  const selectedTime = screen.getByRole('radio', { name: '3:30 PM' })
  expect(within(selectedTime).getByTestId('selected-check')).toBeOnTheScreen()
  expect(within(screen.getByRole('radio', { name: '4:00 PM' })).queryByTestId('selected-check')).toBeNull()
  expect(minWidth(selectedTime)).toBe(minWidth(screen.getByRole('radio', { name: '4:00 PM' })) + 20)
})
