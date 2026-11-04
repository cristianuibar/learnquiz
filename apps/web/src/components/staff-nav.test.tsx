// @vitest-environment happy-dom
import { act } from 'react'
import { createRoot } from 'react-dom/client'
import { createMemoryHistory, createRootRoute, createRoute, createRouter, Outlet, RouterProvider } from '@tanstack/react-router'
import { expect, it, vi } from 'vitest'
import { Route as adminRoute } from '@/routes/admin'

vi.mock('@/server/admin', () => ({ getStaffSession: vi.fn() }))

const user = { id: 'u1', name: 'Dana Whitaker', email: 'dana@northwind.example', isAnonymous: false }

async function mount(admin: { beforeLoad: () => unknown; errorComponent?: unknown }, adminCompanies: { name: string; slug: string }[] = []) {
  Object.assign(globalThis, { IS_REACT_ACT_ENVIRONMENT: true })
  const rootRoute = createRootRoute({ component: Outlet, beforeLoad: () => ({ user, adminCompanies }) })
  const route = createRoute({ getParentRoute: () => rootRoute, path: '/admin' as never, beforeLoad: admin.beforeLoad as never, component: adminRoute.options.component, errorComponent: admin.errorComponent as never })
  const jobs = createRoute({ getParentRoute: (() => route) as never, path: '/jobs' as never, component: () => <p>Jobs page</p> })
  const router = createRouter({ routeTree: rootRoute.addChildren([route.addChildren([jobs as never]) as never]), history: createMemoryHistory({ initialEntries: ['/admin/jobs'] }) })
  const container = document.createElement('div')
  document.body.appendChild(container)
  const root = createRoot(container)
  await act(async () => { await router.load(); root.render(<RouterProvider router={router} />) })
  return {
    container,
    done: async () => {
      await act(async () => root.unmount())
      container.remove()
      delete (globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT
    },
  }
}

it('shows the failed generation job count only when there are failures', async () => {
  for (const [failedJobs, text] of [[3, 'Generation jobs3 failed'], [0, 'Generation jobs']] as const) {
    const { container, done } = await mount({ beforeLoad: () => ({ staff: { id: 's', name: 'Ana Popescu', email: 'ana@learnquiz.test', failedJobs } }) })
    try {
      const link = [...container.querySelectorAll('nav[aria-label="Staff admin"] a')].find((a) => a.textContent!.startsWith('Generation jobs'))!
      expect(link.textContent, String(failedJobs)).toBe(text)
    } finally {
      await done()
    }
  }
})

it('shows the no-access page on a 403 and links to the first portal or Today', async () => {
  const companies = [{ name: 'Northwind', slug: 'northwind' }, { name: 'Contoso', slug: 'contoso' }]
  for (const [adminCompanies, href] of [[companies, '/org/northwind'], [[], '/today']] as const) {
    const { container, done } = await mount(
      { beforeLoad: () => { throw Object.assign(new Error('Forbidden'), { status: 403 }) }, errorComponent: adminRoute.options.errorComponent },
      [...adminCompanies],
    )
    try {
      expect(container.querySelector('h1')!.textContent).toBe('No access to the staff admin')
      expect(container.querySelector('strong')!.textContent).toBe(user.email)
      expect([...container.querySelectorAll('a')].find((a) => a.textContent === 'Go to your portal')!.getAttribute('href')).toBe(href)
      expect(container.querySelector('nav')).toBeNull()
    } finally {
      await done()
    }
  }
})
