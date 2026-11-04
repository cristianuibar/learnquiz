// @vitest-environment happy-dom
import { act } from 'react'
import { createRoot } from 'react-dom/client'
import { createMemoryHistory, createRootRoute, createRoute, createRouter, RouterProvider } from '@tanstack/react-router'
import { afterEach, expect, it, vi } from 'vitest'
import { Route as appRoot } from '@/routes/__root'
import { Route as doneRoute } from '@/routes/play.$sessionId_.done'
import { Route as quickRoute } from '@/routes/play.quick.$itemId'
import { Route as signInRoute } from '@/routes/sign-in'
import { Route as meRoute } from '@/routes/me.index'
import { Route as optInRoute } from '@/routes/opt-in'
import { answerItem, endSession, getSession, reportItem, startMiniSession } from '@/server/play'
import { getPushSettings, savePushPreferences } from '@/server/push'
import { getSessionFn } from '@/server/session-fn'
import type { Reveal, SessionView, SummaryView } from '@learnquiz/api'

vi.mock('motion/react', async (original) => ({ ...(await original<typeof import('motion/react')>()), useReducedMotion: () => true }))
vi.mock('@tanstack/react-start', () => ({ useServerFn: (fn: unknown) => fn }))
vi.mock('@/server/session-fn', () => ({ getSessionFn: vi.fn(async () => ({ user: { id: 'u1', name: 'Learner', isAnonymous: false }, facebookEnabled: false, needsDisclosure: false, adminCompanies: [] })) }))
vi.mock('@/server/org-settings', () => ({ getCompanyBranding: async () => null }))
vi.mock('@/server/latest-topic', () => ({ getLatestTopicIdFn: async () => 't1' }))
vi.mock('@/server/today', () => ({ getToday: vi.fn() }))
vi.mock('@/server/play', () => ({ prepareNextSession: vi.fn(async () => ({ ok: true })), endSession: vi.fn(), startMiniSession: vi.fn(), startSession: vi.fn(), getSession: vi.fn(), answerItem: vi.fn(), reportItem: vi.fn() }))
vi.mock('@/server/push', () => ({ getPushSettings: vi.fn(), subscribe: vi.fn(), unsubscribe: vi.fn(), sendTestPush: vi.fn(), savePushPreferences: vi.fn() }))
vi.mock('@/server/model-trace', () => ({ getModelTrace: vi.fn() }))
vi.mock('@/server/diagrams', () => ({ generateConceptDiagram: vi.fn() }))
vi.mock('@/lib/auth-client', () => ({ authClient: {} }))

const schedule = { window: { startMinute: 540, endMinute: 1020, days: [1, 2, 3, 4, 5], timezone: 'UTC', source: 'default' as const }, dailyCap: 3, steadyCap: 3, phase: 'steady' as const, preview: null }

afterEach(() => {
  vi.restoreAllMocks(); vi.resetAllMocks(); vi.unstubAllGlobals()
  delete (globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT
})

async function renderApp(entry: string) {
  Object.assign(globalThis, { IS_REACT_ACT_ENVIRONMENT: true })
  const rootRoute = createRootRoute({ beforeLoad: appRoot.options.beforeLoad, loader: appRoot.options.loader, component: appRoot.options.component })
  const done = createRoute({ getParentRoute: () => rootRoute, path: '/play/$sessionId/done', beforeLoad: doneRoute.options.beforeLoad, loader: doneRoute.options.loader, component: doneRoute.options.component })
  const quick = createRoute({ getParentRoute: () => rootRoute, path: '/play/quick/$itemId', validateSearch: quickRoute.options.validateSearch,
    beforeLoad: quickRoute.options.beforeLoad, loaderDeps: quickRoute.options.loaderDeps, loader: quickRoute.options.loader, component: quickRoute.options.component })
  const play = createRoute({ getParentRoute: () => rootRoute, path: '/play/$sessionId', component: () => <main>One question</main> })
  const signIn = createRoute({ getParentRoute: () => rootRoute, path: '/sign-in', validateSearch: signInRoute.options.validateSearch, component: () => <main>Sign in</main> })
  const me = createRoute({ getParentRoute: () => rootRoute, path: '/me', beforeLoad: meRoute.options.beforeLoad, loader: meRoute.options.loader, component: meRoute.options.component })
  const today = createRoute({ getParentRoute: () => rootRoute, path: '/today', component: () => <main>Today stub</main> })
  const optIn = createRoute({ getParentRoute: () => rootRoute, path: '/opt-in', beforeLoad: optInRoute.options.beforeLoad, loader: optInRoute.options.loader, component: optInRoute.options.component })
  const router = createRouter({ routeTree: rootRoute.addChildren([done, quick, play, signIn, me, optIn, today]), history: createMemoryHistory({ initialEntries: [entry] }) })
  const container = document.createElement('div')
  document.body.appendChild(container)
  const root = createRoot(container)
  await act(async () => { await router.load(); root.render(<RouterProvider router={router} />) })
  return { container, router, async cleanup() { await act(async () => root.unmount()); container.remove() } }
}

it.each([
  { total: 0, canPrompt: false, endpoints: [], expected: false },
  { total: 1, canPrompt: true, endpoints: [], expected: true },
  { total: 1, canPrompt: true, endpoints: ['https://fcm.googleapis.com/fcm/send/x'], expected: false },
  { total: 1, canPrompt: false, endpoints: [], expected: false },
])('continues to the push opt-in only after the first completed session (total=$total, first=$canPrompt)', async ({ total, canPrompt, endpoints, expected }) => {
  vi.mocked(endSession).mockResolvedValue({ sessionId: 's1', kind: 'session', topicId: 't1', durationMs: 1000, correct: total, total, ungraded: 0, xp: 0,
    streak: 0, level: 1, levelLine: null, levelLineModel: null, masteryMoved: [], mistakes: [], benchmark: null, reviewsLeft: 0, nextLine: 'Come back soon.', endedEarly: false } satisfies SummaryView)
  vi.mocked(getPushSettings).mockResolvedValue({ publicKey: 'public-key', isStaff: false, endpoints, canPrompt,
    prefs: { paused: false, startMinute: 540, endMinute: 1020, timezone: 'UTC', days: [1, 2, 3, 4, 5] }, company: null, schedule })
  const requestPermission = vi.fn()
  vi.stubGlobal('Notification', { requestPermission })
  const { container, router, cleanup } = await renderApp('/play/s1/done')
  try {
    expect(container.querySelector('h1')?.textContent).toContain('Session done')
    const next = [...container.querySelectorAll<HTMLAnchorElement>('a')].find((a) => a.textContent === 'Continue')
    const path = expected ? '/opt-in' : '/today'
    expect(next?.getAttribute('href')).toBe(path)
    expect([...container.querySelectorAll('button')].some((b) => /turn on|notification/i.test(b.textContent ?? ''))).toBe(false)
    await act(async () => next?.click())
    expect(router.state.location.pathname).toBe(path)
    if (expected) expect(container.querySelector('h1')?.textContent).toBe('Get a question during your shift?')
    else expect(container.textContent).toContain('Today stub')
    expect(requestPermission).not.toHaveBeenCalled()
  } finally { await cleanup() }
})

it('opens the iPhone Home Screen steps straight away on an iPhone Safari tab and focuses their heading', async () => {
  vi.mocked(endSession).mockResolvedValue({ sessionId: 's1', kind: 'session', topicId: 't1', durationMs: 1000, correct: 1, total: 1, ungraded: 0, xp: 0,
    streak: 0, level: 1, levelLine: null, levelLineModel: null, masteryMoved: [], mistakes: [], benchmark: null, reviewsLeft: 0, nextLine: 'Come back soon.', endedEarly: false } satisfies SummaryView)
  vi.mocked(getPushSettings).mockResolvedValue({ publicKey: 'public-key', isStaff: false, endpoints: [], canPrompt: true,
    prefs: { paused: false, startMinute: 540, endMinute: 1020, timezone: 'UTC', days: [1, 2, 3, 4, 5] }, company: null, schedule })
  vi.spyOn(navigator, 'userAgent', 'get').mockReturnValue('iPhone')
  vi.spyOn(window, 'matchMedia').mockImplementation(() => ({ matches: false }) as MediaQueryList)
  const { container, router, cleanup } = await renderApp('/play/s1/done')
  let paintedTurnOn = false
  const observer = new MutationObserver(() => { paintedTurnOn ||= container.textContent?.includes('Turn on questions') ?? false })
  observer.observe(container, { childList: true, subtree: true, characterData: true })
  try {
    await act(async () => container.querySelector<HTMLAnchorElement>('a[href="/opt-in"]')!.click())
    expect(router.state.location.pathname).toBe('/opt-in')
    const h1 = container.querySelector('h1')
    expect(h1?.textContent).toBe('Add Learn Quiz to your Home Screen')
    expect(document.activeElement).toBe(h1)
    expect(paintedTurnOn).toBe(false)
  } finally { observer.disconnect(); await cleanup() }
})

it.each([0, 3])('shows the not-graded count on the summary only when answers were ungraded (ungraded=%s)', async (ungraded) => {
  vi.mocked(endSession).mockResolvedValue({ sessionId: 's1', kind: 'session', topicId: 't1', durationMs: 1000, correct: 9, total: 10, ungraded, xp: 0,
    streak: 0, level: 1, levelLine: null, levelLineModel: null, masteryMoved: [], mistakes: [], benchmark: null, reviewsLeft: 0, nextLine: 'Come back soon.', endedEarly: false } satisfies SummaryView)
  vi.mocked(getPushSettings).mockResolvedValue({ publicKey: 'public-key', isStaff: false, endpoints: [], canPrompt: false,
    prefs: { paused: false, startMinute: 540, endMinute: 1020, timezone: 'UTC', days: [1, 2, 3, 4, 5] }, company: null, schedule })
  const { container, cleanup } = await renderApp('/play/s1/done')
  try {
    const score = [...container.querySelectorAll('p')].find((p) => p.textContent?.startsWith('9 of 10 correct'))
    expect(score?.textContent).toBe(ungraded ? '9 of 10 correct · 0:01 · 3 not graded' : '9 of 10 correct · 0:01')
  } finally { await cleanup() }
})

it.each([true, false])('explains a placement that ended early only when it did (endedEarly=%s)', async (endedEarly) => {
  vi.mocked(endSession).mockResolvedValue({ sessionId: 's1', kind: 'placement', topicId: 't1', durationMs: 1000, correct: 6, total: 8, ungraded: 0, xp: 0,
    streak: 0, level: 3, levelLine: null, levelLineModel: null, masteryMoved: [], mistakes: [], benchmark: null, reviewsLeft: 0, nextLine: 'Come back soon.', endedEarly } satisfies SummaryView)
  vi.mocked(getPushSettings).mockResolvedValue({ publicKey: 'public-key', isStaff: false, endpoints: [], canPrompt: false,
    prefs: { paused: false, startMinute: 540, endMinute: 1020, timezone: 'UTC', days: [1, 2, 3, 4, 5] }, company: null, schedule })
  const { container, cleanup } = await renderApp('/play/s1/done')
  try {
    expect(container.querySelector('h1')?.textContent).toBe("You're at level 3 of 5")
    expect(container.textContent?.includes('Placement stopped early: it had enough answers to place you.')).toBe(endedEarly)
  } finally { await cleanup() }
})

it('keeps mistakes collapsed until the disclosure is opened', async () => {
  vi.mocked(endSession).mockResolvedValue({ sessionId: 's1', kind: 'session', topicId: 't1', durationMs: 1000, correct: 9, total: 10, ungraded: 0, xp: 0,
    streak: 0, level: 1, levelLine: null, levelLineModel: null, masteryMoved: [], benchmark: null, reviewsLeft: 0, nextLine: 'Come back soon.', endedEarly: false,
    mistakes: [{ itemId: 'i1', conceptName: 'Pallet checks', stem: 'x', correctAnswer: 'y', wasSure: true, generatedBy: null }] } satisfies SummaryView)
  vi.mocked(getPushSettings).mockResolvedValue({ publicKey: 'public-key', isStaff: false, endpoints: [], canPrompt: false,
    prefs: { paused: false, startMinute: 540, endMinute: 1020, timezone: 'UTC', days: [1, 2, 3, 4, 5] }, company: null, schedule })
  const { container, cleanup } = await renderApp('/play/s1/done')
  try {
    const toggle = [...container.querySelectorAll('button')].find((b) => b.textContent?.includes('Mistakes (1)'))
    expect(toggle?.getAttribute('aria-expanded')).toBe('false')
    const hiddenList = container.querySelector('a[href="/play/quick/i1"]')?.closest('[hidden]')
    expect(hiddenList).not.toBeNull()
    await act(async () => toggle?.click())
    expect(toggle?.getAttribute('aria-expanded')).toBe('true')
    const link = container.querySelector<HTMLAnchorElement>('a[href="/play/quick/i1"]')
    expect(link?.getAttribute('aria-label')).toBe('Review: Pallet checks. You were sure')
    expect(link?.closest('[hidden]')).toBeNull()
  } finally { await cleanup() }
})

const quickView: SessionView = {
  id: 'mini-1', kind: 'mini', topicId: 't1', topicTitle: 'Algebra', progress: { position: 1, total: 1 }, ended: false,
  item: { id: 'i1', conceptId: 'c1', conceptName: 'Variables', format: 'mcq', difficulty: 1, generatedBy: 'gpt-test', image: null,
    stem: 'x + 1 = 2; what is x?', options: [{ id: 'a', text: '2' }, { id: 'b', text: '1' }], blank: null },
} as SessionView
const pick = (container: HTMLElement, name: string, value: string) => act(async () => { container.querySelector<HTMLInputElement>(`input[name="${name}"][value="${value}"]`)!.click() })

it('opens a notification deep link as an inline one-question screen without redirecting', async () => {
  vi.mocked(startMiniSession).mockResolvedValue({ sessionId: 'mini-1' })
  vi.mocked(getSession).mockResolvedValue(quickView)
  const { container, router, cleanup } = await renderApp('/play/quick/i1?pushId=push-1')
  try {
    expect(startMiniSession).toHaveBeenCalledExactlyOnceWith({ data: { itemId: 'i1', pushId: 'push-1' } })
    expect(getSession).toHaveBeenCalledWith({ data: { sessionId: 'mini-1' } })
    expect(router.state.location.pathname).toBe('/play/quick/i1')
    expect(container.querySelector('h1')?.textContent).toBe('x + 1 = 2; what is x?')
    expect(container.querySelector('a[aria-label="Close"]')?.getAttribute('href')).toBe('/today')
    expect(container.textContent).toContain('1 question')
    expect(container.querySelector('nav')).toBeNull()
  } finally { await cleanup() }
})

function mockQuickAnswer() {
  vi.mocked(startMiniSession).mockResolvedValue({ sessionId: 'mini-1' })
  vi.mocked(getSession).mockResolvedValue(quickView)
  vi.mocked(answerItem).mockResolvedValue({ attemptId: 'a0', diagramConceptId: null, score: 1, feedback: null, missingPoints: [], chosenFeedback: null, sourceQuote: null, sourceTitle: null,
    returnsThisSession: false, pKnownBefore: 0.1, pKnownAfter: 0.5, correct: true, correctAnswer: '1', state: 'A', mixUps: [], explanation: 'Subtract one.', xp: 10, critical: false,
    correctOptionIds: null, sourceVersion: null, detail: null } as unknown as Reveal)
  vi.mocked(endSession).mockResolvedValue({ sessionId: 'mini-1', kind: 'mini', topicId: 't1', durationMs: 1000, correct: 1, total: 1, ungraded: 0, xp: 10,
    streak: 0, level: 1, levelLine: null, levelLineModel: null, masteryMoved: [], mistakes: [], benchmark: null, reviewsLeft: 3, nextLine: 'Come back soon.', endedEarly: false } as SummaryView)
}
async function checkQuick(container: HTMLElement) {
  await pick(container, 'answer', 'b')
  await pick(container, 'confidence', 'sure')
  const check = [...document.body.querySelectorAll('button')].find((b) => b.textContent?.trim() === 'Check')!
  await act(async () => check.click())
}

it('answers the quick question inline and offers the way back to Today', async () => {
  mockQuickAnswer()
  const { container, router, cleanup } = await renderApp('/play/quick/i1?pushId=push-1')
  try {
    await checkQuick(container)
    expect(answerItem).toHaveBeenCalledExactlyOnceWith({ data: { sessionId: 'mini-1', itemId: 'i1', answer: { optionId: 'b' }, confidence: 'sure', responseMs: expect.any(Number) } })
    expect(endSession).toHaveBeenCalledExactlyOnceWith({ data: { sessionId: 'mini-1' } })
    const text = document.body.textContent ?? ''
    expect(container.querySelector('h1')?.textContent).toBe('Quick question done')
    for (const line of ['Correct', '1', '1 review cleared · 3 left today']) expect(text).toContain(line)
    const back = [...document.body.querySelectorAll<HTMLAnchorElement>('a[href="/today"]')].find((a) => a.textContent?.trim() === 'Back to Today')!
    await act(async () => back.click())
    expect(router.state.location.pathname).toBe('/today')
  } finally { await cleanup() }
})

it('announces Report sent on the result only after the report sheet stops hiding the page', async () => {
  mockQuickAnswer()
  vi.mocked(reportItem).mockResolvedValue({ ok: true } as never)
  const { container, cleanup } = await renderApp('/play/quick/i1?pushId=push-1')
  try {
    await checkQuick(container)
    const status = [...container.querySelectorAll('[role="status"]')].find((el) => el.classList.contains('sr-only'))!
    await act(async () => [...container.querySelectorAll('button')].find((b) => b.textContent === 'Report this question')!.click())
    expect(container.getAttribute('aria-hidden')).toBe('true')
    await act(async () => [...document.body.querySelectorAll('button')].find((b) => b.textContent?.includes('The question is unclear'))!.click())
    // Screen readers skip text written while the page is still aria-hidden, so the page must be unhidden first.
    const records: MutationRecord[] = []
    const observer = new MutationObserver((batch) => records.push(...batch))
    observer.observe(document.body, { subtree: true, childList: true, characterData: true, attributes: true, attributeFilter: ['aria-hidden'], attributeOldValue: true })
    await act(async () => [...document.body.querySelectorAll('button')].find((b) => b.textContent?.includes('Send report'))!.click())
    records.push(...observer.takeRecords())
    observer.disconnect()
    const unhidden = records.findIndex((r) => r.type === 'attributes' && r.target === container && r.oldValue === 'true')
    const announced = records.findIndex((r) => r.type !== 'attributes' && status.contains(r.target) && status.textContent === 'Report sent')
    expect(unhidden).toBeGreaterThan(-1)
    expect(announced).toBeGreaterThan(unhidden)
    expect(reportItem).toHaveBeenCalledOnce()
    expect(status.textContent).toBe('Report sent')
    expect(status.closest('[aria-hidden="true"]')).toBeNull()
    expect(container.querySelector('h1')?.textContent).toBe('Quick question done')
    await act(async () => new Promise((resolve) => setTimeout(resolve, 0)))
    expect(document.activeElement?.textContent).toBe('Report this question')
  } finally { await cleanup() }
})

it.each([
  { message: 'This question has been retired', heading: "This question isn't available any more.", ends: true },
  { message: 'Already answered. Continue to the next question.', heading: 'You already answered this question.', ends: false },
])('says $heading when Check is refused with 409 "$message"', async ({ message, heading, ends }) => {
  mockQuickAnswer()
  vi.mocked(answerItem).mockRejectedValue(Object.assign(new Error(message), { status: 409 }))
  const { container, cleanup } = await renderApp('/play/quick/i1?pushId=push-1')
  try {
    await checkQuick(container)
    expect(container.querySelector('h1')?.textContent).toBe(heading)
    expect([...container.querySelectorAll('a[href="/today"]')].map((a) => a.textContent?.trim())).toContain('Back to Today')
    expect(vi.mocked(endSession).mock.calls).toEqual(ends ? [[{ data: { sessionId: 'mini-1' } }]] : [])
  } finally { await cleanup() }
})

it('says the question is gone when the notification item no longer exists', async () => {
  vi.mocked(startMiniSession).mockRejectedValue(Object.assign(new Error('Question not found'), { status: 404 }))
  const { container, cleanup } = await renderApp('/play/quick/i1?pushId=push-1')
  try {
    expect(container.querySelector('h1')?.textContent).toBe("This question isn't available any more.")
    expect([...container.querySelectorAll('a[href="/today"]')].map((a) => a.textContent?.trim())).toContain('Back to Today')
    expect(getSession).not.toHaveBeenCalled()
  } finally { await cleanup() }
})

it('preserves the notification link through sign-in without opening a session while signed out', async () => {
  vi.mocked(getSessionFn).mockResolvedValue({ user: null, facebookEnabled: false, needsDisclosure: false, adminCompanies: [] })
  const link = '/play/quick/i1?pushId=push-1'
  const { container, router, cleanup } = await renderApp(link)
  try {
    expect(router.state.location.pathname).toBe('/sign-in')
    expect(router.state.location.search).toEqual({ redirect: link })
    expect(container.textContent).toContain('Sign in')
    expect(startMiniSession).not.toHaveBeenCalled()
  } finally { await cleanup() }
})

it('keeps staff navigation and working push controls together on Profile', async () => {
  vi.mocked(getSessionFn).mockResolvedValue({ user: { id: 'u1', name: 'Learner', isAnonymous: false, role: 'admin' }, facebookEnabled: false, needsDisclosure: false, adminCompanies: [] })
  const prefs = { paused: false, startMinute: 540, endMinute: 1020, timezone: 'UTC', days: [1, 2, 3, 4, 5] }
  vi.mocked(getPushSettings).mockResolvedValue({ publicKey: null, isStaff: true, endpoints: [], canPrompt: false, prefs, company: null, schedule })
  const { container, cleanup } = await renderApp('/me')
  try {
    expect(container.querySelector('h1')?.textContent).toBe('Learner')
    expect(container.querySelector('a[href="/admin"]')?.textContent).toBe('Staff area')
    const pause = [...container.querySelectorAll('button')].find((button) => button.textContent === 'Pause pushes')!
    await act(async () => pause.click())
    expect(savePushPreferences).toHaveBeenCalledExactlyOnceWith({ data: { ...prefs, paused: true } })
    expect(container.querySelector('[role="status"]')?.textContent).toBe('Pushes paused on all your devices.')
  } finally { await cleanup() }
})
