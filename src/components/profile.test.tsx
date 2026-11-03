// @vitest-environment happy-dom
import { act } from 'react'
import { createRoot } from 'react-dom/client'
import { createMemoryHistory, createRootRoute, createRoute, createRouter, Outlet, RouterProvider } from '@tanstack/react-router'
import { expect, it, vi } from 'vitest'
import { Route as appRootRoute } from '@/routes/__root'
import { Route as meRoute } from '@/routes/me.index'
import { Route as profileRoute } from '@/routes/me.profile'
import { Route as signInRoute } from '@/routes/sign-in'
import { Route as orgRoute } from '@/routes/org.$slug'
import { Route as personRoute } from '@/routes/org.$slug.people_.$id'
import { getProfile } from '@/server/profile'
import { getSessionFn } from '@/server/session-fn'
import { getPushSettings } from '@/server/push'
import { getToday } from '@/server/today'

vi.mock('@/server/profile', () => ({ getProfile: vi.fn() }))
vi.mock('@/lib/auth-client', () => ({ authClient: {} }))
vi.mock('@/server/session-fn', () => ({ getSessionFn: vi.fn() }))
vi.mock('@/server/latest-topic', () => ({ getLatestTopicIdFn: async () => null }))
vi.mock('@/server/org-settings', () => ({ getCompanyBranding: async () => null }))
vi.mock('@/server/today', () => ({ getToday: vi.fn() }))
vi.mock('@/server/push', () => ({
  getPushSettings: vi.fn(),
  subscribe: vi.fn(), unsubscribe: vi.fn(), sendTestPush: vi.fn(), savePushPreferences: vi.fn(),
}))

function mockProfile() {
  const day = 86_400_000
  const start = Date.UTC(2026, 10, 2)
  vi.mocked(getProfile).mockResolvedValue({
    name: 'Dana Learner', topic: { id: 'training', title: 'Workplace safety' }, role: null, benchmark: 0.85,
    units: [{ id: 'unit', name: 'Foundations', concepts: [{ id: 'concept', unitId: 'unit', name: 'Emergency exits', critical: true, pKnown: 0.7 }] }],
    proficiency: { achievedAt: null, days: null, estimatedDays: 2, projectedAt: start + 8 * day },
    confidentErrors: [{ id: 'error', conceptId: 'concept', concept: 'Emergency exits', at: start, correctedAt: start + day }],
    weekly: Array.from({ length: 7 }, (_, i) => ({ date: start + i * day, mastery: 0.1 * (i + 1), attempts: 1, sessions: 1 })),
    sessionCounts: { week: 7, total: 7 },
  })
}

it.each(['user', 'admin'])('opens training progress for %s, preserves staff access, and redirects signed-out visitors', async (role) => {
  vi.mocked(getPushSettings).mockResolvedValue({ publicKey: null, isStaff: role === 'admin', endpoints: [], canPrompt: false,
    prefs: { paused: false, startMinute: 540, endMinute: 1020, timezone: 'UTC' } })
  mockProfile()
  Object.assign(globalThis, { IS_REACT_ACT_ENVIRONMENT: true })
  let user: { id: string; name: string; isAnonymous: boolean; role: string } | null = { id: 'learner', name: 'Learner', isAnonymous: false, role }
  vi.mocked(getSessionFn).mockImplementation(async () => ({ user, facebookEnabled: false, needsDisclosure: false, adminCompanies: [{ name: 'Acme', slug: 'acme' }] }))
  const rootRoute = createRootRoute({ beforeLoad: appRootRoute.options.beforeLoad, loader: appRootRoute.options.loader, component: Outlet })
  const me = createRoute({ getParentRoute: () => rootRoute, path: '/me', beforeLoad: meRoute.options.beforeLoad, loader: meRoute.options.loader, component: meRoute.options.component })
  const profile = createRoute({ getParentRoute: () => rootRoute, path: '/me/profile', beforeLoad: profileRoute.options.beforeLoad, loader: profileRoute.options.loader, component: profileRoute.options.component })
  const index = createRoute({ getParentRoute: () => rootRoute, path: '/', component: () => <h1>Home</h1> })
  const router = createRouter({ routeTree: rootRoute.addChildren([me, profile, index]), history: createMemoryHistory({ initialEntries: ['/me'] }) })
  const container = document.createElement('div')
  document.body.appendChild(container)
  const root = createRoot(container)
  try {
    await act(async () => { await router.load(); root.render(<RouterProvider router={router} />) })
    expect(container.querySelector('#push-heading')?.textContent).toBe('Notifications')
    const staffLink = [...container.querySelectorAll('a')].find((a) => a.textContent === 'Staff area')
    expect(staffLink?.getAttribute('href')).toBe(role === 'admin' ? '/admin' : undefined)
    const portalLink = [...container.querySelectorAll('a')].find((a) => a.textContent === 'Acme portal')
    expect(portalLink?.getAttribute('href')).toBe('/org/acme')
    await act(async () => {
      const link = [...container.querySelectorAll('a')].find((a) => a.textContent === 'Training progress')!
      expect(link.getAttribute('href')).toBe('/me/profile')
      link.click()
      await vi.waitFor(() => expect(container.querySelector('h1')?.textContent).toBe('Training progress'))
    })
    expect([...container.querySelectorAll('h2')].map((h) => h.textContent)).toEqual(['Concept mastery', 'Time to proficiency', 'Confident errors', 'This week'])
    expect(container.textContent).toContain('Dana Learner')
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

it('shows a company admin the member’s Training progress read-only and refuses others with the server’s 403', async () => {
  mockProfile()
  Object.assign(globalThis, { IS_REACT_ACT_ENVIRONMENT: true })
  vi.mocked(getSessionFn).mockResolvedValue({ user: { id: 'owner', name: 'Owner', isAnonymous: false, role: 'user' }, facebookEnabled: false, needsDisclosure: false, adminCompanies: [{ name: 'Acme', slug: 'acme' }] })
  const rootRoute = createRootRoute({ beforeLoad: appRootRoute.options.beforeLoad, loader: appRootRoute.options.loader, component: Outlet })
  const org = createRoute({ getParentRoute: () => rootRoute, path: '/org/$slug', beforeLoad: orgRoute.options.beforeLoad, component: Outlet })
  const person = createRoute({ getParentRoute: () => org, path: '/people/$id', loader: personRoute.options.loader as (ctx: { params: { slug: string; id: string } }) => unknown, errorComponent: personRoute.options.errorComponent, component: personRoute.options.component })
  const people = createRoute({ getParentRoute: () => org, path: '/people', component: () => <h1>People</h1> })
  const router = createRouter({ routeTree: rootRoute.addChildren([org.addChildren([person, people])]), history: createMemoryHistory({ initialEntries: ['/org/acme/people/learner'] }) })
  const container = document.createElement('div')
  document.body.appendChild(container)
  const root = createRoot(container)
  try {
    await act(async () => { await router.load(); root.render(<RouterProvider router={router} />) })
    expect(getProfile).toHaveBeenLastCalledWith({ data: { org: 'acme', learnerId: 'learner' } })
    expect(container.querySelector('h1')?.textContent).toBe('Training progress')
    expect(container.textContent).toContain('Dana Learner')
    expect([...container.querySelectorAll('h2')].map((h) => h.textContent)).toEqual(['Concept mastery', 'Time to proficiency', 'Confident errors', 'This week'])
    expect(container.querySelector('form, input, button')).toBeNull()
    expect([...container.querySelectorAll('a')].find((a) => a.textContent === 'Back to people')?.getAttribute('href')).toBe('/org/acme/people')

    vi.mocked(getProfile).mockRejectedValue(Object.assign(new Error('Only company admins can do this'), { status: 403 }))
    await act(async () => { await router.invalidate() })
    expect(container.querySelector('[role="alert"]')?.textContent).toContain('Only company admins can do this')
    expect(container.textContent).not.toContain('Dana Learner')
  } finally {
    await act(async () => root.unmount())
    container.remove()
    delete (globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT
  }
})

it('shows a guest their topic progress and reaches sign-up in one tap', async () => {
  vi.mocked(getToday).mockResolvedValue({ topic: { id: 't1', title: 'Spanish verbs', placed: true, due: 0, xp: 120, streak: 3 }, role: null } as Awaited<ReturnType<typeof getToday>>)
  vi.mocked(getPushSettings).mockClear()
  Object.assign(globalThis, { IS_REACT_ACT_ENVIRONMENT: true })
  vi.mocked(getSessionFn).mockResolvedValue({ user: { id: 'guest', name: 'Anonymous', isAnonymous: true, role: 'user' }, facebookEnabled: false, needsDisclosure: false, adminCompanies: [] })
  const rootRoute = createRootRoute({ beforeLoad: appRootRoute.options.beforeLoad, loader: appRootRoute.options.loader, component: Outlet })
  const me = createRoute({ getParentRoute: () => rootRoute, path: '/me', beforeLoad: meRoute.options.beforeLoad, loader: meRoute.options.loader, component: meRoute.options.component })
  const signIn = createRoute({ getParentRoute: () => rootRoute, path: '/sign-in', validateSearch: signInRoute.options.validateSearch, beforeLoad: signInRoute.options.beforeLoad, component: signInRoute.options.component })
  const router = createRouter({ routeTree: rootRoute.addChildren([me, signIn]), history: createMemoryHistory({ initialEntries: ['/me'] }) })
  const container = document.createElement('div')
  document.body.appendChild(container)
  const root = createRoot(container)
  try {
    await act(async () => { await router.load(); root.render(<RouterProvider router={router} />) })
    expect(container.querySelector('h1')?.textContent).toBe('Guest')
    expect(container.textContent).toContain('Spanish verbs')
    expect(container.textContent).toContain('Streak 3 · 120 XP')
    expect(getPushSettings).not.toHaveBeenCalled()
    expect([...container.querySelectorAll('button')].some((b) => b.textContent === 'Sign out')).toBe(false)
    await act(async () => {
      const link = [...container.querySelectorAll('a')].find((a) => a.textContent === 'Save your progress')!
      link.click()
      await vi.waitFor(() => expect(container.querySelector('h1')?.textContent).toBe('Create an account'))
    })
    expect(container.querySelector('#name')).not.toBeNull()
  } finally {
    await act(async () => root.unmount())
    container.remove()
    delete (globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT
  }
})
