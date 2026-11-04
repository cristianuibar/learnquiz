// @vitest-environment happy-dom
import { act } from 'react'
import { createRoot } from 'react-dom/client'
import { createMemoryHistory, createRootRoute, createRoute, createRouter, Outlet, RouterProvider } from '@tanstack/react-router'
import { expect, it, vi } from 'vitest'
import { Route as adminRoute } from '@/routes/admin'
import { Route as usersRoute } from '@/routes/admin.users'
import { listUsers } from '@/server/admin'

vi.mock('@/server/admin', () => ({ listUsers: vi.fn(), setUserBan: vi.fn(), getStaffSession: vi.fn() }))

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

it('offers a way back to page 1 when the offset is past the last user', async () => {
  Object.assign(globalThis, { IS_REACT_ACT_ENVIRONMENT: true })
  vi.mocked(listUsers).mockResolvedValue({ users: [], total: 10 } as never)
  const rootRoute = createRootRoute({ component: Outlet, beforeLoad: () => ({ staff: { id: 'staff' } }) })
  const users = createRoute({ getParentRoute: (() => rootRoute) as never, path: '/admin/users' as never, validateSearch: usersRoute.options.validateSearch, loaderDeps: usersRoute.options.loaderDeps, loader: usersRoute.options.loader as never, component: usersRoute.options.component })
  const router = createRouter({ routeTree: rootRoute.addChildren([users as never]), history: createMemoryHistory({ initialEntries: ['/admin/users?search=ann&offset=25'] }) })
  const container = document.createElement('div')
  document.body.appendChild(container)
  const root = createRoot(container)
  try {
    await act(async () => { await router.load(); root.render(<RouterProvider router={router} />) })
    const link = [...container.querySelectorAll('a')].find((a) => a.textContent === 'Go to page 1')!
    expect(link.getAttribute('href')).toContain('offset=0')
    expect(link.getAttribute('href')).toContain('search=ann')
  } finally {
    await act(async () => root.unmount())
    container.remove()
  }
  delete (globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT
})

it('keeps the Users nav link current while searching or paging', async () => {
  Object.assign(globalThis, { IS_REACT_ACT_ENVIRONMENT: true })
  vi.mocked(listUsers).mockResolvedValue({ users: [], total: 0 } as never)
  for (const entry of ['/admin/users', '/admin/users?search=ann', '/admin/users?offset=25']) {
    const rootRoute = createRootRoute({ component: Outlet })
    const admin = createRoute({ getParentRoute: () => rootRoute, path: '/admin', beforeLoad: () => ({ staff: { id: 'staff' } }), component: adminRoute.options.component })
    const users = createRoute({ getParentRoute: (() => admin) as never, path: '/users' as never, validateSearch: usersRoute.options.validateSearch, loaderDeps: usersRoute.options.loaderDeps, loader: usersRoute.options.loader as never, component: usersRoute.options.component })
    const router = createRouter({ routeTree: rootRoute.addChildren([admin.addChildren([users as never])]), history: createMemoryHistory({ initialEntries: [entry] }) })
    const container = document.createElement('div')
    document.body.appendChild(container)
    const root = createRoot(container)
    try {
      await act(async () => { await router.load(); root.render(<RouterProvider router={router} />) })
      const link = [...container.querySelectorAll('nav[aria-label="Staff"] a')].find((a) => a.textContent === 'Users')!
      expect(link.getAttribute('aria-current'), entry).toBe('page')
      expect(link.className, entry).toContain('bg-brand-tint')
    } finally {
      await act(async () => root.unmount())
      container.remove()
    }
  }
  delete (globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT
})
