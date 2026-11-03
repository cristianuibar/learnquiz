import { createElement as h } from 'react'
import { BackHandler } from 'react-native'
import { act, fireEvent, render, screen } from '@testing-library/react-native'
import * as Notifications from 'expo-notifications'
import type { SummaryView } from '@learnquiz/api'
import SessionDone from '../app/play/[sessionId]/done'
import { api } from './api'
import { readPromptCounts, recordFinished } from './push-prompt'
import { ThemeProvider } from '../theme/ThemeProvider'

const mockRouter = { replace: jest.fn(), dismissTo: jest.fn() }
let mockBack: () => boolean
let mockFocused = true

jest.mock('expo-router', () => ({
  Stack: { Screen: () => null },
  useRouter: () => mockRouter,
  useLocalSearchParams: () => ({ sessionId: 's1' }),
  useFocusEffect: (effect: () => () => void) => require('react').useEffect(
    () => mockFocused ? effect() : undefined, [effect, mockFocused],
  ),
}))
jest.mock('expo-notifications', () => ({ getPermissionsAsync: jest.fn() }))
jest.mock('./api', () => ({ api: jest.fn(), ApiError: class extends Error {} }))
jest.mock('./push-prompt', () => ({
  ...jest.requireActual('./push-prompt'),
  readPromptCounts: jest.fn(), recordFinished: jest.fn(),
}))
jest.mock('./kv', () => ({ getJSON: jest.fn(), setJSON: jest.fn() }))
jest.mock('react-native-safe-area-context', () => ({ useSafeAreaInsets: () => ({ top: 0, bottom: 0, left: 0, right: 0 }) }))
jest.mock('react-native-keyboard-controller', () => ({
  KeyboardAvoidingView: require('react-native').View,
  KeyboardAwareScrollView: require('react-native').ScrollView,
  useKeyboardState: () => false,
}))

const summary: SummaryView = {
  sessionId: 's1', topicId: 't1', kind: 'session', durationMs: 1000,
  correct: 1, total: 1, ungraded: 0, xp: 10, streak: 0, level: null,
  levelLine: null, levelLineModel: null, endedEarly: false,
  masteryMoved: [], mistakes: [], benchmark: null, reviewsLeft: 0, nextLine: '',
}

function deferred<T>() {
  let resolve!: (value: T) => void
  let reject!: (error: unknown) => void
  const promise = new Promise<T>((yes, no) => { resolve = yes; reject = no })
  return { promise, resolve, reject }
}

beforeEach(() => {
  jest.clearAllMocks()
  mockFocused = true
  jest.mocked(api).mockResolvedValue(summary)
  jest.mocked(recordFinished).mockResolvedValue(1)
  jest.mocked(readPromptCounts).mockResolvedValue({ finishedSessions: 1, skips: 0, registered: false })
  jest.spyOn(BackHandler, 'addEventListener').mockImplementation((_event, callback) => {
    mockBack = callback as () => boolean
    return { remove: jest.fn() }
  })
})
afterEach(() => jest.restoreAllMocks())

test('blur then refocus during /end retains the summary and counts the completion once', async () => {
  const ending = deferred<SummaryView>()
  jest.mocked(api).mockReturnValue(ending.promise)
  const content = h(ThemeProvider, { children: h(SessionDone) })
  const view = await render(content)
  expect(screen.getByText('Wrapping up')).toBeOnTheScreen()
  mockFocused = false
  await view.rerender(h(ThemeProvider, { children: h(SessionDone) }))
  await act(async () => { ending.resolve(summary) })
  mockFocused = true
  await view.rerender(h(ThemeProvider, { children: h(SessionDone) }))
  expect(screen.getByRole('header', { name: 'Session done' })).toBeOnTheScreen()
  expect(recordFinished).toHaveBeenCalledTimes(1)
  expect(recordFinished).toHaveBeenCalledWith('s1')
  expect(api).toHaveBeenCalledTimes(1)
})

test.each(['unmount', 'Back'])('Continue cannot navigate when permission resolves after %s', async (leave) => {
  const permission = deferred<Notifications.NotificationPermissionsStatus>()
  jest.mocked(Notifications.getPermissionsAsync).mockReturnValue(permission.promise)
  const view = await render(h(ThemeProvider, { children: h(SessionDone) }))
  await fireEvent.press(screen.getByRole('button', { name: 'Continue' }))
  expect(Notifications.getPermissionsAsync).toHaveBeenCalledTimes(1)
  if (leave === 'unmount') await view.unmount()
  else await act(() => { expect(mockBack()).toBe(true) })
  mockRouter.dismissTo.mockClear()
  await act(async () => { permission.resolve({ status: 'undetermined', canAskAgain: true } as Notifications.NotificationPermissionsStatus) })
  expect(mockRouter.replace).not.toHaveBeenCalled()
  expect(mockRouter.dismissTo).not.toHaveBeenCalled()
})

test('a rejected lookup after Back cannot navigate either', async () => {
  const permission = deferred<Notifications.NotificationPermissionsStatus>()
  jest.mocked(Notifications.getPermissionsAsync).mockReturnValue(permission.promise)
  await render(h(ThemeProvider, { children: h(SessionDone) }))
  await fireEvent.press(screen.getByRole('button', { name: 'Continue' }))
  await act(() => { mockBack() })
  expect(mockRouter.dismissTo).toHaveBeenCalledWith('/(tabs)/today')
  mockRouter.dismissTo.mockClear()
  await act(async () => { permission.reject(new Error('unavailable')) })
  expect(mockRouter.replace).not.toHaveBeenCalled()
  expect(mockRouter.dismissTo).not.toHaveBeenCalled()
})

test('unmounting while the completion is saved prevents starting the permission lookup', async () => {
  const finished = deferred<number>()
  jest.mocked(recordFinished).mockReturnValue(finished.promise)
  const view = await render(h(ThemeProvider, { children: h(SessionDone) }))
  await fireEvent.press(screen.getByRole('button', { name: 'Continue' }))
  await view.unmount()
  await act(async () => { finished.resolve(1) })
  expect(Notifications.getPermissionsAsync).not.toHaveBeenCalled()
  expect(mockRouter.replace).not.toHaveBeenCalled()
  expect(mockRouter.dismissTo).not.toHaveBeenCalled()
})

test.each(['undetermined', 'granted'] as const)('Continue still navigates normally with %s permission', async (status) => {
  jest.mocked(Notifications.getPermissionsAsync).mockResolvedValue({ status, canAskAgain: true } as Notifications.NotificationPermissionsStatus)
  await render(h(ThemeProvider, { children: h(SessionDone) }))
  await fireEvent.press(screen.getByRole('button', { name: 'Continue' }))
  if (status === 'undetermined') expect(mockRouter.replace).toHaveBeenCalledWith('/opt-in')
  else expect(mockRouter.dismissTo).toHaveBeenCalledWith('/(tabs)/today')
})
