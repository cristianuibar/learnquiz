import { createElement as h, type ReactNode } from 'react'
import { act, fireEvent, render, screen } from '@testing-library/react-native'
import { AccessibilityInfo, Dimensions } from 'react-native'
import { themes } from '@learnquiz/tokens/native'
import type { ItemView } from '@learnquiz/api'
import SessionScreen from './app/play/[sessionId]/index'
import QuickSessionScreen from './app/play/quick/[itemId]'
import { useHeadingFocus } from './components/ui/Screen'
import { ReadAloudButton } from './components/session/ReadAloudButton'
import { api, postForm } from './lib/api'
import { ThemeProvider } from './theme/ThemeProvider'

jest.mock('expo-router', () => {
  const router = { replace: jest.fn() }
  return {
    useLocalSearchParams: () => ({ sessionId: 'session-337', itemId: 'item-337', announceReady: '1' }),
    useRouter: () => router,
    useFocusEffect: jest.fn(),
  }
})
jest.mock('expo-image', () => ({ Image: require('react-native').Image }))
jest.mock('react-native-safe-area-context', () => ({ useSafeAreaInsets: () => ({ top: 24, bottom: 0, left: 0, right: 0 }) }))
jest.mock('react-native-keyboard-controller', () => ({ KeyboardAvoidingView: require('react-native').View }))
jest.mock('./lib/haptics', () => ({ resultHaptic: jest.fn() }))
jest.mock('./components/question/diagram-image', () => ({ DiagramImage: () => null }))
type MockOnBuffer = (chunk: { data: ArrayBuffer; sampleRate: number; channels: number }) => void
jest.mock('expo-audio', () => {
  const stream = { start: jest.fn(async () => {}), stop: jest.fn() }
  const audio = {
    onBuffer: null as null | MockOnBuffer,
    useAudioStream: (options: { onBuffer: MockOnBuffer }) => {
      audio.onBuffer = options.onBuffer
      return { stream, isStreaming: false }
    },
    requestRecordingPermissionsAsync: jest.fn(async () => ({ granted: true, canAskAgain: true })),
  }
  return audio
})
jest.mock('./components/session/ReadAloudButton', () => ({ ReadAloudButton: jest.fn(() => null) }))
jest.mock('./lib/api', () => ({ api: jest.fn(), postForm: jest.fn() }))
jest.mock('./lib/session-store', () => ({ useSession: () => ({ branding: null }) }))
jest.mock('./lib/session/draft', () => ({
  draftForView: jest.fn(async () => ({ answer: {}, confidence: null })),
  writeDraft: jest.fn(async () => {}),
  deleteDraft: jest.fn(async () => {}),
}))
jest.mock('./components/ui/Screen', () => ({ useHeadingFocus: jest.fn() }))
jest.mock('./components/session/SessionFrame', () => ({
  SessionFrame: ({ children, trailing }: { children: ReactNode; trailing?: ReactNode }) => [trailing, children],
}))
jest.mock('./components/session/QuestionDock', () => ({ QuestionDock: () => null }))
jest.mock('./components/sheet/sheet-host', () => ({
  SheetHost: ({ children }: { children: ReactNode }) => children,
}))
jest.mock('./components/reveal/reveal-overlay', () => ({ RevealOverlay: () => null }))

const item: ItemView = {
  id: 'item-337', conceptId: 'lifting', conceptName: 'Lifting', format: 'cloze',
  stem: 'The pallet limit is ____.', options: [], blank: { numeric: true }, image: null, difficulty: 1,
}

async function session(question: ItemView = item, voiceEnabled?: boolean) {
  jest.mocked(api).mockResolvedValue({
    id: 'session-337', item: question, ended: false, progress: { position: 1, total: 20 }, voiceEnabled,
  })
  await render(h(ThemeProvider, { children: h(SessionScreen) }))
}

beforeEach(() => { jest.clearAllMocks(); jest.mocked(useHeadingFocus).mockReset() })
afterEach(() => jest.restoreAllMocks())

test.each(['mcq', 'cloze'] as const)('ready waits for the delayed first %s item to render and focus', async (format) => {
  const frames: FrameRequestCallback[] = []
  const events: string[] = []
  jest.spyOn(global, 'requestAnimationFrame').mockImplementation((callback) => { frames.push(callback); return frames.length })
  jest.spyOn(global, 'cancelAnimationFrame').mockImplementation(() => {})
  jest.spyOn(AccessibilityInfo, 'announceForAccessibility').mockImplementation((message) => { events.push(message) })
  jest.mocked(useHeadingFocus).mockImplementation(() => {
    require('react').useEffect(() => {
      requestAnimationFrame(() => { events.push('stem focus') })
    }, [])
  })
  let resolve!: (value: unknown) => void
  jest.mocked(api).mockImplementation(() => new Promise((done) => { resolve = done }))
  await render(h(ThemeProvider, { children: h(SessionScreen) }))
  async function frame() {
    const pending = frames.splice(0)
    await act(() => { pending.forEach((callback) => callback(0)) })
  }
  await frame()
  await frame()
  expect(events).toEqual([])
  const question = { ...item, format, options: format === 'mcq' ? [{ id: 'a', text: 'Receiving' }] : [] }
  await act(async () => { resolve({ item: question, ended: false, progress: { position: 1, total: 20 } }) })
  expect(format === 'cloze' ? screen.getByLabelText('Missing number') : screen.getByRole('header', { name: item.stem })).toBeOnTheScreen()
  expect(events).toEqual([])
  await frame()
  expect(events).toEqual(format === 'mcq' ? ['stem focus'] : [])
  await frame()
  expect(events).toEqual(format === 'mcq' ? ['stem focus', 'Your session is ready.'] : ['Your session is ready.'])
  await frame()
  expect(AccessibilityInfo.announceForAccessibility).toHaveBeenCalledTimes(1)
})

test('cloze has no duplicate stem heading and leaves focus with the blank', async () => {
  await session()
  const field = await screen.findByLabelText('Missing number')
  expect(screen.queryByRole('header', { name: item.stem })).toBeNull()
  expect(screen.queryByText(item.stem)).toBeNull()
  expect(useHeadingFocus).not.toHaveBeenCalled()
  expect(field).toHaveProp('autoFocus', true)
})

test('multiple choice keeps its stem heading and heading focus', async () => {
  const mcq: ItemView = {
    ...item, format: 'mcq', stem: 'Where should the pallet go?', blank: null,
    options: [{ id: 'receiving', text: 'Receiving' }],
  }
  await session(mcq)
  expect(await screen.findByRole('header', { name: mcq.stem })).toBeOnTheScreen()
  expect(useHeadingFocus).toHaveBeenCalledTimes(1)
  expect(screen.getByRole('radio', { name: 'Receiving' })).toBeOnTheScreen()
})

describe.each(['light', 'dark'] as const)('%s multi-select stem', (scheme) => {
  test.each(['session', 'quick'] as const)('%s groups one caption under the focused heading at 200%% font scale', async (route) => {
    const windowSize = Dimensions.get('window')
    Dimensions.set({ window: { ...windowSize, width: 320, fontScale: 2 } })
    try {
      const question: ItemView = {
        ...item, format: 'multi', stem: 'Which cartons need a lead’s sign-off?', blank: null,
        options: [{ id: 'hazmat', text: 'Hazmat cartons' }, { id: 'seal', text: 'Broken seal' }],
      }
      jest.mocked(api).mockResolvedValueOnce(route === 'quick' ? { sessionId: 'session-337' } : {
        id: 'session-337', item: question, ended: false, progress: { position: 1, total: 20 },
      }).mockResolvedValue({ id: 'session-337', item: question, ended: false, progress: { position: 1, total: 20 } })
      await render(h(ThemeProvider, { scheme, children: h(route === 'quick' ? QuickSessionScreen : SessionScreen) }))
      const heading = await screen.findByRole('header', { name: question.stem })
      const caption = screen.getByText('Choose all that apply')
      expect(screen.getAllByText('Choose all that apply')).toHaveLength(1)
      expect(caption.parent).toBe(heading.parent)
      expect(heading.parent).toHaveStyle({ gap: 4 })
      expect(caption).toHaveStyle({ color: themes[scheme].inkMuted, fontSize: 13, lineHeight: 18 })
      for (const text of [heading, caption]) {
        expect(text.props.numberOfLines).toBeUndefined()
        expect(text.props.allowFontScaling).not.toBe(false)
        expect(text.props.maxFontSizeMultiplier).toBeUndefined()
      }
      if (route === 'session') expect(heading.parent!.parent).toHaveStyle({ gap: 24 })
      expect(screen.getByLabelText(question.stem)).toHaveProp('accessibilityHint', 'Choose all that apply')
      expect(screen.getByRole('checkbox', { name: 'Hazmat cartons' })).toBeOnTheScreen()
      expect(useHeadingFocus).toHaveBeenCalledTimes(1)
    } finally {
      Dimensions.set({ window: windowSize })
    }
  })
})

test.each([true, false])('cloze exposes one sentence and a separate labelled field (numeric: %s)', async (numeric) => {
  await session({ ...item, blank: { numeric } })
  const field = await screen.findByLabelText(numeric ? 'Missing number' : 'Missing word')
  expect(screen.getAllByRole('text', { name: 'The pallet limit is blank.' })).toHaveLength(1)
  expect(screen.queryByRole('text', { name: 'The' })).toBeNull()
  expect(screen.queryByRole('text', { name: 'pallet' })).toBeNull()
  expect(field).toBeOnTheScreen()
})

test.each([
  ['The pallet limit is ____.', '.'],
  ['Lift ____, then rest', ','],
])('punctuation stays in the same unbroken group as the field: %s', async (stem, punctuation) => {
  await session({ ...item, stem })
  const field = await screen.findByLabelText('Missing number')
  const suffix = screen.getByText(punctuation)
  expect(screen.getByRole('text', { name: stem.replace('____', 'blank') })).toBeOnTheScreen()
  expect(suffix.parent).toBe(field.parent)
  expect(field.parent).toHaveStyle({ flexDirection: 'row', flexWrap: 'nowrap', gap: 0 })
  await fireEvent(field, 'focus')
  expect(field).toHaveStyle({ marginHorizontal: 4, outlineWidth: 2, outlineOffset: 2, width: 88, minHeight: 36 })
})

const short: ItemView = { ...item, format: 'short', stem: 'A carton is stuck in the conveyor. What do you do?', blank: null }

test('a short answer offers recording when the session allows voice', async () => {
  await session(short, true)
  expect(await screen.findByRole('togglebutton', { name: 'Record answer' })).toBeOnTheScreen()
  expect(screen.getByText('Tap to record')).toBeOnTheScreen()
  expect(screen.getByRole('button', { name: 'Type instead' })).toBeOnTheScreen()
  expect(screen.queryByLabelText('Your answer')).toBeNull()
})

test.each([false, undefined])('a role topic or an older server (voiceEnabled %s) types the short answer only', async (voiceEnabled) => {
  await session(short, voiceEnabled)
  expect(await screen.findByLabelText('Your answer')).toBeOnTheScreen()
  expect(screen.queryByRole('togglebutton', { name: 'Record answer' })).toBeNull()
  expect(screen.queryByText('Tap to record')).toBeNull()
})

test('Read aloud is blocked from the record tap until the transcript lands', async () => {
  const readAloudBlocked = () => jest.mocked(ReadAloudButton).mock.lastCall?.[0].blocked
  let transcribe!: (text: unknown) => void
  jest.mocked(postForm).mockImplementation(() => new Promise((done) => { transcribe = done }))
  await session(short, true)
  await screen.findByRole('togglebutton', { name: 'Record answer' })
  expect(readAloudBlocked()).toBe(false)

  await act(async () => { fireEvent.press(screen.getByRole('togglebutton', { name: 'Record answer' })) })
  expect(await screen.findByRole('togglebutton', { name: 'Stop recording' })).toBeOnTheScreen()
  expect(readAloudBlocked()).toBe(true)

  const audio = jest.requireMock('expo-audio') as { onBuffer: MockOnBuffer }
  await act(async () => { audio.onBuffer({ data: new Int16Array(2400).fill(3000).buffer, sampleRate: 24_000, channels: 1 }) })
  await act(async () => { fireEvent.press(screen.getByRole('togglebutton', { name: 'Stop recording' })) })
  expect(screen.getByText('Turning your recording into text…')).toBeOnTheScreen()
  expect(readAloudBlocked()).toBe(true)

  await act(async () => { transcribe('Hit the stop button') })
  expect(await screen.findByRole('button', { name: 'Record again' })).toBeOnTheScreen()
  expect(readAloudBlocked()).toBe(false)
})
