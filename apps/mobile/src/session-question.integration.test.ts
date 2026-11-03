import { createElement as h, type ReactNode } from 'react'
import { act, render, screen } from '@testing-library/react-native'
import { AccessibilityInfo } from 'react-native'
import type { ItemView } from '@learnquiz/api'
import SessionScreen from './app/play/[sessionId]/index'
import { useHeadingFocus } from './components/ui/Screen'
import { api } from './lib/api'
import { ThemeProvider } from './theme/ThemeProvider'

jest.mock('expo-router', () => {
  const router = { replace: jest.fn() }
  return {
    useLocalSearchParams: () => ({ sessionId: 'session-337', announceReady: '1' }),
    useRouter: () => router,
    useFocusEffect: jest.fn(),
  }
})
jest.mock('expo-image', () => ({ Image: require('react-native').Image }))
jest.mock('./lib/api', () => ({ api: jest.fn() }))
jest.mock('./lib/session-store', () => ({ useSession: () => ({ branding: null }) }))
jest.mock('./lib/session/draft', () => ({
  draftForView: jest.fn(async () => ({ answer: {}, confidence: null })),
  writeDraft: jest.fn(async () => {}),
  deleteDraft: jest.fn(async () => {}),
}))
jest.mock('./components/ui/Screen', () => ({ useHeadingFocus: jest.fn() }))
jest.mock('./components/session/SessionFrame', () => ({
  SessionFrame: ({ children }: { children: ReactNode }) => children,
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

async function session(question: ItemView = item) {
  jest.mocked(api).mockResolvedValue({
    item: question, ended: false, progress: { position: 1, total: 20 },
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
})
