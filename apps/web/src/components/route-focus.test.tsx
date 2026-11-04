// @vitest-environment happy-dom
import { act, StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import { createMemoryHistory, createRootRoute, createRoute, createRouter, RouterProvider } from '@tanstack/react-router'
import { expect, it, vi } from 'vitest'
import { Route as appRoot } from '@/routes/__root'

vi.mock('@/server/session-fn', () => ({ getSessionFn: vi.fn() }))
vi.mock('@/server/latest-topic', () => ({ getLatestTopicIdFn: vi.fn() }))
vi.mock('@/server/org-settings', () => ({ getCompanyBranding: vi.fn() }))

it('leaves initial-load headings untouched and focuses destinations after navigation', async () => {
  Object.assign(globalThis, { IS_REACT_ACT_ENVIRONMENT: true })
  const rootRoute = createRootRoute({
    component: appRoot.options.component,
    loader: () => ({ latestTopicId: null, branding: null }),
  })
  const router = createRouter({
    routeTree: rootRoute.addChildren([
      createRoute({ getParentRoute: () => rootRoute, path: '/sign-in', component: () => <h1>Sign in</h1> }),
      createRoute({ getParentRoute: () => rootRoute, path: '/start', component: () => <><h1>Start learning</h1><button data-focus="topic">Choose topic</button></> }),
    ]),
    history: createMemoryHistory({ initialEntries: ['/sign-in'] }),
    context: { user: null },
  })
  const container = document.createElement('div')
  document.body.appendChild(container)
  const root = createRoot(container)
  try {
    // TanStack Start hydrates inside StrictMode, which replays mount effects in development.
    await act(async () => { await router.load(); root.render(<StrictMode><RouterProvider router={router} /></StrictMode>) })
    expect(router.state.resolvedLocation?.pathname).toBe('/sign-in')
    expect(container.querySelector('h1')!.hasAttribute('tabindex')).toBe(false)
    expect(document.activeElement).toBe(document.body)

    await act(async () => { await router.navigate({ to: '/start' }) })
    expect(document.activeElement).toBe(container.querySelector('h1'))
    expect(container.querySelector('h1')!.tabIndex).toBe(-1)

    await act(async () => { await router.navigate({ to: '/sign-in' }) })
    expect(document.activeElement).toBe(container.querySelector('h1'))
    await act(async () => { await router.navigate({ to: '/start', state: { focus: 'topic' } }) })
    expect(document.activeElement).toBe(container.querySelector('[data-focus="topic"]'))
  } finally {
    await act(async () => root.unmount())
    container.remove()
    delete (globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT
  }
})
