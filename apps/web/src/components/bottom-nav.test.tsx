// @vitest-environment happy-dom
import { act } from 'react'
import { createRoot } from 'react-dom/client'
import { createMemoryHistory, createRootRoute, createRoute, createRouter, Outlet, redirect, RouterProvider } from '@tanstack/react-router'
import { beforeEach, expect, it, vi } from 'vitest'
import { Route as appRootRoute } from '@/routes/__root'
import { Route as profileRoute } from '@/routes/me.profile'
import { Route as settingsRoute } from '@/routes/me.settings'
import { Route as startRoute } from '@/routes/start'
import { Route as todayRoute } from '@/routes/today'
import { createTopic } from '@/server/curriculum'
import { getLatestTopicIdFn } from '@/server/latest-topic'
import { getCompanyBranding } from '@/server/org-settings'
import { getProfile } from '@/server/profile'
import { getPushSettings } from '@/server/push'
import { getSessionFn } from '@/server/session-fn'
import { startPlacement, startSession } from '@/server/play'
import { getToday } from '@/server/today'

vi.mock('@tanstack/react-start', () => ({ useServerFn: (fn: unknown) => fn }))
vi.mock('@/server/curriculum', () => ({ createTopic: vi.fn() }))
vi.mock('@/server/play', () => ({ startPlacement: vi.fn(), startSession: vi.fn() }))
vi.mock('@/server/today', () => ({ getToday: vi.fn() }))
vi.mock('@/lib/auth-client', () => ({ authClient: { useSession: () => ({ data: { user: { email: 'learner@example.test' } } }) } }))
vi.mock('@/server/profile', () => ({ getProfile: vi.fn(), getMemberFlags: vi.fn(async () => []) }))
vi.mock('@/server/push', () => ({ getPushSettings: vi.fn(), subscribe: vi.fn(), unsubscribe: vi.fn(), sendTestPush: vi.fn(), savePushPreferences: vi.fn() }))
vi.mock('@/server/org-settings', () => ({ getCompanyBranding: vi.fn() }))
vi.mock('@/server/latest-topic', () => ({ getLatestTopicIdFn: vi.fn() }))
vi.mock('@/server/session-fn', () => ({
  getSessionFn: vi.fn(),
}))

beforeEach(() => {
  vi.mocked(getProfile).mockResolvedValue({
    name: 'Learner', topic: { id: 'training', title: 'Workplace safety' }, role: null, benchmark: 0.85, started: true, onboarding: null, mastery: 0.7, units: [],
    proficiency: { achievedAt: null, days: null, estimatedDays: 2, projectedAt: null }, confidentErrors: [], weeks: [], sessionCounts: { week: 0, total: 0 },
  })
  vi.mocked(getPushSettings).mockResolvedValue({ publicKey: '', isStaff: false, endpoints: [], prefs: { paused: false, startMinute: 540, endMinute: 1020, timezone: 'UTC', days: [1, 2, 3, 4, 5] }, company: null, canPrompt: false, schedule: { window: { startMinute: 540, endMinute: 1020, days: [1, 2, 3, 4, 5], timezone: 'UTC', source: 'default' }, dailyCap: 3, steadyCap: 3, phase: 'steady', preview: null } } as Awaited<ReturnType<typeof getPushSettings>>)
  vi.mocked(getLatestTopicIdFn).mockResolvedValue(null)
  vi.mocked(getCompanyBranding).mockResolvedValue(null)
  vi.mocked(getSessionFn).mockResolvedValue({ user: { id: 'learner', name: 'Learner', isAnonymous: false }, facebookEnabled: false, needsDisclosure: false, companyMember: false, adminCompanies: [] })
})

async function renderStart(initialEntry = '/start') {
  Object.assign(globalThis, { IS_REACT_ACT_ENVIRONMENT: true })
  const rootRoute = createRootRoute({
    beforeLoad: appRootRoute.options.beforeLoad,
    loader: appRootRoute.options.loader,
    component: appRootRoute.options.component,
  })
  const start = createRoute({ getParentRoute: () => rootRoute, path: '/start', component: startRoute.options.component, validateSearch: startRoute.options.validateSearch })
  const today = createRoute({ getParentRoute: () => rootRoute, path: '/today', beforeLoad: todayRoute.options.beforeLoad, loader: todayRoute.options.loader, errorComponent: todayRoute.options.errorComponent, component: todayRoute.options.component })
  const index = createRoute({ getParentRoute: () => rootRoute, path: '/', beforeLoad: () => { throw redirect({ to: '/start' }) } })
  const play = createRoute({ getParentRoute: () => rootRoute, path: '/play/$sessionId', component: Outlet })
  const loading = createRoute({ getParentRoute: () => rootRoute, path: '/play/loading', component: () => <h1>Preparing</h1> })
  const done = createRoute({ getParentRoute: () => rootRoute, path: '/play/$sessionId/done', component: () => <h1>Session done</h1> })
  const me = createRoute({ getParentRoute: () => rootRoute, path: '/me', component: () => <h1>Learner</h1> })
  const profile = createRoute({ getParentRoute: () => rootRoute, path: '/me/profile', beforeLoad: profileRoute.options.beforeLoad, loader: profileRoute.options.loader, validateSearch: profileRoute.options.validateSearch, component: profileRoute.options.component })
  const settings = createRoute({ getParentRoute: () => rootRoute, path: '/me/settings', beforeLoad: settingsRoute.options.beforeLoad, loader: settingsRoute.options.loader, component: settingsRoute.options.component })
  const router = createRouter({ routeTree: rootRoute.addChildren([index, start, today, loading, play, done, me, profile, settings]), history: createMemoryHistory({ initialEntries: [initialEntry] }) })
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
      delete (globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT
    },
  }
}

it('names the company on Today while the role training is being prepared', async () => {
  vi.mocked(getLatestTopicIdFn).mockResolvedValue(null)
  vi.mocked(getToday).mockResolvedValue({ topic: null, role: { name: 'Cashier', topicTitle: 'Cashier', company: 'Northwind', preparing: true, mastery: null, benchmark: 0.85, day: 1, days: 30, building: null }, plan: null })
  const { container, cleanup } = await renderStart('/today')
  try {
    expect(container.textContent).toContain('Northwind')
    expect(container.textContent).toContain('Building your questions')
  } finally {
    await cleanup()
  }
})

it('sends a learner with a ready topic to Today, where one tap starts the session', async () => {
  vi.mocked(getLatestTopicIdFn).mockResolvedValue('topic-1')
  vi.mocked(getToday).mockResolvedValue({ topic: { id: 'topic-1', title: 'Biology', placed: true, placeable: true, due: 2, xp: 40, streak: 1 }, role: null, plan: { state: 'normal', start: 'session', nextUnit: null, reviewsLeft: 2, reviewsCleared: 0, sessionDone: false, sessionSize: 20, playable: true, nextReviewAt: null } })
  const { container, router, cleanup } = await renderStart('/me')
  try {
    const today = [...container.querySelectorAll<HTMLAnchorElement>('nav[aria-label="Main"] a')].find((link) => link.textContent?.trim() === 'Today')!
    expect(today.getAttribute('href')).toBe('/today')
    await act(async () => { today.click(); await router.load() })
    expect(router.state.location.pathname).toBe('/today')
    expect(container.querySelector('h1')?.textContent).toBe('Today')
    const start = [...container.querySelectorAll('button')].find((button) => button.textContent?.trim() === 'Play · 5 min')!
    await act(async () => {
      start.click()
      await vi.waitFor(() => expect(router.state.location.pathname).toBe('/play/loading'))
    })
    expect(router.state.location.search).toEqual({ topicId: 'topic-1', start: 'session' })
    expect(startSession).not.toHaveBeenCalled()
  } finally {
    await cleanup()
  }
})

it.each([
  { latestTopicId: null },
  { latestTopicId: 'old-topic' },
] as const)('refreshes Path after creating a topic from $latestTopicId before visiting Profile', async ({ latestTopicId }) => {
  let latest: string | null = latestTopicId
  vi.mocked(getLatestTopicIdFn).mockImplementation(async () => latest)
  vi.mocked(createTopic).mockImplementation(async () => {
    latest = 'new-topic'
    return { topicId: latest }
  })
  let finishPlacement!: (result: { sessionId: string }) => void
  const placement = new Promise<{ sessionId: string }>((resolve) => { finishPlacement = resolve })
  let placementStarted!: () => void
  const started = new Promise<void>((resolve) => { placementStarted = resolve })
  vi.mocked(startPlacement).mockImplementation(() => {
    placementStarted()
    return placement
  })
  const { container, router, cleanup } = await renderStart('/start?topic=Biology')
  const pathHref = () => [...container.querySelectorAll('nav[aria-label="Main"] a')]
    .find((link) => link.textContent?.trim() === 'Path')?.getAttribute('href') ?? null
  try {
    await act(async () => {
      container.querySelector('form')!.dispatchEvent(new Event('submit', { bubbles: true, cancelable: true }))
      await started
    })
    await act(async () => {
      finishPlacement({ sessionId: 'placement' })
      await vi.waitFor(() => expect(router.state.location.pathname).toBe('/play/placement'))
    })
    await act(async () => {
      await router.navigate({ to: '/me' })
    })
    expect(router.state.location.pathname).toBe('/me')
    expect(pathHref()).toBe('/t/new-topic/path')
  } finally {
    finishPlacement({ sessionId: 'placement' })
    await cleanup()
  }
})

it('shows the three tabs on Today and moves focus to the page heading on Profile', async () => {
  vi.mocked(getLatestTopicIdFn).mockResolvedValue('topic-1')
  vi.mocked(getToday).mockResolvedValue({ topic: { id: 'topic-1', title: 'Biology', placed: true, placeable: true, due: 2, xp: 40, streak: 1 }, role: null, plan: { state: 'normal', start: 'session', nextUnit: null, reviewsLeft: 2, reviewsCleared: 0, sessionDone: false, sessionSize: 20, playable: true, nextReviewAt: null } })
  const { container, router, cleanup } = await renderStart('/today')
  try {
    const links = () => [...container.querySelectorAll<HTMLAnchorElement>('nav[aria-label="Main"] a')]
    expect(links().map((link) => link.textContent?.trim())).toEqual(['Today', 'Path', 'Profile'])
    expect(links().map((link) => link.getAttribute('href'))).toEqual(['/today', '/t/topic-1/path', '/me/profile'])
    expect(links()[0].getAttribute('aria-current')).toBe('page')
    expect(links()[2].getAttribute('aria-current')).toBeNull()
    expect(container.querySelector('header')).toBeNull()
    await act(async () => { links()[2].click(); await router.load() })
    expect(router.state.location.pathname).toBe('/me/profile')
    expect(links()[2].getAttribute('aria-current')).toBe('page')
    expect(links()[0].getAttribute('aria-current')).toBeNull()
    expect(container.querySelectorAll('header')).toHaveLength(1) // only Training progress's own header, no top bar
    const h1 = container.querySelector('h1')!
    expect(h1.textContent).toBe('Training progress')
    expect(document.activeElement).toBe(h1)
  } finally {
    await cleanup()
  }
})

it('returns focus to the Settings link when Back leaves Settings for Profile', async () => {
  const { container, router, cleanup } = await renderStart('/me/profile')
  try {
    const gear = () => container.querySelector<HTMLAnchorElement>('a[aria-label="Settings"]')!
    await act(async () => { gear().click(); await router.load() })
    expect(router.state.location.pathname).toBe('/me/settings')
    await act(async () => { container.querySelector<HTMLAnchorElement>('a[aria-label="Back"]')!.click(); await router.load() })
    expect(router.state.location.pathname).toBe('/me/profile')
    expect(document.activeElement).toBe(gear())
  } finally {
    await cleanup()
  }
})

it('disables Path without a topic', async () => {
  const { container, cleanup } = await renderStart('/me')
  try {
    const disabled = container.querySelector('nav[aria-label="Main"] [aria-disabled="true"]')
    expect(disabled?.textContent?.trim()).toBe('Path')
    const links = [...container.querySelectorAll('nav[aria-label="Main"] a')]
    expect(links.find((link) => link.textContent?.trim() === 'Path')).toBeUndefined()
  } finally {
    await cleanup()
  }
})

it.each([{ path: '/play/s1' }, { path: '/play/s1/done' }])('hides the nav and top bar in a session ($path)', async ({ path }) => {
  const { container, cleanup } = await renderStart(path)
  try {
    expect(container.querySelector('nav[aria-label="Main"]')).toBeNull()
    expect(container.querySelector('header')).toBeNull()
  } finally {
    await cleanup()
  }
})

it('shows the employee company logo and returns to the default brand after sign-out', async () => {
  vi.mocked(getCompanyBranding).mockResolvedValue({ name: 'Alpha Training', logoUrl: '/api/org/org-a/logo?v=logo', accent: '#543189' })
  const { container, router, cleanup } = await renderStart()
  try {
    expect(container.querySelector('header img')?.getAttribute('alt')).toBe('Alpha Training')
    expect(container.querySelector('header img')?.getAttribute('src')).toBe('/api/org/org-a/logo?v=logo')
    await act(async () => {
      vi.mocked(getSessionFn).mockResolvedValue({ user: null, facebookEnabled: false, needsDisclosure: false, companyMember: false, adminCompanies: [] })
      await router.invalidate()
    })
    expect(container.querySelector('header img')).toBeNull()
    expect(container.querySelector('header a')?.textContent).toBe('Learn Quiz')
  } finally {
    await cleanup()
  }
})
