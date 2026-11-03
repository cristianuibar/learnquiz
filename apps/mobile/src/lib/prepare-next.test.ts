import { createElement } from 'react'
import { AppState, type AppStateStatus } from 'react-native'
import { act, fireEvent, render, screen } from '@testing-library/react-native'
import type { SessionView, SummaryView } from '@learnquiz/api'
import SessionScreen from '../app/play/[sessionId]/index'
import SessionDone from '../app/play/[sessionId]/done'
import { ThemeProvider } from '../theme/ThemeProvider'
import { api } from './api'
import { placementToPrepare, prepareNext, sessionToPrepare } from './prepare-next'

jest.mock('./api', () => ({ api: jest.fn() }))
jest.mock('./session-store', () => ({ useSession: () => ({ branding: null }) }))
jest.mock('./session/draft', () => ({
  draftForView: jest.fn(async () => ({ answer: {}, confidence: null })),
  deleteDraft: jest.fn(async () => {}),
  writeDraft: jest.fn(async () => {}),
}))
jest.mock('./push-prompt', () => ({ recordFinished: jest.fn(async () => {}) }))
jest.mock('expo-notifications', () => ({}))
jest.mock('../components/question/question-body', () => ({ QuestionBody: () => null }))
jest.mock('../components/reveal/reveal-overlay', () => ({ RevealOverlay: () => null }))
jest.mock('../components/sheet/sheet-host', () => ({ SheetHost: ({ children }: { children: unknown }) => children }))
jest.mock('../components/ui/Screen', () => ({
  Screen: ({ children, dock }: { children: unknown; dock: unknown }) =>
    require('react').createElement(require('react-native').View, null, children, dock),
  useHeadingFocus: jest.fn(),
}))
jest.mock('react-native-safe-area-context', () => ({ useSafeAreaInsets: () => ({ top: 0, bottom: 0, left: 0, right: 0 }) }))
jest.mock('react-native-keyboard-controller', () => ({
  KeyboardAvoidingView: require('react-native').View,
  KeyboardAwareScrollView: require('react-native').ScrollView,
  useKeyboardState: () => false,
}))

const mockRouter = { replace: jest.fn(), dismissAll: jest.fn(), dismissTo: jest.fn() }
let mockCurrentRouter = mockRouter
jest.mock('expo-router', () => ({
  useLocalSearchParams: () => ({ sessionId: 's1' }),
  useRouter: () => mockCurrentRouter,
  useFocusEffect: (effect: () => void) => require('react').useEffect(effect, [effect]),
  Stack: { Screen: () => null },
}))

const request = jest.mocked(api)
const session = { id: 's1', kind: 'session', ended: false } as const
const placement = { sessionId: 'p1', kind: 'placement' } as const

beforeEach(() => {
  request.mockReset()
  request.mockResolvedValue({ ok: true })
})

test('posts preparation through the shared API client with an encoded session ID', async () => {
  await expect(prepareNext('s/1 ?')).resolves.toBeUndefined()
  expect(request).toHaveBeenCalledTimes(1)
  expect(request).toHaveBeenCalledWith('/sessions/s%2F1%20%3F/prepare-next', { method: 'POST', timeoutMs: 300_000 })
})

test('preparation errors are swallowed without retrying', async () => {
  request.mockRejectedValue(new Error('offline'))
  await expect(prepareNext('s1')).resolves.toBeUndefined()
  expect(request).toHaveBeenCalledTimes(1)
})

test('active practice fires once across question changes and foreground refetches', async () => {
  let preparedId: string | null = null
  for (const view of [null, session, { ...session }, { ...session }]) {
    const id = sessionToPrepare(view, preparedId, true)
    if (id) {
      preparedId = id
      await prepareNext(id)
    }
  }
  expect(request).toHaveBeenCalledTimes(1)
  expect(request).toHaveBeenCalledWith('/sessions/s1/prepare-next', { method: 'POST', timeoutMs: 300_000 })
})

test('another session can prepare even when the prior session already did', () => {
  expect(sessionToPrepare({ ...session, id: 's2' }, 's1', true)).toBe('s2')
})

test.each<SessionView['kind']>(['placement', 'mock', 'mini'])('does not prepare while playing %s', (kind) => {
  expect(sessionToPrepare({ ...session, kind }, null, true)).toBeNull()
})

test('does not prepare before loading or after a session ends', () => {
  expect(sessionToPrepare(null, null, true)).toBeNull()
  expect(sessionToPrepare({ ...session, ended: true }, null, true)).toBeNull()
})

test('does not prepare after leaving or unmounting even with an unended view', () => {
  expect(sessionToPrepare(session, null, false)).toBeNull()
})

test('a failed attempt still fires only once for the session', async () => {
  request.mockRejectedValue(new Error('server unavailable'))
  const id = sessionToPrepare(session, null, true)!
  await prepareNext(id)
  expect(sessionToPrepare({ ...session }, id, true)).toBeNull()
  expect(request).toHaveBeenCalledTimes(1)
})

test('an ended placement prepares once when its summary is ready', async () => {
  expect(placementToPrepare(null, null)).toBeNull()
  const id = placementToPrepare(placement, null)!
  await prepareNext(id)
  expect(placementToPrepare({ ...placement }, id)).toBeNull()
  expect(request).toHaveBeenCalledTimes(1)
  expect(request).toHaveBeenCalledWith('/sessions/p1/prepare-next', { method: 'POST', timeoutMs: 300_000 })
})

test.each<SummaryView['kind']>(['session', 'mock', 'mini'])('does not prepare on a %s summary', (kind) => {
  expect(placementToPrepare({ ...placement, kind }, null)).toBeNull()
})

describe('screen triggers', () => {
  const view: SessionView = {
    ...session, topicId: 't1', topicTitle: 'Topic', progress: { position: 1, total: 3 },
    item: {
      id: 'i1', conceptId: 'c1', conceptName: 'Concept', format: 'mcq', stem: 'Question?',
      options: [{ id: 'a', text: 'A' }, { id: 'b', text: 'B' }], blank: null, image: null, difficulty: 1,
    },
  }
  const summary: SummaryView = {
    sessionId: 's1', kind: 'placement', topicId: 't1', durationMs: 1000, correct: 1, total: 1,
    ungraded: 0, xp: 0, streak: 0, level: 1, levelLine: null, levelLineModel: null,
    nextLine: '', masteryMoved: [], mistakes: [], benchmark: null, endedEarly: false, reviewsLeft: 0,
  }
  let onAppState: (state: AppStateStatus) => void
  const preparations = () => request.mock.calls.filter(([path]) => path.endsWith('/prepare-next'))
  const mount = (component: typeof SessionScreen) => render(createElement(ThemeProvider, { children: createElement(component) }))

  beforeEach(() => {
    mockCurrentRouter = mockRouter
    jest.spyOn(AppState, 'addEventListener').mockImplementation((_event, listener) => {
      onAppState = listener
      return { remove: jest.fn() }
    })
    Object.values(mockRouter).forEach((fn) => fn.mockClear())
  })

  afterEach(() => jest.restoreAllMocks())

  test('practice starts one request without waiting for preparation, including after a foreground refetch', async () => {
    request.mockImplementation(async (path) => path.endsWith('/prepare-next') ? new Promise(() => {}) : { ...view })
    await mount(SessionScreen)
    expect(screen.getByText('Question?')).toBeOnTheScreen()
    expect(preparations()).toHaveLength(1)
    await act(async () => { onAppState('background'); onAppState('active') })
    expect(request.mock.calls.filter(([path]) => path === '/sessions/s1')).toHaveLength(2)
    expect(preparations()).toHaveLength(1)
  })

  test('a session already ended on load never starts preparation', async () => {
    request.mockResolvedValue({ ...view, ended: true, item: null })
    await mount(SessionScreen)
    expect(mockRouter.replace).toHaveBeenCalledWith('/play/s1/done')
    expect(preparations()).toHaveLength(0)
  })

  test('leaving while the session loads suppresses preparation from its late response', async () => {
    let resolve!: (value: SessionView) => void
    request.mockReturnValueOnce(new Promise<SessionView>((done) => { resolve = done }))
    await mount(SessionScreen)
    await fireEvent.press(screen.getByRole('button', { name: 'End session' }))
    await act(async () => resolve(view))
    expect(mockRouter.replace).toHaveBeenCalledWith('/(tabs)/today')
    expect(preparations()).toHaveLength(0)
  })

  test('unmounting while loading suppresses preparation from a late response', async () => {
    let resolve!: (value: SessionView) => void
    request.mockReturnValueOnce(new Promise<SessionView>((done) => { resolve = done }))
    const rendered = await mount(SessionScreen)
    await rendered.unmount()
    await act(async () => resolve(view))
    expect(preparations()).toHaveLength(0)
  })

  test.each<SessionView['kind']>(['placement', 'mock', 'mini'])('the %s player does not start preparation', async (kind) => {
    request.mockResolvedValue({ ...view, kind })
    await mount(SessionScreen)
    expect(preparations()).toHaveLength(0)
  })

  test('the placement summary starts one request even when its summary reloads', async () => {
    request.mockImplementation(async (path) => path.endsWith('/prepare-next') ? new Promise(() => {}) : { ...summary })
    const rendered = await mount(SessionDone)
    expect(screen.getByText('You’re at level 1 of 5')).toBeOnTheScreen()
    expect(preparations()).toHaveLength(1)
    // A changed router callback reloads the same summary in the mounted screen.
    mockCurrentRouter = { ...mockRouter }
    await rendered.rerender(createElement(ThemeProvider, { children: createElement(SessionDone) }))
    expect(request.mock.calls.filter(([path]) => path === '/sessions/s1/end')).toHaveLength(2)
    expect(preparations()).toHaveLength(1)
  })

  test.each<SummaryView['kind']>(['session', 'mock', 'mini'])('the %s summary does not start preparation', async (kind) => {
    request.mockResolvedValue({ ...summary, kind })
    await mount(SessionDone)
    expect(preparations()).toHaveLength(0)
  })
})
