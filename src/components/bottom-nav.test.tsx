// @vitest-environment happy-dom
import { act } from 'react'
import { createRoot } from 'react-dom/client'
import { createMemoryHistory, createRootRoute, createRoute, createRouter, Outlet, redirect, RouterProvider } from '@tanstack/react-router'
import { expect, it, vi } from 'vitest'
import { BottomNav } from './bottom-nav'
import { Route as startRoute } from '@/routes/start'

vi.mock('@tanstack/react-start', () => ({ useServerFn: (fn: unknown) => fn }))
vi.mock('@/server/curriculum', () => ({ createTopic: vi.fn() }))
vi.mock('@/server/play', () => ({ startPlacement: vi.fn() }))
vi.mock('@/lib/auth-client', () => ({ authClient: {} }))

it('keeps the learner’s goal and material when Today is tapped on start', async () => {
  Object.assign(globalThis, { IS_REACT_ACT_ENVIRONMENT: true })
  const rootRoute = createRootRoute({
    beforeLoad: () => ({ user: { id: 'learner' } }),
    component: () => <><Outlet /><BottomNav topicId={null} /></>,
  })
  const start = createRoute({ getParentRoute: () => rootRoute, path: '/start', component: startRoute.options.component, validateSearch: startRoute.options.validateSearch })
  const index = createRoute({ getParentRoute: () => rootRoute, path: '/', beforeLoad: () => { throw redirect({ to: '/start' }) } })
  const router = createRouter({ routeTree: rootRoute.addChildren([index, start]), history: createMemoryHistory({ initialEntries: ['/start'] }) })
  const container = document.createElement('div')
  document.body.appendChild(container)
  const root = createRoot(container)
  try {
    await act(async () => { await router.load(); root.render(<RouterProvider router={router} />) })
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
    await act(async () => root.unmount())
    container.remove()
    delete (globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT
  }
})
