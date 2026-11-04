// @vitest-environment happy-dom
import { act } from 'react'
import { createRoot } from 'react-dom/client'
import { createMemoryHistory, createRootRoute, createRoute, createRouter, Outlet, RouterProvider } from '@tanstack/react-router'
import { expect, it, vi } from 'vitest'
import { Route as companiesRoute } from '@/routes/admin.companies'
import { getCompanies } from '@/server/admin-companies'

vi.mock('@/server/admin-companies', () => ({ getCompanies: vi.fn() }))

const seed = [
  { id: 'c1', name: 'Acme', slug: 'acme-co', members: 5, roles: 2, documents: 3, activeLearners: 4, modelSpend: 10 },
  { id: 'c2', name: 'Birch', slug: 'birch-cafe', members: 9, roles: 1, documents: 1, activeLearners: 2, modelSpend: 148.2 },
  { id: 'c3', name: 'Cedar', slug: 'cedar-bar', members: 2, roles: 4, documents: 6, activeLearners: 7, modelSpend: 55 },
]

async function mount() {
  Object.assign(globalThis, { IS_REACT_ACT_ENVIRONMENT: true })
  vi.mocked(getCompanies).mockResolvedValue(seed as never)
  const rootRoute = createRootRoute({ component: Outlet })
  const route = createRoute({ getParentRoute: (() => rootRoute) as never, path: '/admin/companies' as never, loader: companiesRoute.options.loader as never, component: companiesRoute.options.component })
  const router = createRouter({ routeTree: rootRoute.addChildren([route as never]), history: createMemoryHistory({ initialEntries: ['/admin/companies'] }) })
  const container = document.createElement('div')
  document.body.appendChild(container)
  const root = createRoot(container)
  await act(async () => { await router.load(); root.render(<RouterProvider router={router} />) })
  const cleanup = async () => {
    await act(async () => root.unmount())
    container.remove()
    delete (globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT
  }
  return { container, cleanup }
}

const names = (c: HTMLElement) => Array.from(c.querySelectorAll('tbody tr')).map((r) => r.querySelector('a')?.textContent)

it('sorts by model spend by default and re-sorts from the column buttons', async () => {
  const { container, cleanup } = await mount()
  try {
    expect(names(container)).toEqual(['Birch', 'Cedar', 'Acme'])
    const sorted = () => Array.from(container.querySelectorAll('th[aria-sort]')).map((th) => [th.textContent, th.getAttribute('aria-sort')])
    expect(sorted()).toEqual([['Model spend', 'descending']])
    const members = () => Array.from(container.querySelectorAll('th button')).find((b) => b.textContent === 'Members') as HTMLButtonElement
    await act(async () => members().click())
    expect(sorted()).toEqual([['Members', 'descending']])
    expect(names(container)).toEqual(['Birch', 'Acme', 'Cedar'])
    await act(async () => members().click())
    expect(sorted()).toEqual([['Members', 'ascending']])
    expect(names(container)).toEqual(['Cedar', 'Acme', 'Birch'])
  } finally {
    await cleanup()
  }
})

it('filters by name or slug and clears the search', async () => {
  const { container, cleanup } = await mount()
  try {
    const input = container.querySelector('input[type="search"]') as HTMLInputElement
    const type = async (value: string) => {
      await act(async () => {
        Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value')!.set!.call(input, value)
        input.dispatchEvent(new Event('input', { bubbles: true }))
      })
      await act(async () => { await new Promise((r) => setTimeout(r, 250)) })
    }
    await type('cedar-b')
    expect(names(container)).toEqual(['Cedar'])
    expect(container.textContent).toContain('1 company')
    await type('zzz')
    expect(container.textContent).toContain('No companies match')
    const clear = Array.from(container.querySelectorAll('button')).find((b) => b.textContent === 'Clear search') as HTMLButtonElement
    await act(async () => clear.click())
    await act(async () => { await new Promise((r) => setTimeout(r, 250)) })
    expect(names(container)).toHaveLength(3)
    expect(document.activeElement).toBe(input)
  } finally {
    await cleanup()
  }
})
