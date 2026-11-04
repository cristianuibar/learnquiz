// @vitest-environment happy-dom
import { act } from 'react'
import { createRoot } from 'react-dom/client'
import { createMemoryHistory, createRootRoute, createRoute, createRouter, RouterProvider } from '@tanstack/react-router'
import { expect, it, vi } from 'vitest'
import { Route as startRoute } from '@/routes/start'

// Run the real createTopic validator; like TanStack Start, a failed parse rejects with the JSON-stringified issues.
vi.mock('@tanstack/react-start', () => ({
  useServerFn: (fn: unknown) => fn,
  createServerFn: () => {
    let schema: { '~standard': { validate: (v: unknown) => { issues?: unknown } } }
    const builder = {
      validator: (s: typeof schema) => ((schema = s), builder),
      handler: (fn: (ctx: { data: unknown }) => unknown) => async ({ data }: { data: unknown }) => {
        const result = schema['~standard'].validate(data)
        if (result.issues) throw new Error(JSON.stringify(result.issues, undefined, 2))
        return fn({ data })
      },
    }
    return builder
  },
}))
vi.mock('@/server/env', () => ({ getEnv: () => ({}), drainsOnRequest: () => false, runInBackground: () => {} }))
vi.mock('@/db', () => ({ getDb: () => null }))
vi.mock('@/server/session', () => ({ getSessionUser: vi.fn(), getLearnerId: vi.fn() }))
vi.mock('@/server/play', () => ({ startPlacement: vi.fn() }))
vi.mock('@/lib/auth-client', () => ({ authClient: {} }))

it('shows a plain topic message, not the issues JSON, when the topic trims to empty', async () => {
  Object.assign(globalThis, { IS_REACT_ACT_ENVIRONMENT: true })
  const rootRoute = createRootRoute()
  const route = createRoute({ getParentRoute: () => rootRoute, path: '/start', validateSearch: startRoute.options.validateSearch, component: startRoute.options.component })
  const router = createRouter({ routeTree: rootRoute.addChildren([route]), history: createMemoryHistory({ initialEntries: ['/start'] }), context: { user: { id: 'u1' } } })
  const container = document.createElement('div')
  document.body.appendChild(container)
  const root = createRoot(container)
  await act(async () => { await router.load(); root.render(<RouterProvider router={router} />) })

  const input = container.querySelector<HTMLInputElement>('#topic')!
  await act(async () => {
    Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value')!.set!.call(input, '   ')
    input.dispatchEvent(new Event('input', { bubbles: true }))
  })
  await act(async () => { container.querySelector('form')!.requestSubmit() })

  expect(container.querySelector('[role="alert"]')?.textContent).toBe('Enter a topic')
  expect(container.textContent).not.toContain('"code"')
  await act(async () => root.unmount())
  container.remove()
})
