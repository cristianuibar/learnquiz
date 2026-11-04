import { createElement as h, type ReactNode } from 'react'
import { act, fireEvent, render, screen } from '@testing-library/react-native'
import { AppState } from 'react-native'
import { requestRecordingPermissionsAsync, useAudioStream } from 'expo-audio'
import type { ItemView } from '@learnquiz/api'
import SessionScreen from './app/play/[sessionId]/index'
import { QuestionDock } from './components/session/QuestionDock'
import { api, postForm } from './lib/api'
import { ThemeProvider } from './theme/ThemeProvider'

jest.mock('expo-router', () => {
  const router = { replace: jest.fn() }
  return {
    useLocalSearchParams: () => ({ sessionId: 'personal-session' }),
    useRouter: () => router,
    useFocusEffect: jest.fn(),
  }
})
jest.mock('expo-image', () => ({ Image: require('react-native').Image }))
jest.mock('react-native-safe-area-context', () => ({ useSafeAreaInsets: () => ({ top: 24, bottom: 0, left: 0, right: 0 }) }))
jest.mock('react-native-keyboard-controller', () => ({ useKeyboardState: () => false }))
jest.mock('react-native-reanimated', () => ({ useReducedMotion: () => true }))
jest.mock('expo-speech', () => ({ stop: jest.fn() }))
type BufferCallback = (chunk: { data: ArrayBuffer; sampleRate: number; channels: number }) => void
jest.mock('expo-audio', () => {
  const stream = { start: jest.fn(async () => {}), stop: jest.fn() }
  return {
    stream,
    useAudioStream: jest.fn(() => ({ stream, isStreaming: false })),
    requestRecordingPermissionsAsync: jest.fn(),
  }
})
jest.mock('./lib/api', () => ({ api: jest.fn(), postForm: jest.fn() }))
jest.mock('./lib/session-store', () => ({ useSession: () => ({ branding: null }) }))
jest.mock('./lib/session/draft', () => ({
  draftForView: jest.fn(async () => ({ answer: {}, confidence: null })),
  writeDraft: jest.fn(async () => {}),
  deleteDraft: jest.fn(async () => {}),
}))
jest.mock('./components/ui/Screen', () => ({ useHeadingFocus: jest.fn() }))
jest.mock('./components/session/ReadAloudButton', () => ({ ReadAloudButton: () => null }))
jest.mock('./components/session/SessionFrame', () => ({
  SessionFrame: ({ children, dock }: { children: ReactNode; dock?: ReactNode }) => require('react').createElement(require('react').Fragment, null, children, dock),
}))
jest.mock('./components/session/QuestionDock', () => ({
  QuestionDock: jest.fn((props) => require('react').createElement(jest.requireActual('./components/session/QuestionDock').QuestionDock, props)),
}))
jest.mock('./components/sheet/sheet-host', () => ({ SheetHost: ({ children }: { children: ReactNode }) => children }))
jest.mock('./components/reveal/reveal-overlay', () => ({ RevealOverlay: () => null }))

const question: ItemView = {
  id: 'short-answer', conceptId: 'safety', conceptName: 'Safety', format: 'short',
  stem: 'What do you do first?', options: [], blank: null, image: null, difficulty: 1,
}
const oldText = 'The previous answer'
const answerRequests = () => jest.mocked(api).mock.calls.filter(([path]) => path.endsWith('/answer'))
const stream = () => jest.requireMock('expo-audio').stream as { start: jest.Mock<Promise<void>, []>; stop: jest.Mock<void, []> }

function deferred<T>() {
  let resolve!: (value: T) => void
  let reject!: (reason: Error) => void
  const promise = new Promise<T>((done, fail) => { resolve = done; reject = fail })
  return { promise, resolve, reject }
}

async function review() {
  await render(h(ThemeProvider, { children: h(SessionScreen) }))
  await fireEvent.press(await screen.findByRole('button', { name: 'Type instead' }))
  await fireEvent.changeText(screen.getByLabelText('Your answer'), oldText)
  await fireEvent.press(screen.getByRole('radio', { name: 'Sure' }))
  expect(screen.getByRole('button', { name: 'Check' })).toBeEnabled()
}

async function expectBlocked() {
  const check = screen.getByRole('button', { name: 'Check' })
  // A native submit already queued for delivery must also hit the screen guard,
  // independently of Pressable suppressing taps on the disabled control.
  await act(async () => { jest.mocked(QuestionDock).mock.lastCall![0].onSubmit() })
  expect(answerRequests()).toHaveLength(0)
  expect(check).toBeDisabled()
  await fireEvent.press(check)
  expect(answerRequests()).toHaveLength(0)
}

async function submit(text: string) {
  expect(screen.getByLabelText('Your answer')).toHaveProp('value', text)
  expect(screen.getByRole('button', { name: 'Check' })).toBeEnabled()
  await fireEvent.press(screen.getByRole('button', { name: 'Check' }))
  expect(answerRequests()).toHaveLength(1)
  expect(answerRequests()[0][1]).toEqual(expect.objectContaining({ body: expect.objectContaining({
    itemId: question.id, answer: { text }, confidence: 'sure',
  }) }))
}

beforeEach(() => {
  jest.clearAllMocks()
  stream().start.mockReset().mockResolvedValue()
  stream().stop.mockReset()
  jest.mocked(requestRecordingPermissionsAsync).mockReset().mockResolvedValue({ granted: true, canAskAgain: true } as never)
  jest.mocked(api).mockImplementation(async (path) => path.endsWith('/answer') ? { correct: true } : {
    id: 'personal-session', item: question, ended: false, progress: { position: 1, total: 20 }, voiceEnabled: true,
  })
})
afterEach(() => jest.restoreAllMocks())

test('re-record blocks Check through delayed permission, startup, recording and transcription, then submits the edited new answer', async () => {
  const permission = deferred<Awaited<ReturnType<typeof requestRecordingPermissionsAsync>>>()
  const startup = deferred<void>()
  const transcript = deferred<string>()
  jest.mocked(requestRecordingPermissionsAsync).mockReturnValueOnce(permission.promise)
  jest.mocked(postForm).mockReturnValueOnce(transcript.promise)
  await review()
  stream().start.mockReturnValueOnce(startup.promise)

  await fireEvent.press(screen.getByRole('button', { name: 'Record again' }))
  await expectBlocked()
  expect(stream().start).not.toHaveBeenCalled()
  await act(async () => { permission.resolve({ granted: true, canAskAgain: true } as never) })
  expect(stream().start).toHaveBeenCalledTimes(1)
  await expectBlocked()
  await act(async () => { startup.resolve() })
  const stop = screen.getByRole('togglebutton', { name: 'Stop recording' })
  expect(stop).toBeEnabled()
  await expectBlocked()

  const onBuffer = jest.mocked(useAudioStream).mock.lastCall![0]!.onBuffer as BufferCallback
  await act(async () => { onBuffer({ data: new Int16Array(2400).fill(3000).buffer, sampleRate: 24_000, channels: 1 }) })
  await fireEvent.press(stop)
  expect(stream().stop).toHaveBeenCalledTimes(1)
  expect(screen.getByText('Turning your recording into text…')).toHaveProp('accessibilityLiveRegion', 'polite')
  await expectBlocked()
  await act(async () => { transcript.resolve('Hit the stop button') })
  expect(screen.getByLabelText('Your answer')).toHaveProp('value', 'Hit the stop button')
  await fireEvent.changeText(screen.getByLabelText('Your answer'), 'Hit the emergency stop')
  await submit('Hit the emergency stop')
})

test.each(['denied permission', 'failed startup'] as const)('%s restores the review text and enables Check', async (outcome) => {
  const permission = deferred<Awaited<ReturnType<typeof requestRecordingPermissionsAsync>>>()
  const startup = deferred<void>()
  jest.mocked(requestRecordingPermissionsAsync).mockReturnValueOnce(permission.promise)
  await review()
  stream().start.mockReturnValueOnce(startup.promise)
  await fireEvent.press(screen.getByRole('button', { name: 'Record again' }))
  await expectBlocked()
  await act(async () => { permission.resolve({ granted: outcome !== 'denied permission', canAskAgain: true } as never) })
  if (outcome === 'failed startup') {
    await expectBlocked()
    await act(async () => { startup.reject(new Error('Microphone unavailable')) })
  }
  expect(screen.getByRole('button', { name: 'Record again' })).toBeEnabled()
  await submit(oldText)
})

test('cancelling a pending re-record restores the old text and stops a late microphone start', async () => {
  const startup = deferred<void>()
  let background!: () => void
  jest.spyOn(AppState, 'addEventListener').mockImplementation((_event, listener) => {
    background = () => listener('background')
    return { remove: jest.fn() }
  })
  await review()
  stream().start.mockReturnValueOnce(startup.promise)
  await fireEvent.press(screen.getByRole('button', { name: 'Record again' }))
  expect(stream().start).toHaveBeenCalledTimes(1)
  await expectBlocked()
  await act(async () => { background(); startup.resolve() })
  expect(stream().stop).toHaveBeenCalledTimes(1)
  expect(postForm).not.toHaveBeenCalled()
  await submit(oldText)
})
