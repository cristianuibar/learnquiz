// @vitest-environment happy-dom
import { act } from 'react'
import { createRoot } from 'react-dom/client'
import { createMemoryHistory, createRootRoute, createRoute, createRouter, RouterProvider } from '@tanstack/react-router'
import { afterAll, expect, it, vi } from 'vitest'
import { Route as indexRoute } from '@/routes/index'
import { Route as signInRoute } from '@/routes/sign-in'

// Better Auth captures fetch when its client is created, so stub the HTTP boundary before importing routes.
const fetch = vi.hoisted(() => {
  const fetch = vi.fn()
  vi.stubGlobal('fetch', fetch)
  return fetch
})
afterAll(() => vi.unstubAllGlobals())

it.each([
  { entry: '/sign-in', action: 'Sign in', endpoint: '/sign-in/email' },
  { entry: '/sign-in?mode=up', action: 'Create account', endpoint: '/sign-up/email' },
  { entry: '/', action: 'Continue as guest', endpoint: '/sign-in/anonymous' },
])('recovers $action after a rejected auth request and allows retry', async ({ entry, action, endpoint }) => {
  Object.assign(globalThis, { IS_REACT_ACT_ENVIRONMENT: true })
  let rejectRequest!: (error: Error) => void
  fetch.mockReset()
    .mockImplementationOnce(() => new Promise<Response>((_, reject) => { rejectRequest = reject }))
    .mockImplementation(() => Promise.resolve(Response.json({ user: { id: 'learner' }, token: 'test-token' })))
  const rootRoute = createRootRoute()
  const router = createRouter({
    routeTree: rootRoute.addChildren([
      createRoute({ getParentRoute: () => rootRoute, path: '/', component: indexRoute.options.component }),
      createRoute({ getParentRoute: () => rootRoute, path: '/sign-in', validateSearch: signInRoute.options.validateSearch, component: signInRoute.options.component }),
      createRoute({ getParentRoute: () => rootRoute, path: '/start', component: () => <h1>Start learning</h1> }),
    ]),
    history: createMemoryHistory({ initialEntries: [entry] }),
    context: { user: null, adminCompanies: [], facebookEnabled: false },
  })
  const container = document.createElement('div')
  document.body.appendChild(container)
  const root = createRoot(container)
  const button = () => [...container.querySelectorAll('button')].find((b) => b.textContent === action)!
  const type = (selector: string, value: string) => act(async () => {
    const input = container.querySelector<HTMLInputElement>(selector)!
    Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value')!.set!.call(input, value)
    input.dispatchEvent(new Event('input', { bubbles: true }))
  })
  try {
    await act(async () => { await router.load(); root.render(<RouterProvider router={router} />) })
    if (entry === '/') {
      await type('input', 'Spanish verbs')
    } else {
      await type('#email', 'learner@example.test')
      if (action === 'Create account') await type('#name', 'Learner')
      await type('#password', 'test-password')
    }
    expect(button().disabled).toBe(false)
    await act(async () => { button().click() })
    expect(button().disabled).toBe(true)
    expect(String(fetch.mock.calls[0][0])).toContain(endpoint)
    await act(async () => { rejectRequest(new TypeError('Failed to fetch')) })
    expect(container.querySelector('[role="alert"]')?.textContent).toMatch(/check your connection and try again/i)
    expect(button().disabled).toBe(false)
    if (entry === '/') {
      expect(container.querySelector<HTMLButtonElement>('button[type="submit"]')!.disabled).toBe(false)
    }
    await act(async () => {
      button().click()
      await vi.waitFor(() => expect(router.state.location.pathname).toBe(entry === '/' ? '/start' : '/'))
    })
    expect(container.querySelector('[role="alert"]')).toBeNull()
    if (entry === '/') expect(router.state.location.search).toEqual({ topic: 'Spanish verbs' })
  } finally {
    await act(async () => root.unmount())
    container.remove()
    delete (globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT
  }
})
