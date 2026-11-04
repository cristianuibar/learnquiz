// @vitest-environment happy-dom
import { act } from 'react'
import { createRoot } from 'react-dom/client'
import { createMemoryHistory, createRootRoute, createRoute, createRouter, Outlet, RouterProvider } from '@tanstack/react-router'
import { expect, it, vi } from 'vitest'
import { Route as companyRoute } from '@/routes/admin.companies_.$slug'
import { getCompany } from '@/server/admin'

vi.mock('@/server/admin', () => ({ getCompany: vi.fn() }))

it('uses the singular for a one-day onboarding period on the company page', async () => {
  Object.assign(globalThis, { IS_REACT_ACT_ENVIRONMENT: true })
  for (const [onboardingDays, text] of [[1, 'mastery in 1 day'], [2, 'mastery in 2 days'], [30, 'mastery in 30 days']] as const) {
    const role = { id: 'r1', name: 'Barista', status: 'active', topicStatus: 'ready', benchmark: 0.8, onboardingDays }
    vi.mocked(getCompany).mockResolvedValue({ name: 'Acme', slug: 'acme', activeLearners: 0, modelSpend: 0, members: [], roles: [role], documents: [] } as never)
    const rootRoute = createRootRoute({ component: Outlet })
    const company = createRoute({ getParentRoute: (() => rootRoute) as never, path: '/admin/companies/$slug' as never, loader: companyRoute.options.loader as never, component: companyRoute.options.component })
    const router = createRouter({ routeTree: rootRoute.addChildren([company as never]), history: createMemoryHistory({ initialEntries: ['/admin/companies/acme'] }) })
    const container = document.createElement('div')
    document.body.appendChild(container)
    const root = createRoot(container)
    try {
      await act(async () => { await router.load(); root.render(<RouterProvider router={router} />) })
      expect(container.querySelector('li p:last-child')!.textContent).toMatch(new RegExp(`${text}$`))
    } finally {
      await act(async () => root.unmount())
      container.remove()
    }
  }
  delete (globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT
})
