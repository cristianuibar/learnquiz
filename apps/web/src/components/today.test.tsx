// @vitest-environment happy-dom
import { act } from 'react'
import { createRoot } from 'react-dom/client'
import { type AnyRootRoute, createMemoryHistory, createRootRoute, createRoute, createRouter, Outlet, RouterProvider } from '@tanstack/react-router'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { todayFixtureNow, todayFixtures, todayView, type Today } from '@learnquiz/api/today'
import { offlineBody } from '@learnquiz/api/system-copy'
import { Route as todayRoute } from '@/routes/today'
import { startSession } from '@/server/play'
import { getToday } from '@/server/today'

vi.mock('@tanstack/react-start', () => ({ useServerFn: (fn: unknown) => fn }))
vi.mock('@/server/play', () => ({ startPlacement: vi.fn(), startSession: vi.fn() }))
vi.mock('@/server/today', () => ({ getToday: vi.fn() }))

beforeEach(() => {
  Object.assign(globalThis, { IS_REACT_ACT_ENVIRONMENT: true })
  vi.useFakeTimers({ toFake: ['Date'] })
  vi.setSystemTime(todayFixtureNow)
  vi.spyOn(navigator, 'onLine', 'get').mockReturnValue(true)
})

afterEach(() => {
  vi.useRealTimers()
  vi.restoreAllMocks()
  vi.resetAllMocks()
  delete (globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT
})

async function renderToday(today: Today) {
  vi.mocked(getToday).mockResolvedValue(today)
  const rootRoute: AnyRootRoute = createRootRoute({
    beforeLoad: () => ({ user: { id: 'learner', name: 'Learner', isAnonymous: false } }),
    component: Outlet,
  })
  const route = createRoute({
    getParentRoute: () => rootRoute,
    path: '/today',
    beforeLoad: todayRoute.options.beforeLoad,
    loader: todayRoute.options.loader,
    errorComponent: todayRoute.options.errorComponent,
    component: todayRoute.options.component,
  })
  const stub = (path: string, text: string) => createRoute({ getParentRoute: () => rootRoute, path, component: () => <h1>{text}</h1> })
  const play = createRoute({ getParentRoute: () => rootRoute, path: '/play/$sessionId', component: () => <p>Playing</p> })
  const router = createRouter({
    routeTree: rootRoute.addChildren([route, stub('/start', 'Start page'), stub('/me/profile', 'Profile page'), play]),
    history: createMemoryHistory({ initialEntries: ['/today'] }),
  })
  const container = document.createElement('div')
  document.body.appendChild(container)
  const root = createRoot(container)
  await act(async () => { await router.load(); root.render(<RouterProvider router={router} />) })
  return {
    container,
    router,
    buttons: () => [...container.querySelectorAll('button')],
    async cleanup() {
      await act(async () => root.unmount())
      container.remove()
    },
  }
}

const playButton = (buttons: HTMLButtonElement[]) => buttons.find((b) => b.textContent?.trim().startsWith('Play'))

describe('Today fixtures', () => {
  it.each(['first', 'normal', 'basics', 'building', 'done'] as const)('renders %s', async (name) => {
    const today = todayFixtures[name]
    const view = todayView(today, todayFixtureNow)
    const { container, buttons, cleanup } = await renderToday(today)
    try {
      expect(container.querySelector('h1')?.textContent).toBe('Today')
      expect(container.querySelector('h2')?.textContent).toBe(view.hero.kind === 'empty' ? '' : view.hero.title)
      if (view.hero.kind === 'done') {
        expect(container.textContent).toContain('Next reviews tomorrow')
        expect(buttons().some((b) => b.textContent?.trim() === 'Practice anyway')).toBe(true)
        expect(playButton(buttons())).toBeUndefined()
      } else if (view.hero.kind !== 'empty') {
        const play = playButton(buttons())!
        expect(play.textContent?.trim()).toBe(view.hero.play.label)
        expect(play.getAttribute('aria-label')).toBe(view.hero.play.accessibleLabel)
        expect(play.hasAttribute('disabled')).toBe(view.hero.play.disabled)
      }
      for (const quest of view.quests) expect(container.textContent).toContain(quest.label)
      const role = container.querySelector<HTMLAnchorElement>('a[href="/me/profile"]')!
      expect(role.getAttribute('aria-label')).toBe(view.role!.accessibleLabel)
    } finally {
      await cleanup()
    }
  })

  it.each([
    { name: 'first', title: 'Your first session', play: 'Play · 5 min' },
    { name: 'normal', title: '4 reviews, then Picking', play: 'Play · 5 min' },
    { name: 'done', title: 'Done for today', play: 'Practice anyway' },
  ] as const)('shows literal copy for $name', async ({ name, title, play }) => {
    const { container, cleanup } = await renderToday(todayFixtures[name])
    try {
      expect(container.querySelector('h2')?.textContent).toBe(title)
      expect(container.textContent).toContain(play)
    } finally {
      await cleanup()
    }
  })

  it('shows building progress', async () => {
    const { container, cleanup } = await renderToday(todayFixtures.building)
    try {
      expect(container.querySelector('[role=progressbar]')?.getAttribute('aria-valuetext')).toBe('28 of 42 topics ready')
      expect(container.querySelector('[role=status]')?.textContent).toBe('28 of 42 topics ready')
    } finally {
      await cleanup()
    }
  })

  it('shows preparing without Play', async () => {
    const { container, buttons, cleanup } = await renderToday(todayFixtures.preparing)
    try {
      expect(playButton(buttons())).toBeUndefined()
      expect(container.textContent).toContain('Building your questions')
    } finally {
      await cleanup()
    }
  })

  it('links learners without a role to Start', async () => {
    const { container, cleanup } = await renderToday({ ...todayFixtures.normal, role: null })
    try {
      const link = [...container.querySelectorAll('a')].find((a) => a.textContent?.trim() === 'Learn something new')!
      expect(link.getAttribute('href')).toBe('/start')
      expect(container.querySelector('a[href="/me/profile"]')).toBeNull()
    } finally {
      await cleanup()
    }
  })

  it('redirects to Start without a topic or role', async () => {
    const { router, cleanup } = await renderToday({ topic: null, role: null, plan: null })
    try {
      expect(router.state.location.pathname).toBe('/start')
    } finally {
      await cleanup()
    }
  })
})

describe('Today interactions', () => {
  it('disables Play while offline and re-enables it when back online', async () => {
    vi.spyOn(navigator, 'onLine', 'get').mockReturnValue(false)
    const { container, buttons, cleanup } = await renderToday(todayFixtures.normal)
    try {
      expect(container.textContent).toContain('You’re offline')
      const play = playButton(buttons())!
      expect(play.hasAttribute('disabled')).toBe(true)
      const described = container.querySelector(`[id="${play.getAttribute('aria-describedby')}"]`)
      expect(described?.textContent).toContain(offlineBody)
      vi.spyOn(navigator, 'onLine', 'get').mockReturnValue(true)
      await act(async () => { window.dispatchEvent(new Event('online')) })
      expect(container.textContent).not.toContain('You’re offline')
      expect(playButton(buttons())!.hasAttribute('disabled')).toBe(false)
    } finally {
      await cleanup()
    }
  })

  it('starts a session when Play is pressed', async () => {
    vi.mocked(startSession).mockResolvedValue({ sessionId: 's1' })
    const { router, buttons, cleanup } = await renderToday(todayFixtures.normal)
    try {
      await act(async () => {
        playButton(buttons())!.click()
        await vi.waitFor(() => expect(router.state.location.pathname).toBe('/play/s1'))
      })
      expect(startSession).toHaveBeenCalledWith({ data: { topicId: 'topic-warehouse' } })
    } finally {
      await cleanup()
    }
  })
})
