// @vitest-environment happy-dom
import { act } from 'react'
import { createRoot } from 'react-dom/client'
import { createMemoryHistory, createRootRoute, createRoute, createRouter, RouterProvider } from '@tanstack/react-router'
import { afterEach, expect, it, vi } from 'vitest'
import { Route as appRoot } from '@/routes/__root'
import { Route as doneRoute } from '@/routes/play.$sessionId_.done'
import { Route as quickRoute } from '@/routes/play.quick.$itemId'
import { Route as signInRoute } from '@/routes/sign-in'
import { endSession, startMiniSession } from '@/server/play'
import { getPushSettings } from '@/server/push'
import { getSessionFn } from '@/server/session-fn'
import type { SummaryView } from '@/lib/learning/types'

vi.mock('@tanstack/react-start', () => ({ useServerFn: (fn: unknown) => fn }))
vi.mock('@/server/session-fn', () => ({ getSessionFn: vi.fn(async () => ({ user: { id: 'u1', name: 'Learner', isAnonymous: false }, facebookEnabled: false, needsDisclosure: false })) }))
vi.mock('@/server/latest-topic', () => ({ getLatestTopicIdFn: async () => 't1' }))
vi.mock('@/server/play', () => ({ endSession: vi.fn(), startMiniSession: vi.fn(), startSession: vi.fn() }))
vi.mock('@/server/push', () => ({ getPushSettings: vi.fn(), subscribe: vi.fn(), unsubscribe: vi.fn(), sendTestPush: vi.fn(), savePushPreferences: vi.fn() }))
vi.mock('@/lib/auth-client', () => ({ authClient: {} }))

afterEach(() => {
  vi.restoreAllMocks(); vi.resetAllMocks(); vi.unstubAllGlobals()
  delete (globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT
})

async function renderApp(entry: string) {
  Object.assign(globalThis, { IS_REACT_ACT_ENVIRONMENT: true })
  const rootRoute = createRootRoute({ beforeLoad: appRoot.options.beforeLoad, loader: appRoot.options.loader, component: appRoot.options.component })
  const done = createRoute({ getParentRoute: () => rootRoute, path: '/play/$sessionId/done', beforeLoad: doneRoute.options.beforeLoad, loader: doneRoute.options.loader, component: doneRoute.options.component })
  const quick = createRoute({ getParentRoute: () => rootRoute, path: '/play/quick/$itemId', validateSearch: quickRoute.options.validateSearch,
    beforeLoad: quickRoute.options.beforeLoad, loaderDeps: quickRoute.options.loaderDeps, loader: quickRoute.options.loader })
  const play = createRoute({ getParentRoute: () => rootRoute, path: '/play/$sessionId', component: () => <main>One question</main> })
  const signIn = createRoute({ getParentRoute: () => rootRoute, path: '/sign-in', validateSearch: signInRoute.options.validateSearch, component: () => <main>Sign in</main> })
  const router = createRouter({ routeTree: rootRoute.addChildren([done, quick, play, signIn]), history: createMemoryHistory({ initialEntries: [entry] }) })
  const container = document.createElement('div')
  document.body.appendChild(container)
  const root = createRoot(container)
  await act(async () => { await router.load(); root.render(<RouterProvider router={router} />) })
  return { container, router, async cleanup() { await act(async () => root.unmount()); container.remove() } }
}

it.each([
  { total: 0, canPrompt: false, standalone: false, expected: false },
  { total: 1, canPrompt: true, standalone: false, expected: true },
  { total: 1, canPrompt: true, standalone: true, expected: true },
  { total: 1, canPrompt: false, standalone: false, expected: false },
])('offers opt-in after the first completed summary (total=$total, first=$canPrompt, standalone=$standalone)', async ({ total, canPrompt, standalone, expected }) => {
  vi.mocked(endSession).mockResolvedValue({ sessionId: 's1', kind: 'session', topicId: 't1', durationMs: 1000, correct: total, total, xp: 0,
    streak: 0, level: 1, levelLine: null, masteryMoved: [], mistakes: [], nextLine: 'Come back soon.' } satisfies SummaryView)
  vi.mocked(getPushSettings).mockResolvedValue({ publicKey: 'public-key', isStaff: false, endpoints: [], canPrompt,
    prefs: { paused: false, startMinute: 540, endMinute: 1020, timezone: 'UTC' } })
  vi.spyOn(navigator, 'userAgent', 'get').mockReturnValue('iPhone')
  vi.spyOn(window, 'matchMedia').mockImplementation((query) => ({ matches: standalone && query === '(display-mode: standalone)' }) as MediaQueryList)
  const requestPermission = vi.fn()
  vi.stubGlobal('Notification', { requestPermission })
  vi.stubGlobal('PushManager', class {})
  const registration = { pushManager: { getSubscription: async () => null } }
  Object.defineProperty(navigator, 'serviceWorker', { configurable: true, value: { register: async () => registration, ready: Promise.resolve(registration) } })
  const { container, cleanup } = await renderApp('/play/s1/done')
  try {
    expect(container.querySelector('h1')?.textContent).toContain('Session done')
    expect(container.textContent?.includes('Keep learning with a one-question reminder')).toBe(expected)
    if (expected) {
      expect(container.textContent?.includes('Add to home screen')).toBe(!standalone)
      expect([...container.querySelectorAll('button')].some((button) => button.textContent === 'Enable notifications')).toBe(standalone)
    }
    expect(requestPermission).not.toHaveBeenCalled()
  } finally { await cleanup(); Reflect.deleteProperty(navigator, 'serviceWorker') }
})

it('opens a notification deep link through the quick route and redirects into focused play', async () => {
  vi.mocked(startMiniSession).mockResolvedValue({ sessionId: 'mini-1' })
  const { container, router, cleanup } = await renderApp('/play/quick/i1?pushId=push-1')
  try {
    expect(startMiniSession).toHaveBeenCalledExactlyOnceWith({ data: { itemId: 'i1', pushId: 'push-1' } })
    expect(router.state.location.pathname).toBe('/play/mini-1')
    expect(container.textContent).toBe('One question')
    expect(container.querySelector('nav')).toBeNull()
  } finally { await cleanup() }
})

it('preserves the notification link through sign-in without opening a session while signed out', async () => {
  vi.mocked(getSessionFn).mockResolvedValue({ user: null, facebookEnabled: false, needsDisclosure: false })
  const link = '/play/quick/i1?pushId=push-1'
  const { container, router, cleanup } = await renderApp(link)
  try {
    expect(router.state.location.pathname).toBe('/sign-in')
    expect(router.state.location.search).toEqual({ redirect: link })
    expect(container.textContent).toContain('Sign in')
    expect(startMiniSession).not.toHaveBeenCalled()
  } finally { await cleanup() }
})
