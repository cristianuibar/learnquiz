// @vitest-environment happy-dom
import { act } from 'react'
import { createRoot } from 'react-dom/client'
import { createMemoryHistory, createRootRoute, createRoute, createRouter, RouterProvider } from '@tanstack/react-router'
import { afterEach, beforeEach, expect, it, vi } from 'vitest'
import { Route as appRootRoute } from '@/routes/__root'
import { Route as pathRoute } from '@/routes/t.$topicId.path'
import { Route as playRoute } from '@/routes/play.$sessionId'
import { getConceptItems, getTopicPath } from '@/server/curriculum'
import { answerItem, getSession } from '@/server/play'
import { getSessionFn } from '@/server/session-fn'

vi.mock('@tanstack/react-start', () => ({ useServerFn: (fn: unknown) => fn }))
vi.mock('@/lib/auth-client', () => ({ authClient: {} }))
vi.mock('@/server/org-settings', () => ({ getCompanyBranding: async () => null }))
vi.mock('@/server/latest-topic', () => ({ getLatestTopicIdFn: async () => 'topic' }))
vi.mock('@/server/session-fn', () => ({ getSessionFn: vi.fn() }))
vi.mock('@/server/curriculum', () => ({ getTopicPath: vi.fn(), getConceptItems: vi.fn() }))
vi.mock('@/server/model-trace', () => ({ getModelTrace: vi.fn() }))
vi.mock('@/server/diagrams', () => ({ generateConceptDiagram: vi.fn() }))
vi.mock('@/server/play', () => ({
  prepareNextSession: vi.fn(async () => ({ ok: true })), answerItem: vi.fn(), getSession: vi.fn(), nextItem: vi.fn(), endSession: vi.fn(), reportItem: vi.fn(), startPlacement: vi.fn(), startSession: vi.fn(),
}))

beforeEach(() => {
  Object.assign(globalThis, { IS_REACT_ACT_ENVIRONMENT: true })
  const reducedMotion = window.matchMedia('(prefers-reduced-motion)')
  Object.defineProperty(reducedMotion, 'matches', { value: true })
  vi.spyOn(window, 'matchMedia').mockReturnValue(reducedMotion)
  vi.spyOn(navigator, 'onLine', 'get').mockReturnValue(true)
  vi.mocked(getSessionFn).mockResolvedValue({ user: { id: 'learner', name: 'Learner', isAnonymous: false }, facebookEnabled: false, needsDisclosure: false, adminCompanies: [] })
  vi.mocked(getTopicPath).mockResolvedValue({
    topic: { id: 'topic', title: 'Arithmetic', goal: null, status: 'ready', generatedBy: null },
    preparing: false,
    placeable: true,
    company: null,
    learner: { level: 1, levelLine: null, levelLineModel: null, placed: false, xp: 0, streak: 0 }, units: [], edges: [],
  })
  vi.mocked(getSession).mockResolvedValue({
    id: 'session', kind: 'session', topicId: 'topic', topicTitle: 'Arithmetic', ended: false,
    progress: { position: 1, total: 1 },
    item: { id: 'item', conceptId: 'concept', conceptName: 'Addition', format: 'mcq', stem: '2 + 2?', options: [{ id: 'four', text: '4' }], blank: null, image: null, difficulty: 1 },
  })
})

afterEach(() => {
  vi.restoreAllMocks()
  vi.resetAllMocks()
  delete (globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT
})

async function renderApp(initialEntry = '/today') {
  const rootRoute = createRootRoute({
    beforeLoad: appRootRoute.options.beforeLoad,
    loader: appRootRoute.options.loader,
    component: appRootRoute.options.component,
    errorComponent: appRootRoute.options.errorComponent,
  })
  const start = createRoute({ getParentRoute: () => rootRoute, path: '/today', component: () => <h1>Today</h1> })
  const path = createRoute({ getParentRoute: () => rootRoute, path: '/t/$topicId/path', loader: pathRoute.options.loader, component: pathRoute.options.component, errorComponent: pathRoute.options.errorComponent })
  const play = createRoute({ getParentRoute: () => rootRoute, path: '/play/$sessionId', loader: playRoute.options.loader, component: playRoute.options.component, errorComponent: playRoute.options.errorComponent })
  const done = createRoute({ getParentRoute: () => rootRoute, path: '/play/$sessionId/done', component: () => <h1>Session complete</h1> })
  const router = createRouter({ routeTree: rootRoute.addChildren([start, path, play, done]), history: createMemoryHistory({ initialEntries: [initialEntry] }), defaultPendingMinMs: 0 })
  const container = document.createElement('div')
  document.body.appendChild(container)
  const root = createRoot(container)
  await act(async () => { await router.load(); root.render(<RouterProvider router={router} />) })
  return {
    container,
    router,
    async cleanup() {
      await act(async () => root.unmount())
      container.remove()
    },
  }
}

it.each(['session', 'path'] as const)('recovers an offline Path navigation when the %s request fails', async (request) => {
  const { container, router, cleanup } = await renderApp()
  try {
    vi.spyOn(navigator, 'onLine', 'get').mockReturnValue(false)
    const load = request === 'session' ? vi.mocked(getSessionFn) : vi.mocked(getTopicPath)
    load.mockRejectedValueOnce(new TypeError('Failed to fetch'))
    await act(async () => {
      container.querySelector<HTMLAnchorElement>('nav a[href="/t/topic/path"]')!.click()
      await vi.waitFor(() => expect(router.state.matches.some((match) => match.status === 'error')).toBe(true))
    })
    expect(container.querySelector('[role="alert"]')?.textContent ?? container.textContent).toContain("You're offline")
    vi.spyOn(navigator, 'onLine', 'get').mockReturnValue(true)
    await act(async () => { container.querySelector<HTMLButtonElement>('[role="alert"] button')!.click() })
    expect(container.querySelector('h1')?.textContent).toBe('Arithmetic')
    expect(container.querySelector('[role="alert"]')).toBeNull()
  } finally {
    await cleanup()
  }
})

it('shows the offline message for answered questions on Path and loads them with Try again online', async () => {
  vi.mocked(getTopicPath).mockResolvedValue({
    topic: { id: 'topic', title: 'Arithmetic', goal: null, status: 'ready', generatedBy: null },
    preparing: false,
    placeable: true,
    company: null,
    learner: { level: 1, levelLine: null, levelLineModel: null, placed: false, xp: 0, streak: 0 },
    units: [{ id: 'unit', order: 0, name: 'Basics', summary: '', mastery: 0, measured: false, unlocked: true, concepts: [{ id: 'concept', order: 0, name: 'Addition', summary: '', visual: false, grounded: false, critical: false, itemCount: 1, pKnown: 0 }] }],
    edges: [],
  })
  const { container, cleanup } = await renderApp('/t/topic/path')
  try {
    const showButton = () => [...container.querySelectorAll('button')].find((button) => button.textContent === 'Show answered questions')
    vi.spyOn(navigator, 'onLine', 'get').mockReturnValue(false)
    vi.mocked(getConceptItems).mockRejectedValueOnce(new TypeError('Failed to fetch'))
    await act(async () => { showButton()!.click() })
    const alert = container.querySelector('[role="alert"]')
    expect(alert?.textContent).toContain("You're offline")
    expect(alert?.textContent).not.toContain('Failed to fetch')
    vi.spyOn(navigator, 'onLine', 'get').mockReturnValue(true)
    vi.mocked(getConceptItems).mockResolvedValueOnce({ items: [] })
    await act(async () => { alert!.querySelector('button')!.click() })
    expect(getConceptItems).toHaveBeenLastCalledWith({ data: { conceptId: 'concept' } })
    expect(container.querySelector('[role="status"]')?.textContent).toBe('No answered questions to review yet.')
    expect(container.querySelector('[role="alert"]')).toBeNull()
  } finally {
    await cleanup()
  }
})

it('opens and closes the answered questions on Path from the same button', async () => {
  vi.mocked(getTopicPath).mockResolvedValue({
    topic: { id: 'topic', title: 'Arithmetic', goal: null, status: 'ready', generatedBy: null },
    preparing: false,
    placeable: true,
    company: null,
    learner: { level: 1, levelLine: null, levelLineModel: null, placed: false, xp: 0, streak: 0 },
    units: [{ id: 'unit', order: 0, name: 'Basics', summary: '', mastery: 0, measured: false, unlocked: true, concepts: [{ id: 'concept', order: 0, name: 'Addition', summary: '', visual: false, grounded: false, critical: false, itemCount: 1, pKnown: 0 }] }],
    edges: [],
  })
  vi.mocked(getConceptItems).mockResolvedValue({
    items: [{
      id: 'item', format: 'cloze', difficultyPrior: 1, generatedBy: null,
      payload: { format: 'cloze', stem: '2 + 2 = ____', options: [], accepted_answers: ['4'], model_answer: '4', explanation: 'Two plus two is four.', difficulty: 1, source_quote: null, grounded: false, bloom: 'remember' },
    }],
  })
  const { container, cleanup } = await renderApp('/t/topic/path')
  try {
    const button = () => [...container.querySelectorAll('button')].find((b) => b.textContent?.endsWith('answered questions'))!
    const list = () => document.getElementById(button().getAttribute('aria-controls')!)!
    expect(button().textContent).toBe('Show answered questions')
    expect(button().getAttribute('aria-expanded')).toBe('false')
    await act(async () => { button().click() })
    expect(button().textContent).toBe('Hide answered questions')
    expect(button().getAttribute('aria-expanded')).toBe('true')
    expect(list().hidden).toBe(false)
    expect(list().textContent).toContain('2 + 2 = ____')
    await act(async () => { button().click() })
    expect(button().textContent).toBe('Show answered questions')
    expect(button().getAttribute('aria-expanded')).toBe('false')
    expect(list().hidden).toBe(true)
    await act(async () => { button().click() })
    expect(button().getAttribute('aria-expanded')).toBe('true')
    expect(list().hidden).toBe(false)
    expect(getConceptItems).toHaveBeenCalledTimes(1)
  } finally {
    await cleanup()
  }
})

it('keeps the answer after an offline Check and submits it with Try again online', async () => {
  const { container, cleanup } = await renderApp('/play/session')
  try {
    await act(async () => {
      container.querySelector<HTMLInputElement>('input[name="answer"]')!.click()
      container.querySelector<HTMLInputElement>('input[value="sure"]')!.click()
    })
    vi.spyOn(navigator, 'onLine', 'get').mockReturnValue(false)
    vi.mocked(answerItem).mockRejectedValueOnce(new TypeError('Failed to fetch'))
    await act(async () => { container.querySelector<HTMLButtonElement>('button[form="play"]')!.click() })
    expect(container.querySelector('[role="alert"]')?.textContent).toBe('Couldn’t check your answer. It’s saved on this device.')
    const retry = document.activeElement as HTMLButtonElement
    expect(retry.textContent?.trim()).toBe('Try again')
    vi.spyOn(navigator, 'onLine', 'get').mockReturnValue(true)
    vi.mocked(answerItem).mockResolvedValueOnce({
      attemptId: 'attempt', diagramConceptId: null, state: 'A', correct: true, score: 1, feedback: null, missingPoints: [], correctAnswer: '4', chosenFeedback: null, explanation: 'Two plus two is four.', sourceQuote: null, sourceTitle: null, mixUps: [], returnsThisSession: false, pKnownBefore: 0.1, pKnownAfter: 0.5, xp: 10, critical: false, correctOptionIds: ['four'], sourceVersion: null, detail: null,
    })
    await act(async () => { retry.click() })
    expect(answerItem).toHaveBeenLastCalledWith({ data: expect.objectContaining({ itemId: 'item', answer: { optionId: 'four' }, confidence: 'sure' }) })
    expect(container.querySelector('[role="status"] h2')?.textContent).toBe('Correct, you were sure')
    expect(container.querySelector('[role="alert"]')).toBeNull()
  } finally {
    await cleanup()
  }
})

it.each([false, true])('resyncs after a question is retired during an answer (session ended: %s)', async (ended) => {
  const { container, cleanup } = await renderApp('/play/session')
  try {
    await act(async () => {
      container.querySelector<HTMLInputElement>('input[name="answer"]')!.click()
      container.querySelector<HTMLInputElement>('input[value="sure"]')!.click()
    })
    // Server errors can arrive without custom status properties after serialization.
    vi.mocked(answerItem).mockRejectedValueOnce(new Error('This question has been retired'))
    vi.mocked(getSession).mockResolvedValue({
      id: 'session', kind: 'session', topicId: 'topic', topicTitle: 'Arithmetic', ended,
      progress: { position: 2, total: 2 },
      item: ended ? null : { id: 'next', conceptId: 'concept', conceptName: 'Addition', format: 'mcq', stem: '3 + 3?', options: [{ id: 'six', text: '6' }], blank: null, image: null, difficulty: 1 },
    })
    await act(async () => { container.querySelector<HTMLButtonElement>('button[form="play"]')!.click() })
    expect(container.textContent).toContain(ended ? 'Session complete' : '3 + 3?')
    expect(container.textContent).not.toContain('2 + 2?')
    expect(container.querySelector('[role="alert"]')).toBeNull()
    expect(answerItem).toHaveBeenCalledTimes(1)
    if (!ended) expect(container.querySelector<HTMLButtonElement>('button[form="play"]')?.disabled).toBe(true)
  } finally {
    await cleanup()
  }
})
