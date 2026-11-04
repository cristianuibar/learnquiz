// @vitest-environment happy-dom
import { act } from 'react'
import { createRoot } from 'react-dom/client'
import { createMemoryHistory, createRootRoute, createRoute, createRouter, Outlet, RouterProvider } from '@tanstack/react-router'
import { afterEach, beforeEach, expect, it, vi } from 'vitest'
import { Route as usageRoute } from '@/routes/admin.usage'
import { getModelUsage } from '@/server/admin-usage'

vi.mock('@/server/admin-usage', () => ({ getModelUsage: vi.fn() }))
vi.mock('@/server/admin', () => ({ getStaffSession: vi.fn() }))

const stats = { p50: 1200, p95: 4800, unpriced: 0 }
const usage = {
  from: '2026-10-05', to: '2026-11-03', asOf: Date.UTC(2026, 10, 3, 10, 42), days: [],
  totals: { calls: 1500, failures: 30, p50: 1500, p95: 6800, cost: 412.654, unpriced: 2 },
  jobs: [
    { purpose: 'items', model: 'accounts/fireworks/models/muse-spark-1.3', calls: 1000, failures: 10, cost: 300, ...stats },
    { purpose: 'mystery', model: 'weird-model-9', calls: 500, failures: 20, cost: null, ...stats },
  ],
  companies: [
    { orgId: 'o1', name: 'Northwind Logistics', slug: 'northwind', calls: 200, failures: 5, cost: 100, ...stats },
    { orgId: 'o2', name: 'Tallis Hotels', slug: 'tallis', calls: 900, failures: 5, cost: 50, ...stats },
    { orgId: null, name: null, slug: null, calls: 400, failures: 20, cost: 10, ...stats },
  ],
  failures: [{ id: 'f1', createdAt: Date.UTC(2026, 10, 3, 10, 41, 7), purpose: 'items', model: 'muse-spark-1.3', orgId: 'o1', name: 'Northwind Logistics', slug: 'northwind', error: 'timeout after 60 s' }],
}

beforeEach(() => {
  vi.useFakeTimers({ toFake: ['Date'] })
  vi.setSystemTime(Date.UTC(2026, 10, 3, 10, 42))
  vi.mocked(getModelUsage).mockReset()
  vi.mocked(getModelUsage).mockResolvedValue(usage as never)
  Object.assign(globalThis, { IS_REACT_ACT_ENVIRONMENT: true })
})
afterEach(() => {
  vi.useRealTimers()
  delete (globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT
})

async function mount(entry = '/admin/usage') {
  const rootRoute = createRootRoute({ component: Outlet })
  const route = createRoute({ getParentRoute: (() => rootRoute) as never, path: '/admin/usage' as never, validateSearch: usageRoute.options.validateSearch, loaderDeps: usageRoute.options.loaderDeps, loader: usageRoute.options.loader as never, component: usageRoute.options.component })
  const router = createRouter({ routeTree: rootRoute.addChildren([route as never]), history: createMemoryHistory({ initialEntries: [entry] }) })
  const container = document.createElement('div')
  document.body.appendChild(container)
  const root = createRoot(container)
  await act(async () => { await router.load(); root.render(<RouterProvider router={router} />) })
  return { container, unmount: async () => { await act(async () => root.unmount()); container.remove() } }
}

const button = (c: HTMLElement, name: string) => [...c.querySelectorAll('button')].find((b) => b.textContent!.includes(name))!

it('loads the last 30 days and shows jobs with display names', async () => {
  const { container, unmount } = await mount()
  try {
    expect(getModelUsage).toHaveBeenCalledWith({ data: { from: '2026-10-05', to: '2026-11-03' } })
    expect(container.querySelector('h1')!.textContent).toBe('Model usage')
    expect(container.textContent).toContain('Oct 5 – Nov 3, 2026 · Nov 3 to 10:42 · times in UTC')
    const jobs = container.querySelectorAll('table')[0]
    expect(jobs.textContent).toContain('Questions')
    expect(jobs.textContent).toContain('Muse Spark')
    expect(jobs.textContent).toContain('mystery')
    expect(jobs.textContent).toContain('weird-model-9')
    expect(container.textContent!.toLowerCase()).not.toContain('llama')
    expect(container.textContent).toContain('2 calls have no price yet')
    expect(container.textContent).toContain('$412.65')
  } finally { await unmount() }
})

it('switches to 7 days, keeping focus on the pressed control', async () => {
  const { container, unmount } = await mount()
  try {
    expect(button(container, '30 days').getAttribute('aria-pressed')).toBe('true')
    const seven = button(container, '7 days')
    seven.focus()
    await act(async () => { seven.click() })
    expect(getModelUsage).toHaveBeenLastCalledWith({ data: { from: '2026-10-28', to: '2026-11-03' } })
    expect(button(container, '7 days').getAttribute('aria-pressed')).toBe('true')
    expect(button(container, '30 days').getAttribute('aria-pressed')).toBe('false')
    expect(document.activeElement).toBe(button(container, '7 days'))
  } finally { await unmount() }
})

it('sorts the company table and shows totals', async () => {
  const { container, unmount } = await mount()
  try {
    const table = container.querySelectorAll('table')[1]
    const header = (name: string) => [...table.querySelectorAll('th[scope="col"]')].find((h) => h.textContent === name)!
    const names = () => [...table.querySelectorAll('tbody tr')].map((r) => r.querySelector('td')!.textContent)
    expect(header('Cost').getAttribute('aria-sort')).toBe('descending')
    expect(names()).toEqual(['Northwind Logistics', 'Tallis Hotels', 'No company'])
    await act(async () => { header('Calls').querySelector('button')!.click() })
    expect(header('Calls').getAttribute('aria-sort')).toBe('descending')
    expect(header('Cost').getAttribute('aria-sort')).toBeNull()
    expect(names()).toEqual(['Tallis Hotels', 'No company', 'Northwind Logistics'])
    const foot = table.querySelector('tfoot tr')!
    expect(foot.querySelector('th')!.textContent).toBe('All companies')
    expect(foot.textContent).toContain('1,500')
  } finally { await unmount() }
})
