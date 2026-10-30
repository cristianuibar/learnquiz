// @vitest-environment happy-dom
import { act } from 'react'
import { createRoot } from 'react-dom/client'
import { createMemoryHistory, createRootRoute, createRoute, createRouter, Outlet, redirect, RouterProvider } from '@tanstack/react-router'
import { beforeEach, expect, it, vi } from 'vitest'
import { Route as appRootRoute } from '@/routes/__root'
import { Route as startRoute } from '@/routes/start'
import { createTopic } from '@/server/curriculum'
import { getLatestTopicIdFn } from '@/server/latest-topic'
import { startPlacement } from '@/server/play'

vi.mock('@tanstack/react-start', () => ({ useServerFn: (fn: unknown) => fn }))
vi.mock('@/server/curriculum', () => ({ createTopic: vi.fn() }))
vi.mock('@/server/play', () => ({ startPlacement: vi.fn() }))
vi.mock('@/lib/auth-client', () => ({ authClient: {} }))
vi.mock('@/server/latest-topic', () => ({ getLatestTopicIdFn: vi.fn() }))
vi.mock('@/server/session-fn', () => ({
  getSessionFn: async () => ({ user: { id: 'learner', name: 'Learner', isAnonymous: false }, facebookEnabled: false, needsDisclosure: false }),
}))

beforeEach(() => {
  vi.mocked(getLatestTopicIdFn).mockResolvedValue(null)
})

async function renderStart(initialEntry = '/start') {
  Object.assign(globalThis, { IS_REACT_ACT_ENVIRONMENT: true })
  const rootRoute = createRootRoute({
    beforeLoad: appRootRoute.options.beforeLoad,
    loader: appRootRoute.options.loader,
    component: appRootRoute.options.component,
  })
  const start = createRoute({ getParentRoute: () => rootRoute, path: '/start', component: startRoute.options.component, validateSearch: startRoute.options.validateSearch })
  const index = createRoute({ getParentRoute: () => rootRoute, path: '/', beforeLoad: () => { throw redirect({ to: '/start' }) } })
  const play = createRoute({ getParentRoute: () => rootRoute, path: '/play/$sessionId', component: Outlet })
  const done = createRoute({ getParentRoute: () => rootRoute, path: '/play/$sessionId/done', component: () => <h1>Session done</h1> })
  const me = createRoute({ getParentRoute: () => rootRoute, path: '/me', component: () => <h1>Learner</h1> })
  const router = createRouter({ routeTree: rootRoute.addChildren([index, start, play, done, me]), history: createMemoryHistory({ initialEntries: [initialEntry] }) })
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

it('keeps the learner’s goal and material when Today is tapped on start', async () => {
  const { container, router, cleanup } = await renderStart()
  try {
    const goal = container.querySelector<HTMLInputElement>('#goal')!
    const source = container.querySelector<HTMLTextAreaElement>('#source')!
    await act(async () => {
      // Use the native setter so React sees the input events as edits.
      Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value')!.set!.call(goal, 'Pass my biology exam')
      goal.dispatchEvent(new Event('input', { bubbles: true }))
      Object.getOwnPropertyDescriptor(HTMLTextAreaElement.prototype, 'value')!.set!.call(source, 'Photosynthesis notes')
      source.dispatchEvent(new Event('input', { bubbles: true }))
    })
    const today = [...container.querySelectorAll('a')].find((link) => link.textContent?.trim() === 'Today')!
    expect(today.getAttribute('href')).toBe('/start')
    await act(async () => { today.click(); await router.load() })
    expect(container.querySelector<HTMLInputElement>('#goal')!.value).toBe('Pass my biology exam')
    expect(container.querySelector<HTMLTextAreaElement>('#source')!.value).toBe('Photosynthesis notes')
    expect(router.state.location.pathname).toBe('/start')
  } finally {
    await cleanup()
  }
})

it.each([
  { latestTopicId: null, target: '/me' },
  { latestTopicId: 'old-topic', target: '/me' },
  { latestTopicId: null, target: '/play/$sessionId/done' },
  { latestTopicId: 'old-topic', target: '/play/$sessionId/done' },
] as const)('refreshes Path after creating a topic from $latestTopicId before visiting $target', async ({ latestTopicId, target }) => {
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
    expect(pathHref()).toBe(latestTopicId ? `/t/${latestTopicId}/path` : null)
    await act(async () => {
      container.querySelector('form')!.dispatchEvent(new Event('submit', { bubbles: true, cancelable: true }))
      await started
    })
    expect.soft(pathHref(), 'Path must refresh while placement is pending').toBe('/t/new-topic/path')
    await act(async () => {
      finishPlacement({ sessionId: 'placement' })
      await vi.waitFor(() => expect(router.state.location.pathname).toBe('/play/placement'))
    })
    await act(async () => {
      await router.navigate({ to: target, params: { sessionId: 'placement' } })
    })
    expect(router.state.location.pathname).toBe(target.replace('$sessionId', 'placement'))
    expect(pathHref()).toBe('/t/new-topic/path')
  } finally {
    finishPlacement({ sessionId: 'placement' })
    await cleanup()
  }
})
