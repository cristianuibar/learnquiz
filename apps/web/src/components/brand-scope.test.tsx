// @vitest-environment happy-dom
import { act } from 'react'
import { createRoot } from 'react-dom/client'
import { createMemoryHistory, createRoute, createRouter, RouterProvider } from '@tanstack/react-router'
import { expect, it, vi } from 'vitest'
import { Route as appRoot } from '@/routes/__root'

vi.mock('@/server/session-fn', () => ({ getSessionFn: vi.fn(async () => ({ user: { id: 'u1', isAnonymous: false }, needsDisclosure: false })) }))
vi.mock('@/server/latest-topic', () => ({ getLatestTopicIdFn: vi.fn(async () => null) }))
vi.mock('@/server/org-settings', () => ({ getCompanyBranding: vi.fn(async () => ({ name: 'Acme', logoUrl: null, accent: '#5B2A6E' })) }))
vi.mock('@tanstack/react-devtools', () => ({ TanStackDevtools: () => null }))

it('applies the company accent on learner routes only, across client navigation', async () => {
  Object.assign(globalThis, { IS_REACT_ACT_ENVIRONMENT: true })
  const page = (path: string) => createRoute({ getParentRoute: () => appRoot, path, component: () => <h1>{path}</h1> })
  const router = createRouter({
    routeTree: appRoot.addChildren([page('/today'), page('/org/$slug'), page('/org/$slug/settings'), page('/admin/companies/$slug/portal')]),
    history: createMemoryHistory({ initialEntries: ['/org/acme'] }),
  })
  const brand = () => {
    const color = getComputedStyle(document.documentElement).getPropertyValue('--brand').trim()
    expect(document.querySelector('meta[name="theme-color"]')?.getAttribute('content')).toBe(color || '#0E5A73')
    return color
  }
  const root = createRoot(document)
  try {
    // Direct load of the portal: no accent override.
    await act(async () => { await router.load(); root.render(<RouterProvider router={router} />) })
    expect(document.querySelector('h1')?.textContent).toBe('/org/$slug')
    expect(brand()).toBe('')

    await act(async () => { await router.navigate({ to: '/today' }) })
    expect(brand()).toBe('#5B2A6E')

    for (const to of ['/org/acme/settings', '/admin/companies/acme/portal']) {
      await act(async () => { await router.navigate({ to }) })
      expect(brand()).toBe('')
      await act(async () => { await router.navigate({ to: '/today' }) })
      expect(brand()).toBe('#5B2A6E')
    }
  } finally {
    await act(async () => root.unmount())
    delete (globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT
  }
})
