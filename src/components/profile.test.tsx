// @vitest-environment happy-dom
import { act } from 'react'
import { createRoot } from 'react-dom/client'
import { createMemoryHistory, createRootRoute, createRoute, createRouter, Outlet, RouterProvider } from '@tanstack/react-router'
import { expect, it, vi } from 'vitest'
import { Route as appRootRoute } from '@/routes/__root'
import { Route as meRoute } from '@/routes/me.index'
import { Route as profileRoute } from '@/routes/me.profile'
import { getProfile } from '@/server/profile'
import { getSessionFn } from '@/server/session-fn'

vi.mock('@/server/profile', () => ({ getProfile: vi.fn() }))
vi.mock('@/lib/auth-client', () => ({ authClient: {} }))
vi.mock('@/server/session-fn', () => ({ getSessionFn: vi.fn() }))
vi.mock('@/server/latest-topic', () => ({ getLatestTopicIdFn: async () => null }))

it.each(['user', 'admin'])('opens training progress for %s, preserves staff access, and redirects signed-out visitors', async (role) => {
  const day = 86_400_000
  const start = Date.UTC(2026, 10, 2)
  vi.mocked(getProfile).mockResolvedValue({
    topic: { id: 'training', title: 'Workplace safety' }, role: null, benchmark: 0.85,
    units: [{ id: 'unit', name: 'Foundations', concepts: [{ id: 'concept', unitId: 'unit', name: 'Emergency exits', critical: true, pKnown: 0.7 }] }],
    proficiency: { achievedAt: null, days: null, estimatedDays: 2, projectedAt: start + 8 * day },
    confidentErrors: [{ id: 'error', conceptId: 'concept', concept: 'Emergency exits', at: start, correctedAt: start + day }],
    weekly: Array.from({ length: 7 }, (_, i) => ({ date: start + i * day, mastery: 0.1 * (i + 1), attempts: 1, sessions: 1 })),
    sessionCounts: { week: 7, total: 7 },
  })
  Object.assign(globalThis, { IS_REACT_ACT_ENVIRONMENT: true })
  let user: { id: string; name: string; isAnonymous: boolean; role: string } | null = { id: 'learner', name: 'Learner', isAnonymous: false, role }
  vi.mocked(getSessionFn).mockImplementation(async () => ({ user, facebookEnabled: false, needsDisclosure: false }))
  const rootRoute = createRootRoute({ beforeLoad: appRootRoute.options.beforeLoad, loader: appRootRoute.options.loader, component: Outlet })
  const me = createRoute({ getParentRoute: () => rootRoute, path: '/me', beforeLoad: meRoute.options.beforeLoad, component: meRoute.options.component })
  const profile = createRoute({ getParentRoute: () => rootRoute, path: '/me/profile', beforeLoad: profileRoute.options.beforeLoad, loader: profileRoute.options.loader, component: profileRoute.options.component })
  const index = createRoute({ getParentRoute: () => rootRoute, path: '/', component: () => <h1>Home</h1> })
  const router = createRouter({ routeTree: rootRoute.addChildren([me, profile, index]), history: createMemoryHistory({ initialEntries: ['/me'] }) })
  const container = document.createElement('div')
  document.body.appendChild(container)
  const root = createRoot(container)
  try {
    await act(async () => { await router.load(); root.render(<RouterProvider router={router} />) })
    const staffLink = [...container.querySelectorAll('a')].find((a) => a.textContent === 'Staff area')
    expect(staffLink?.getAttribute('href')).toBe(role === 'admin' ? '/admin' : undefined)
    await act(async () => {
      const link = [...container.querySelectorAll('a')].find((a) => a.textContent === 'Training progress')!
      expect(link.getAttribute('href')).toBe('/me/profile')
      link.click()
      await vi.waitFor(() => expect(container.querySelector('h1')?.textContent).toBe('Training progress'))
    })
    expect([...container.querySelectorAll('h2')].map((h) => h.textContent)).toEqual(['Concept mastery', 'Time to proficiency', 'Confident errors', 'This week'])
    expect(container.textContent).toContain('Workplace safety')
    expect(container.textContent).toContain('Corrected: 3 Nov 2026')
    expect(container.textContent).toContain('7 completed sessions this week')
    user = null
    await act(async () => { await router.invalidate() })
    expect(router.state.location.pathname).toBe('/')
    expect(container.querySelector('h1')?.textContent).toBe('Home')
  } finally {
    await act(async () => root.unmount())
    container.remove()
    delete (globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT
  }
})
