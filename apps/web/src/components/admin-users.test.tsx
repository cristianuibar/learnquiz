// @vitest-environment happy-dom
import { act } from 'react'
import { createRoot } from 'react-dom/client'
import { createMemoryHistory, createRootRoute, createRoute, createRouter, Outlet, RouterProvider } from '@tanstack/react-router'
import { expect, it, vi } from 'vitest'
import { Route as usersRoute } from '@/routes/admin.users'
import { listUsers } from '@/server/admin'

vi.mock('@/server/admin', () => ({ listUsers: vi.fn(), setUserBan: vi.fn() }))

it('uses the singular for one user in the users count', async () => {
  Object.assign(globalThis, { IS_REACT_ACT_ENVIRONMENT: true })
  for (const [total, text] of [[1, '1 user found'], [0, '0 users found'], [2, '2 users found']] as const) {
    vi.mocked(listUsers).mockResolvedValue({ users: [], total } as never)
    const rootRoute = createRootRoute({ component: Outlet, beforeLoad: () => ({ staff: { id: 'staff' } }) })
    const users = createRoute({ getParentRoute: (() => rootRoute) as never, path: '/admin/users' as never, validateSearch: usersRoute.options.validateSearch, loaderDeps: usersRoute.options.loaderDeps, loader: usersRoute.options.loader as never, component: usersRoute.options.component })
    const router = createRouter({ routeTree: rootRoute.addChildren([users as never]), history: createMemoryHistory({ initialEntries: ['/admin/users'] }) })
    const container = document.createElement('div')
    document.body.appendChild(container)
    const root = createRoot(container)
    try {
      await act(async () => { await router.load(); root.render(<RouterProvider router={router} />) })
      expect(container.querySelector('[role="status"]')!.textContent).toBe(text)
    } finally {
      await act(async () => root.unmount())
      container.remove()
    }
  }
  delete (globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT
})
