// @vitest-environment happy-dom
import { act } from 'react'
import { createRoot } from 'react-dom/client'
import { createMemoryHistory, createRootRoute, createRoute, createRouter, Outlet, RouterProvider } from '@tanstack/react-router'
import { expect, it, vi } from 'vitest'
import { Route as adminRoute } from '@/routes/admin'
import { Route as companiesRoute } from '@/routes/admin.companies'
import { getCompanies } from '@/server/admin-companies'

vi.mock('@/server/admin', () => ({ getStaffSession: vi.fn() }))
vi.mock('@/server/admin-companies', () => ({ getCompanies: vi.fn() }))

const seed = [
  { id: 'c1', name: 'Acme', slug: 'acme-co', members: 5, roles: 2, documents: 3, activeLearners: 4, modelSpend: 10 },
  { id: 'c2', name: 'Birch', slug: 'birch-cafe', members: 9, roles: 1, documents: 1, activeLearners: 2, modelSpend: 148.2 },
  { id: 'c3', name: 'Cedar', slug: 'cedar-bar', members: 2, roles: 4, documents: 6, activeLearners: 7, modelSpend: 55 },
]

async function mount(component = companiesRoute.options.component) {
  Object.assign(globalThis, { IS_REACT_ACT_ENVIRONMENT: true })
  vi.mocked(getCompanies).mockResolvedValue(seed as never)
  const rootRoute = createRootRoute({ component: Outlet })
  const shell = createRoute({
    getParentRoute: () => rootRoute,
    path: '/admin',
    beforeLoad: () => ({ staff: { id: 's', name: 'Ana Popescu', email: 'ana@learnquiz.test', failedJobs: 0 } }),
    component: adminRoute.options.component,
  })
  const route = createRoute({ getParentRoute: (() => shell) as never, path: '/companies' as never, loader: companiesRoute.options.loader as never, component })
  const router = createRouter({ routeTree: rootRoute.addChildren([shell.addChildren([route as never])]), history: createMemoryHistory({ initialEntries: ['/admin/companies'] }) })
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

it('keeps the 44px link and menu targets off the row height so loaded rows match the 56px skeleton', async () => {
  const { container, cleanup } = await mount()
  try {
    const link = container.querySelector('tbody a') as HTMLAnchorElement
    const cls = [...link.classList]
    expect([cls.some((c) => c.startsWith('min-h-')), link.classList.contains('relative'), link.classList.contains('before:-inset-y-3')]).toEqual([false, true, true])
    const menu = container.querySelector('tbody button[aria-label="More actions for Birch"]') as HTMLButtonElement
    // The size-11 button sits in a wrapper that pulls it into the cell's py-2.5 padding.
    expect([menu.classList.contains('size-11'), menu.closest('td > div')?.classList.contains('-my-1.5')]).toEqual([true, true])
  } finally {
    await cleanup()
  }
})

it('fills the admin shell content column on the loaded and loading pages instead of nesting its own padding or a width cap', async () => {
  for (const component of [companiesRoute.options.component, companiesRoute.options.pendingComponent]) {
    const { container, cleanup } = await mount(component)
    try {
      // At 1440 a max-w-[1120px] shell or md:p-8 here left the table a centered frame of about 1088 or 1024 instead of the full column.
      const main = container.querySelector('main') as HTMLElement
      expect([...main.classList].filter((c) => /^(md:)?p[xy]?-/.test(c))).toEqual(['p-0', 'md:p-0'])
      const frames: string[] = []
      for (let el: HTMLElement | null = main; el && el !== container; el = el.parentElement) frames.push(...[...el.classList].filter((c) => /^(mx-auto|max-w-)/.test(c)))
      expect(frames).toEqual([])
    } finally {
      await cleanup()
    }
  }
})
