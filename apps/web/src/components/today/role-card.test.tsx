// @vitest-environment happy-dom
import { act } from 'react'
import { createRoot } from 'react-dom/client'
import { createMemoryHistory, createRootRoute, createRoute, createRouter, Outlet, RouterProvider } from '@tanstack/react-router'
import { todayFixtureNow, todayFixtures, todayView, type TodayRoleView } from '@learnquiz/api/today'
import { afterEach, expect, it } from 'vitest'
import { RoleCard } from '@/components/today/role-card'

let cleanup = () => {}
afterEach(() => cleanup())

async function mount(role: TodayRoleView) {
  Object.assign(globalThis, { IS_REACT_ACT_ENVIRONMENT: true })
  const rootRoute = createRootRoute({ component: Outlet })
  const index = createRoute({ getParentRoute: () => rootRoute, path: '/', component: () => <RoleCard role={role} /> })
  const profile = createRoute({ getParentRoute: () => rootRoute, path: '/me/profile', component: () => <h1>Profile page</h1> })
  const router = createRouter({
    routeTree: rootRoute.addChildren([index, profile]),
    history: createMemoryHistory({ initialEntries: ['/'] }),
  })
  const container = document.createElement('div')
  document.body.appendChild(container)
  const root = createRoot(container)
  cleanup = () => {
    act(() => root.unmount())
    container.remove()
    delete (globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT
  }
  await act(async () => { await router.load(); root.render(<RouterProvider router={router} />) })
  return { container, router }
}

it('shows progress against the benchmark and opens the profile', async () => {
  const { container, router } = await mount(todayView(todayFixtures.normal, todayFixtureNow).role!)
  const link = container.querySelector('a')!
  expect(link.getAttribute('aria-label')).toBe('Warehouse picker: 66% of 85% benchmark, day 16 of 30')
  expect(container.textContent).toContain('66% of 85% benchmark')
  expect(container.textContent).toContain('Day 16 of 30')
  expect(container.querySelector('[role=progressbar]')!.getAttribute('aria-valuenow')).toBe('66')
  expect((container.querySelector('[aria-hidden][style]') as HTMLElement).style.left).toBe('85%')

  await act(async () => link.click())
  expect(router.state.location.pathname).toBe('/me/profile')
  expect(container.querySelector('h1')!.textContent).toBe('Profile page')
})

it('marks a first-day role as not started with an empty bar', async () => {
  const { container } = await mount(todayView(todayFixtures.first, todayFixtureNow).role!)
  expect(container.textContent).toContain('Not started')
  expect(container.textContent).not.toContain('% of')
  expect(container.querySelector('[role=progressbar]')!.getAttribute('aria-valuenow')).toBe('0')
})
