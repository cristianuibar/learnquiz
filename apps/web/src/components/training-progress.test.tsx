// @vitest-environment happy-dom
import { act } from 'react'
import { createRoot } from 'react-dom/client'
import { createMemoryHistory, createRootRoute, createRoute, createRouter, Outlet, RouterProvider } from '@tanstack/react-router'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import type { Profile } from '@learnquiz/api/progress'
import { Route as appRootRoute } from '@/routes/__root'
import { Route as profileRoute } from '@/routes/me.profile'
import { Route as orgRoute } from '@/routes/org.$slug'
import { Route as personRoute } from '@/routes/org.$slug.people_.$id'
import { getProfile } from '@/server/profile'
import { getSessionFn } from '@/server/session-fn'
import { getToday } from '@/server/today'

vi.mock('@/server/profile', () => ({ getProfile: vi.fn() }))
vi.mock('@/lib/auth-client', () => ({ authClient: {} }))
vi.mock('@/server/session-fn', () => ({ getSessionFn: vi.fn() }))
vi.mock('@/server/latest-topic', () => ({ getLatestTopicIdFn: async () => null }))
vi.mock('@/server/org-settings', () => ({ getCompanyBranding: async () => null }))
vi.mock('@/server/today', () => ({ getToday: vi.fn() }))

const day = 86_400_000
const start = Date.UTC(2026, 10, 2)
const onboarding = { day: 1, days: 30 } as Profile['onboarding']

function profile(over: Partial<Profile> = {}): Profile {
  return {
    name: 'Dana Learner', topic: { id: 't1', title: 'Workplace safety' }, role: 'Nurse', benchmark: 0.85, started: true, onboarding,
    mastery: 0.66, units: [], confidentErrors: [],
    proficiency: { achievedAt: null, days: null, estimatedDays: 2, projectedAt: start + 8 * day },
    weeks: [{ start: start - 7 * day, mastery: 0.4, sessions: 3, partial: false }, { start, mastery: 0.66, sessions: 4, partial: true }],
    sessionCounts: { week: 7, total: 7 },
    ...over,
  }
}

const emptyProfile = () => profile({ started: false, mastery: 0, weeks: [], sessionCounts: { week: 0, total: 0 }, proficiency: { achievedAt: null, days: null, estimatedDays: null, projectedAt: null } })

let container: HTMLDivElement
let root: ReturnType<typeof createRoot>

beforeEach(() => {
  Object.assign(globalThis, { IS_REACT_ACT_ENVIRONMENT: true })
  vi.mocked(getProfile).mockReset()
  vi.mocked(getToday).mockReset()
  vi.mocked(getSessionFn).mockResolvedValue({ user: { id: 'learner', name: 'Learner', isAnonymous: false, role: 'user' }, facebookEnabled: false, needsDisclosure: false, adminCompanies: [{ name: 'Acme', slug: 'acme' }] })
  container = document.createElement('div')
  document.body.appendChild(container)
  root = createRoot(container)
})

afterEach(async () => {
  await act(async () => root.unmount())
  container.remove()
  delete (globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT
})

async function mount(path: '/me/profile' | '/org/acme/people/learner') {
  const rootRoute = createRootRoute({ beforeLoad: appRootRoute.options.beforeLoad, loader: appRootRoute.options.loader, component: Outlet })
  const me = createRoute({ getParentRoute: () => rootRoute, path: '/me/profile', beforeLoad: profileRoute.options.beforeLoad, loader: profileRoute.options.loader, component: profileRoute.options.component })
  const org = createRoute({ getParentRoute: () => rootRoute, path: '/org/$slug', beforeLoad: orgRoute.options.beforeLoad, component: Outlet })
  const person = createRoute({ getParentRoute: () => org, path: '/people/$id', loader: personRoute.options.loader as (ctx: { params: { slug: string; id: string } }) => unknown, component: personRoute.options.component })
  const people = createRoute({ getParentRoute: () => org, path: '/people', component: () => <h1>People</h1> })
  const loading = createRoute({ getParentRoute: () => rootRoute, path: '/play/loading', component: () => <h1>Loading</h1> })
  const router = createRouter({ routeTree: rootRoute.addChildren([me, org.addChildren([person, people]), loading]), history: createMemoryHistory({ initialEntries: [path] }) })
  await act(async () => { await router.load(); root.render(<RouterProvider router={router} />) })
  return router
}

const text = () => container.textContent ?? ''
const SELF_LINE = "Your company's training admins see this same page."

describe('Training progress', () => {
  it.each([
    ['/me/profile', true],
    ['/org/acme/people/learner', false],
  ] as const)('%s shows the admins-see-this line only to the learner: %s', async (path, self) => {
    vi.mocked(getProfile).mockResolvedValue(profile())
    await mount(path)
    expect(text().includes(SELF_LINE)).toBe(self)
    expect(text()).toContain('Dana Learner')
    expect(getToday).not.toHaveBeenCalled()
  })

  it('shows the empty card and starts the first placement from the learner page', async () => {
    vi.mocked(getProfile).mockResolvedValue(emptyProfile())
    vi.mocked(getToday).mockResolvedValue({ topic: { id: 't1', title: 'Workplace safety' }, role: { preparing: false }, plan: { playable: true, start: 'placement' } } as Awaited<ReturnType<typeof getToday>>)
    const router = await mount('/me/profile')
    expect(getToday).toHaveBeenCalledTimes(1)
    expect(text()).toContain('Day 1 of 30 · Benchmark 85%')
    expect(container.querySelector('[role="progressbar"]')?.getAttribute('aria-valuetext')).toBe('No sessions yet, benchmark 85%')
    expect(text()).not.toContain('Weekly trend')
    expect(text()).not.toContain('66%')
    const button = [...container.querySelectorAll('button')].find((b) => b.textContent === 'Play first session')!
    await act(async () => { button.click() })
    await vi.waitFor(() => expect(router.state.location.pathname).toBe('/play/loading'))
    expect(router.state.location.search).toEqual({ topicId: 't1', start: 'placement' })
  })

  it('offers no first-session button when the plan is not playable', async () => {
    vi.mocked(getProfile).mockResolvedValue(emptyProfile())
    vi.mocked(getToday).mockResolvedValue({ topic: { id: 't1', title: 'x' }, role: { preparing: true }, plan: { playable: true, start: 'session' } } as Awaited<ReturnType<typeof getToday>>)
    await mount('/me/profile')
    expect(text()).toContain('Your progress shows up after your first session.')
    expect(container.querySelector('button')).toBeNull()
  })

  it('shows a partner the empty card without a button', async () => {
    vi.mocked(getProfile).mockResolvedValue(emptyProfile())
    await mount('/org/acme/people/learner')
    expect(text()).toContain('Day 1 of 30 · Benchmark 85%')
    expect(container.querySelector('button')).toBeNull()
    expect(getToday).not.toHaveBeenCalled()
  })

  it.each([
    ['reached', { achievedAt: start, days: 16, estimatedDays: null, projectedAt: null }, 'Reached Nov 2', ['Projected:']],
    ['projected', { achievedAt: null, days: null, estimatedDays: 2, projectedAt: start + 10 * day }, 'Projected: Nov 12', ['Reached']],
    ['neither', { achievedAt: null, days: null, estimatedDays: null, projectedAt: null }, 'Day 1 of 30', ['Reached', 'Projected:']],
  ])('proficiency %s', async (_name, proficiency, shown, hidden) => {
    vi.mocked(getProfile).mockResolvedValue(profile({ proficiency }))
    await mount('/me/profile')
    expect(text()).toContain(shown)
    for (const h of hidden) expect(text()).not.toContain(h)
  })
})
