// @vitest-environment happy-dom
import { StrictMode, act } from 'react'
import { createRoot } from 'react-dom/client'
import { createMemoryHistory, createRootRoute, createRoute, createRouter, Outlet, RouterProvider } from '@tanstack/react-router'
import { loadingTitle, startFailed, startSlow } from '@learnquiz/api/system-copy'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { Route as loadingRoute } from '@/routes/play.loading'
import { Route as appRootRoute } from '@/routes/__root'
import { startPlacement, startSession } from '@/server/play'

vi.mock('@tanstack/react-start', () => ({ useServerFn: (fn: unknown) => fn }))
vi.mock('@/server/play', () => ({ startSession: vi.fn(), startPlacement: vi.fn() }))
vi.mock('@/lib/auth-client', () => ({ authClient: {} }))
vi.mock('@/server/org-settings', () => ({ getCompanyBranding: async () => null }))
vi.mock('@/server/latest-topic', () => ({ getLatestTopicIdFn: async () => 't1' }))
vi.mock('@/server/session-fn', () => ({ getSessionFn: async () => ({ user: { id: 'u1', name: 'Learner', isAnonymous: false }, facebookEnabled: false, needsDisclosure: false, adminCompanies: [] }) }))

let cleanups: Array<() => Promise<void>> = []
afterEach(async () => {
  for (const c of cleanups) await c()
  cleanups = []
  vi.useRealTimers()
  vi.mocked(startSession).mockReset()
  vi.mocked(startPlacement).mockReset()
  delete (globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT
})

async function renderLoading(search = 'topicId=t1&start=session', strict = false, todayLoader?: () => Promise<unknown>) {
  Object.assign(globalThis, { IS_REACT_ACT_ENVIRONMENT: true })
  const rootRoute = createRootRoute({ beforeLoad: appRootRoute.options.beforeLoad, loader: appRootRoute.options.loader, component: Outlet })
  const loading = createRoute({
    getParentRoute: () => rootRoute,
    path: '/play/loading',
    validateSearch: loadingRoute.options.validateSearch,
    beforeLoad: loadingRoute.options.beforeLoad,
    component: loadingRoute.options.component,
  })
  const play = createRoute({ getParentRoute: () => rootRoute, path: '/play/$sessionId', component: () => <h1>Question 1</h1> })
  const today = createRoute({ getParentRoute: () => rootRoute, path: '/today', loader: todayLoader, component: () => <p>Today page</p> })
  const router = createRouter({
    routeTree: rootRoute.addChildren([loading, play, today]),
    history: createMemoryHistory({ initialEntries: ['/today', `/play/loading?${search}`], initialIndex: 1 }),
  })
  const container = document.createElement('div')
  document.body.appendChild(container)
  const root = createRoot(container)
  const tree = <RouterProvider router={router} />
  await act(async () => { await router.load(); root.render(strict ? <StrictMode>{tree}</StrictMode> : tree) })
  cleanups.push(async () => { await act(async () => root.unmount()); container.remove() })
  return { container, router }
}

const pathname = (router: { state: { location: { pathname: string } } }) => router.state.location.pathname
const status = (c: HTMLElement) => c.querySelector('[role=status]')!.textContent
const tryAgain = (c: HTMLElement) => [...c.querySelectorAll('button')].find((b) => b.textContent === 'Try again')

describe('session Loading screen', () => {
  it('focuses the title, shows no progress and offers Cancel back to Today', async () => {
    vi.mocked(startSession).mockReturnValue(new Promise(() => {}))
    const { container } = await renderLoading()
    const h1 = container.querySelector('h1')!
    expect(h1.textContent).toBe(loadingTitle)
    expect(document.activeElement).toBe(h1)
    expect(container.querySelector('[role=progressbar]')).toBeNull()
    expect(container.querySelector('a[aria-label="Cancel"]')!.getAttribute('href')).toBe('/today')
  })

  it.each([
    ['', { topicId: 't1' }],
    ['&unitId=u1', { topicId: 't1', unitId: 'u1' }],
  ])('starts the session%s once, replaces itself with it, and Back skips the loader', async (extra, data) => {
    vi.mocked(startSession).mockResolvedValue({ sessionId: 's1' } as never)
    const { router } = await renderLoading(`topicId=t1&start=session${extra}`)
    await act(async () => {})
    expect(pathname(router)).toBe('/play/s1')
    expect(startSession).toHaveBeenCalledTimes(1)
    expect(startSession).toHaveBeenCalledWith({ data })
    await act(async () => router.history.back())
    expect(pathname(router)).toBe('/today')
  })

  it('starts a placement through startPlacement', async () => {
    vi.mocked(startPlacement).mockReturnValue(new Promise(() => {}))
    await renderLoading('topicId=t1&start=placement')
    expect(startPlacement).toHaveBeenCalledWith({ data: { topicId: 't1' } })
    expect(startSession).not.toHaveBeenCalled()
  })

  it.each([
    ['session', 15_000],
    ['placement', 45_000],
  ] as const)('says it is taking longer after %s slow threshold', async (start, ms) => {
    vi.useFakeTimers()
    vi.mocked(start === 'session' ? startSession : startPlacement).mockReturnValue(new Promise(() => {}))
    const { container } = await renderLoading(`topicId=t1&start=${start}`)
    await act(async () => { await vi.advanceTimersByTimeAsync(ms - 1_000) })
    expect(status(container)).not.toBe(startSlow)
    await act(async () => { await vi.advanceTimersByTimeAsync(1_000) })
    expect(status(container)).toBe(startSlow)
  })

  it('offers Try again after a server or network failure', async () => {
    vi.mocked(startSession).mockRejectedValueOnce(Object.assign(new Error('boom'), { status: 502 }))
    vi.mocked(startSession).mockReturnValue(new Promise(() => {}))
    const { container } = await renderLoading()
    await act(async () => {})
    expect(container.querySelector('[role=alert]')!.textContent).toContain(startFailed)
    expect(container.querySelector('[aria-hidden=true] .h-14')).toBeNull()
    await act(async () => tryAgain(container)!.click())
    expect(startSession).toHaveBeenCalledTimes(2)
    expect(container.querySelector('[role=alert]')).toBeNull()
  })

  it('shows the server sentence without retry for a 4xx', async () => {
    vi.mocked(startSession).mockRejectedValue(Object.assign(new Error('Unit is locked'), { status: 409 }))
    const { container } = await renderLoading()
    await act(async () => {})
    expect(container.querySelector('[role=alert]')!.textContent).toContain('Unit is locked')
    expect(tryAgain(container)).toBeUndefined()
  })

  it('starts exactly once under StrictMode and still lands on the session', async () => {
    vi.mocked(startSession).mockResolvedValue({ sessionId: 's1' } as never)
    const { router } = await renderLoading('topicId=t1&start=session', true)
    await act(async () => {})
    expect(startSession).toHaveBeenCalledTimes(1)
    expect(pathname(router)).toBe('/play/s1')
  })

  it.each([
    ['Cancel', (c: HTMLElement) => (c.querySelector('a[aria-label="Cancel"]') as HTMLAnchorElement).click()],
    ['Back', (_c: HTMLElement, router: { history: { back: () => void } }) => router.history.back()],
  ] as const)('stays on Today when the start finishes after %s while Today is still loading', async (_label, leave) => {
    let finishStart!: (v: { sessionId: string }) => void
    vi.mocked(startSession).mockReturnValue(new Promise((r) => { finishStart = r }) as never)
    let finishToday!: () => void
    const todayLoader = vi.fn(() => new Promise<void>((r) => { finishToday = r }))
    const { container, router } = await renderLoading('topicId=t1&start=session', false, todayLoader)
    await act(async () => leave(container, router))
    expect(todayLoader).toHaveBeenCalled()
    expect(container.querySelector('h1')!.textContent).toBe(loadingTitle)
    await act(async () => finishStart({ sessionId: 's1' }))
    await act(async () => finishToday())
    await act(async () => {})
    expect(pathname(router)).toBe('/today')
    expect(container.textContent).toContain('Today page')
  })
})
