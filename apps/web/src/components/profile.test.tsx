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
import { getToday } from '@/server/today'
import { authClient } from '@/lib/auth-client'

vi.mock('@/server/profile', () => ({ getProfile: vi.fn() }))
vi.mock('@/lib/auth-client', () => ({ authClient: {} }))
vi.mock('@/server/session-fn', () => ({ getSessionFn: vi.fn() }))
vi.mock('@/server/latest-topic', () => ({ getLatestTopicIdFn: async () => null }))
vi.mock('@/server/org-settings', () => ({ getCompanyBranding: async () => null }))
vi.mock('@/server/today', () => ({ getToday: vi.fn() }))

function mockProfile() {
  const day = 86_400_000
  const start = Date.UTC(2026, 10, 2)
  vi.mocked(getProfile).mockResolvedValue({
    name: 'Dana Learner', topic: { id: 'training', title: 'Workplace safety' }, role: null, benchmark: 0.85, started: true, onboarding: null,
    mastery: 0.7,
    units: [{ id: 'unit', name: 'Foundations', mastery: 0.7, state: 'learning', concepts: [{ id: 'concept', unitId: 'unit', name: 'Emergency exits', critical: true, pKnown: 0.7, measured: true, status: 'learning' }] }],
    proficiency: { achievedAt: null, days: null, estimatedDays: 2, projectedAt: start + 8 * day },
    confidentErrors: [{ id: 'error', conceptId: 'concept', concept: 'Emergency exits', at: start, correctedAt: start + day }],
    weeks: [{ start: start - 7 * day, mastery: 0.4, sessions: 3, partial: false }, { start, mastery: 0.7, sessions: 4, partial: true }],
    sessionCounts: { week: 7, total: 7 },
  })
}

it.each(['user', 'admin'])('sends %s accounts from /me to training progress with a Settings link, and redirects signed-out visitors', async (role) => {
  mockProfile()
  Object.assign(globalThis, { IS_REACT_ACT_ENVIRONMENT: true })
  let user: { id: string; name: string; isAnonymous: boolean; role: string } | null = { id: 'learner', name: 'Learner', isAnonymous: false, role }
  vi.mocked(getSessionFn).mockImplementation(async () => ({ user, facebookEnabled: false, needsDisclosure: false, adminCompanies: [{ name: 'Acme', slug: 'acme' }] }))
  const rootRoute = createRootRoute({ beforeLoad: appRootRoute.options.beforeLoad, loader: appRootRoute.options.loader, component: Outlet })
  const me = createRoute({ getParentRoute: () => rootRoute, path: '/me', beforeLoad: meRoute.options.beforeLoad, loader: meRoute.options.loader, component: meRoute.options.component })
  const profile = createRoute({ getParentRoute: () => rootRoute, path: '/me/profile', beforeLoad: profileRoute.options.beforeLoad, loader: profileRoute.options.loader, component: profileRoute.options.component })
  const index = createRoute({ getParentRoute: () => rootRoute, path: '/', component: () => <h1>Home</h1> })
  const settings = createRoute({ getParentRoute: () => rootRoute, path: '/me/settings', component: () => <h1>Settings</h1> })
  const router = createRouter({ routeTree: rootRoute.addChildren([me, profile, settings, index]), history: createMemoryHistory({ initialEntries: ['/me'] }) })
  const container = document.createElement('div')
  document.body.appendChild(container)
  const root = createRoot(container)
  try {
    await act(async () => { await router.load(); root.render(<RouterProvider router={router} />) })
    // Accounts never see the old /me page: it redirects to Training progress.
    expect(router.state.location.pathname).toBe('/me/profile')
    expect(container.querySelector('h1')?.textContent).toBe('Training progress')
    expect([...container.querySelectorAll('a')].find((a) => a.getAttribute('aria-label') === 'Settings')?.getAttribute('href')).toBe('/me/settings')
    expect([...container.querySelectorAll('h2')].map((h) => h.textContent)).toEqual(['Role mastery', 'Weekly trend', 'By unit', 'Critical steps to recheck'])
    expect(container.textContent).toContain('Dana Learner')
    expect(container.textContent).toContain('Projected: Nov 10')
    expect([...container.querySelectorAll('table tbody tr')].map((r) => r.textContent)).toEqual(['Oct 2640%3', 'Nov 270%4 so far', 'Nov 10 (projected)85%'])
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
  const today = createRoute({ getParentRoute: () => rootRoute, path: '/today', component: () => <h1>Today</h1> })
  const signIn = createRoute({ getParentRoute: () => rootRoute, path: '/sign-in', component: () => <h1>Sign in</h1> })
  const router = createRouter({ routeTree: rootRoute.addChildren([org.addChildren([person, people]), today, signIn]), history: createMemoryHistory({ initialEntries: ['/org/acme/people/learner'] }) })
  const container = document.createElement('div')
  document.body.appendChild(container)
  const root = createRoot(container)
  try {
    await act(async () => { await router.load(); root.render(<RouterProvider router={router} />) })
    expect(getProfile).toHaveBeenLastCalledWith({ data: { org: 'acme', learnerId: 'learner' } })
    expect(container.querySelector('h1')?.textContent).toBe('Training progress')
    expect(container.querySelector('h1')?.classList.contains('text-title-1')).toBe(true)
    expect(container.textContent).toContain('Dana Learner')
    expect([...container.querySelectorAll('h2')].map((h) => h.textContent)).toEqual(['Role mastery', 'Weekly trend', 'By unit', 'Critical steps to recheck'])
    expect(container.querySelector('form, input, button:not([aria-expanded])')).toBeNull()
    expect([...container.querySelectorAll('a')].find((a) => a.textContent === 'Back to people')?.getAttribute('href')).toBe('/org/acme/people')

    vi.mocked(getProfile).mockRejectedValue(Object.assign(new Error('Only company admins can do this'), { status: 403 }))
    await act(async () => { await router.invalidate() })
    expect(container.querySelector('[role="alert"]')?.textContent).toContain('Only company admins can do this')
    expect(container.textContent).not.toContain('Dana Learner')
    expect([...container.querySelectorAll('button')].map((b) => b.textContent)).toEqual(['Sign in as someone else'])

    // Offline, signOut rejects; the button must come back so switching works after reconnecting.
    const signOut = vi.fn().mockRejectedValueOnce(new TypeError('Failed to fetch')).mockResolvedValueOnce({ data: { success: true }, error: null })
    Object.assign(authClient, { signOut })
    const switchButton = () => container.querySelector('button')!
    await act(async () => { switchButton().click() })
    expect(container.textContent).toContain('Could not sign out')
    expect(switchButton().disabled).toBe(false)
    expect(router.state.location.pathname).toBe('/org/acme/people/learner')
    await act(async () => { switchButton().click() })
    expect(signOut).toHaveBeenCalledTimes(2)
    expect(router.state.location.pathname).toBe('/sign-in')
    await act(async () => { router.history.back() })
    await act(async () => { await router.invalidate() })

    await act(async () => { [...container.querySelectorAll('a')].find((a) => a.textContent === 'Go to Today')?.click() })
    expect(router.state.location.pathname).toBe('/today')
    expect(container.querySelector('h1')?.textContent).toBe('Today')
  } finally {
    await act(async () => root.unmount())
    container.remove()
    delete (globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT
  }
})

it('shows a guest their topic progress and reaches sign-up in one tap', async () => {
  vi.mocked(getToday).mockResolvedValue({ topic: { id: 't1', title: 'Spanish verbs', placed: true, placeable: true, due: 0, xp: 120, streak: 3 }, role: null, plan: null } as Awaited<ReturnType<typeof getToday>>)
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
