import { createElement as h } from 'react'
import { AccessibilityInfo, BackHandler } from 'react-native'
import { act, fireEvent, render, screen } from '@testing-library/react-native'
import { startFailed } from '@learnquiz/api/system-copy'
import LoadingScreen from '../app/play/loading'
import { ThemeProvider } from '../theme/ThemeProvider'

const mockRouter = { replace: jest.fn(), dismissAll: jest.fn() }
const mockFetch = jest.fn()
let mockBack: () => boolean

jest.mock('expo-router', () => ({
  useRouter: () => mockRouter,
  useLocalSearchParams: () => ({ topicId: 't1', start: 'session' }),
  useFocusEffect: (effect: () => () => void) => require('react').useEffect(effect, [effect]),
}))
jest.mock('./auth', () => ({ getToken: () => null, handleUnauthorized: jest.fn() }))
jest.mock('./session-store', () => ({
  useSession: () => ({ status: 'ready', needsDisclosure: false, user: { id: 'u1' } }),
}))
jest.mock('react-native-safe-area-context', () => ({ useSafeAreaInsets: () => ({ top: 0, bottom: 0, left: 0, right: 0 }) }))
jest.mock('react-native-keyboard-controller', () => ({
  KeyboardAvoidingView: require('react-native').View,
  KeyboardAwareScrollView: require('react-native').ScrollView,
  useKeyboardState: () => false,
}))

let frames: Map<number, FrameRequestCallback>
let nextFrame: number
const realFetch = globalThis.fetch

function response(payload: unknown, raw = false): Response {
  return { ok: true, status: 200, headers: { get: () => null }, text: async () => raw ? payload : JSON.stringify(payload) } as unknown as Response
}

async function frame() {
  const callbacks = [...frames.values()]
  frames.clear()
  await act(() => { callbacks.forEach((callback) => callback(0)) })
}

beforeEach(() => {
  jest.clearAllMocks()
  frames = new Map()
  nextFrame = 0
  globalThis.fetch = mockFetch
  jest.spyOn(global, 'requestAnimationFrame').mockImplementation((callback) => {
    frames.set(++nextFrame, callback)
    return nextFrame
  })
  jest.spyOn(global, 'cancelAnimationFrame').mockImplementation((id) => { if (id != null) frames.delete(id) })
  jest.spyOn(AccessibilityInfo, 'announceForAccessibility').mockImplementation(() => {})
  jest.spyOn(BackHandler, 'addEventListener').mockImplementation((_event, callback) => {
    mockBack = callback as () => boolean
    return { remove: jest.fn() }
  })
})

afterEach(() => { globalThis.fetch = realFetch; jest.restoreAllMocks() })

test.each<[string, unknown, boolean]>([
  ['Cancel', {}, false],
  ['Back', {}, false],
  ['Cancel', '<html>Maintenance</html>', true],
  ['Back', '<html>Maintenance</html>', true],
])('%s leaves malformed success %p for Today', async (action, payload, raw) => {
  mockFetch.mockResolvedValue(response(payload, raw))
  await render(h(ThemeProvider, { children: h(LoadingScreen) }))
  expect(screen.getByRole('alert', { name: startFailed })).toBeOnTheScreen()
  expect(screen.getByRole('button', { name: 'Try again' })).toBeOnTheScreen()
  if (action === 'Cancel') await fireEvent.press(screen.getByRole('button', { name: 'Cancel' }))
  else await act(() => { expect(mockBack()).toBe(true) })
  expect(mockRouter.dismissAll).toHaveBeenCalledTimes(1)
  expect(mockRouter.replace).toHaveBeenCalledWith('/(tabs)/today')
})

test('Try again starts a new request after a non-JSON success', async () => {
  mockFetch.mockResolvedValueOnce(response('<html>Maintenance</html>', true))
    .mockResolvedValueOnce(response({ sessionId: 's2' }))
  await render(h(ThemeProvider, { children: h(LoadingScreen) }))
  expect(screen.getByRole('alert', { name: startFailed })).toBeOnTheScreen()
  await fireEvent.press(screen.getByRole('button', { name: 'Try again' }))
  expect(mockFetch).toHaveBeenCalledTimes(2)
  expect(mockRouter.replace).toHaveBeenCalledWith('/play/s2?announceReady=1')
})

test('open status follows focus and delegates ready to the destination after navigation', async () => {
  let resolve!: (value: Response) => void
  mockFetch.mockImplementation(() => new Promise<Response>((done) => { resolve = done }))
  const view = await render(h(ThemeProvider, { children: h(LoadingScreen) }))
  expect(AccessibilityInfo.announceForAccessibility).not.toHaveBeenCalled()
  await frame()
  expect(AccessibilityInfo.announceForAccessibility).not.toHaveBeenCalled()
  await frame()
  expect(AccessibilityInfo.announceForAccessibility).toHaveBeenCalledWith('Getting your questions ready.')
  await act(async () => { resolve(response({ sessionId: 's1' })) })
  expect(mockRouter.replace).toHaveBeenCalledWith('/play/s1?announceReady=1')
  expect(AccessibilityInfo.announceForAccessibility).toHaveBeenCalledTimes(1)
  await view.unmount()
  // Loading cannot know when the destination's GET and item focus finish.
  await frame()
  expect(AccessibilityInfo.announceForAccessibility).toHaveBeenCalledTimes(1)
  await frame()
  expect(AccessibilityInfo.announceForAccessibility).toHaveBeenCalledTimes(1)
})

test('leaving Loading cancels its pending open announcement', async () => {
  mockFetch.mockImplementation((_url, init: RequestInit) => new Promise((_resolve, reject) => {
    init.signal?.addEventListener('abort', () => reject(new Error('aborted')))
  }))
  const view = await render(h(ThemeProvider, { children: h(LoadingScreen) }))
  await frame()
  await view.unmount()
  await frame()
  expect(AccessibilityInfo.announceForAccessibility).not.toHaveBeenCalled()
})
