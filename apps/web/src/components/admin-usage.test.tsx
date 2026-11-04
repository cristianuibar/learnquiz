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
// 30 days, 2026-10-05..2026-11-03: Oct 8 has no calls, Oct 9 carries its share, Nov 3 is partial.
const dayList = Array.from({ length: 30 }, (_, i) => new Date(Date.UTC(2026, 9, 5 + i)).toISOString().slice(0, 10))
const days = dayList.map((day, i) => {
  const calls = i === 3 ? 0 : i === 4 ? 100 : 50
  return { day, partial: i === 29, calls, failures: i === 3 ? 0 : i === 4 ? 2 : 1, cost: calls ? 13.75 : 0, p50: calls ? 1500 : null, p95: calls ? 6800 : null, unpriced: 0 }
})
const latencyOf = (p50: number, p95: number) => ({ total: { p50, p95 }, days: days.map(({ day, partial, calls }) => ({ day, partial, p50: calls ? p50 : null, p95: calls ? p95 : null })) })
const usage = {
  from: '2026-10-05', to: '2026-11-03', asOf: Date.UTC(2026, 10, 3, 10, 42), days,
  latency: latencyOf(1500, 6800),
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
  // Echoes the requested range; a job request returns a different latency series (items: p50 2.5 s, p95 9.1 s).
  vi.mocked(getModelUsage).mockImplementation((async ({ data }: { data: { from: string; to: string; job?: string } }) =>
    ({ ...usage, from: data.from, to: data.to, ...(data.job ? { latency: latencyOf(2500, 9100) } : {}) })) as never)
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
  return { container, router, unmount: async () => { await act(async () => root.unmount()); container.remove() } }
}

const button = (c: HTMLElement, name: string) => [...c.querySelectorAll('button')].find((b) => b.textContent!.includes(name))!
const table = (c: HTMLElement, caption: string) => [...c.querySelectorAll('table')].find((t) => t.querySelector('caption')?.textContent!.startsWith(caption))!
const footer = (t: Element) => [...t.querySelectorAll('tfoot th, tfoot td')].map((e) => e.textContent)
const day = (c: HTMLElement, label: string) => [...c.querySelectorAll('[role="dialog"] button')].find((b) => b.getAttribute('aria-label')?.startsWith(label)) as HTMLButtonElement
const trigger = (c: HTMLElement) => c.querySelector('[aria-haspopup="dialog"]') as HTMLButtonElement
const click = (el: Element) => act(async () => { (el as HTMLElement).click() })
const CALLS = 'Calls, failures and failure rate by day'

it('loads the last 30 days and shows jobs with display names', async () => {
  const { container, unmount } = await mount()
  try {
    expect(getModelUsage).toHaveBeenCalledWith({ data: { from: '2026-10-05', to: '2026-11-03' } })
    expect(container.querySelector('h1')!.textContent).toBe('Model usage')
    expect(container.textContent).toContain('Oct 5 – Nov 3, 2026 · Nov 3 to 10:42 · times in UTC')
    const jobs = table(container, 'Model calls, failures, latency and cost by job')
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
    const companies = table(container, 'Model calls, failures, p95 latency and cost by company')
    const header = (name: string) => [...companies.querySelectorAll('th[scope="col"]')].find((h) => h.textContent === name)!
    const names = () => [...companies.querySelectorAll('tbody tr')].map((r) => r.querySelector('td')!.textContent)
    expect(header('Cost').getAttribute('aria-sort')).toBe('descending')
    expect(names()).toEqual(['Northwind Logistics', 'Tallis Hotels', 'No company'])
    await act(async () => { header('Calls').querySelector('button')!.click() })
    expect(header('Calls').getAttribute('aria-sort')).toBe('descending')
    expect(header('Cost').getAttribute('aria-sort')).toBeNull()
    expect(names()).toEqual(['Tallis Hotels', 'No company', 'Northwind Logistics'])
    const foot = companies.querySelector('tfoot tr')!
    expect(foot.querySelector('th')!.textContent).toBe('All companies')
    expect(foot.textContent).toContain('1,500')
  } finally { await unmount() }
})

it('applies a custom range from the date picker and clears it with a preset', async () => {
  const { container, unmount } = await mount()
  try {
    await click(trigger(container))
    await click(day(container, 'October 10, 2026'))
    await click(day(container, 'October 20, 2026'))
    await click(button(container, 'Apply'))
    expect(getModelUsage).toHaveBeenLastCalledWith({ data: { from: '2026-10-10', to: '2026-10-20' } })
    expect(container.textContent).toContain('Oct 10 – Oct 20, 2026')
    expect(container.querySelector('[role="dialog"]')).toBeNull()
    expect(document.activeElement).toBe(trigger(container))
    for (const name of ['7 days', '30 days', '90 days']) expect(button(container, name).getAttribute('aria-pressed')).toBe('false')

    await click(button(container, '30 days'))
    expect(getModelUsage).toHaveBeenLastCalledWith({ data: { from: '2026-10-05', to: '2026-11-03' } })
    expect(button(container, '30 days').getAttribute('aria-pressed')).toBe('true')

    // Esc closes the picker without applying and returns focus to the trigger.
    await click(trigger(container))
    expect(container.querySelector('[role="dialog"]')).not.toBeNull()
    await act(async () => { document.activeElement!.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true })) })
    expect(container.querySelector('[role="dialog"]')).toBeNull()
    expect(document.activeElement).toBe(trigger(container))
    expect(getModelUsage).toHaveBeenCalledTimes(3)
  } finally { await unmount() }
})

it('falls back to 30 days for over-long and invalid ranges in the URL', async () => {
  for (const entry of ['/admin/usage?from=2025-01-01&to=2026-11-03', '/admin/usage?from=2026-13-45&to=2026-11-03', '/admin/usage?from=2026-10-20&to=2026-10-10']) {
    vi.mocked(getModelUsage).mockClear()
    const { container, unmount } = await mount(entry)
    try {
      expect(getModelUsage).toHaveBeenCalledTimes(1)
      expect(getModelUsage).toHaveBeenCalledWith({ data: { from: '2026-10-05', to: '2026-11-03' } })
      expect(button(container, '30 days').getAttribute('aria-pressed')).toBe('true')
    } finally { await unmount() }
  }
})

it('shows chart tables whose totals match the figures', async () => {
  const { container, unmount } = await mount()
  try {
    expect(footer(table(container, CALLS))).toEqual(['30 days', '1,500', '30', '2.0%'])
    expect(table(container, CALLS).querySelectorAll('tbody tr')).toHaveLength(30)
    expect(footer(table(container, 'Cost by day'))).toEqual(['30 days', '$412.65'])
    expect(footer(table(container, 'Latency by day'))).toEqual(['30 days', '1.5 s', '6.8 s'])
    const text = container.textContent!
    expect(text).toMatch(/Calls1,500/)
    expect(text).toMatch(/Failures30/)
    expect(text).toMatch(/Latency p95\s*6\.8\s*s/)
    expect(text).toContain('$412.65')
    const zero = [...table(container, 'Latency by day').querySelectorAll('tbody tr')][3]
    expect([...zero.children].map((c) => c.textContent)).toEqual(['Oct 8', 'No calls', 'No calls'])
    const charts = container.querySelectorAll('svg[role="img"]')
    expect(charts).toHaveLength(3)
    for (const svg of charts) expect(svg.getAttribute('aria-label')!.length).toBeGreaterThan(20)
  } finally { await unmount() }
})

it('filters the latency chart by job without touching the other figures', async () => {
  const { container, unmount } = await mount()
  try {
    const callsBefore = table(container, CALLS).textContent
    const select = container.querySelector('select')!
    expect([...select.options].map((o) => o.value)).toEqual(['', 'items', 'mystery'])
    select.focus()
    await act(async () => { select.value = 'items'; select.dispatchEvent(new Event('change', { bubbles: true })) })
    expect(getModelUsage).toHaveBeenLastCalledWith({ data: { from: '2026-10-05', to: '2026-11-03', job: 'items' } })
    const latency = table(container, 'Latency by day')
    expect(latency.querySelector('caption')!.textContent).toContain('Questions')
    expect(footer(latency)).toEqual(['30 days', '2.5 s', '9.1 s'])
    expect([...latency.querySelectorAll('tbody tr')][0].textContent).toBe('Oct 52.5 s9.1 s')
    expect(table(container, CALLS).textContent).toBe(callsBefore)
    expect(container.textContent).toContain('$412.65')
    expect(document.activeElement).toBe(container.querySelector('select'))

    await act(async () => { select.value = ''; select.dispatchEvent(new Event('change', { bubbles: true })) })
    expect(footer(table(container, 'Latency by day'))).toEqual(['30 days', '1.5 s', '6.8 s'])
  } finally { await unmount() }
})

it('keeps the latency labels on the shown series when a job request fails', async () => {
  const { container, unmount } = await mount()
  try {
    vi.mocked(getModelUsage).mockRejectedValueOnce(new Error('Usage is unavailable'))
    const select = container.querySelector('select')!
    await act(async () => { select.value = 'items'; select.dispatchEvent(new Event('change', { bubbles: true })) })
    const latency = table(container, 'Latency by day')
    expect(footer(latency)).toEqual(['30 days', '1.5 s', '6.8 s'])
    expect(latency.querySelector('caption')!.textContent).not.toContain('Questions')
    expect(container.querySelector('svg[aria-label^="Line chart"]')!.getAttribute('aria-label')).toContain('latency for all jobs')
    expect(container.textContent).toContain('Usage is unavailable')

    await click(button(container, 'Try again'))
    expect(getModelUsage).toHaveBeenLastCalledWith({ data: { from: '2026-10-05', to: '2026-11-03', job: 'items' } })
    expect(table(container, 'Latency by day').querySelector('caption')!.textContent).toContain('Questions')
    expect(footer(table(container, 'Latency by day'))).toEqual(['30 days', '2.5 s', '9.1 s'])
    expect(container.textContent).not.toContain('Usage is unavailable')
  } finally { await unmount() }
})

it('starts the failures on page 1 when Back returns to a shorter range', async () => {
  // 7 days have 10 failures, 90 days have 30.
  const failure = usage.failures[0]
  vi.mocked(getModelUsage).mockImplementation((async ({ data }: { data: { from: string; to: string } }) =>
    ({ ...usage, from: data.from, to: data.to, failures: Array.from({ length: data.from === '2026-10-28' ? 10 : 30 }, (_, i) => ({ ...failure, id: `f${i}` })) })) as never)
  const { container, router, unmount } = await mount('/admin/usage?range=7')
  try {
    const failures = () => container.querySelector('section[aria-labelledby="usage-failures"]') as HTMLElement
    await click(button(container, '90 days'))
    await click(button(failures(), 'Next'))
    expect(failures().querySelectorAll('tbody tr')).toHaveLength(5)
    await act(async () => { router.history.back(); await router.load() })
    expect(button(container, '7 days').getAttribute('aria-pressed')).toBe('true')
    expect(failures().querySelectorAll('tbody tr')).toHaveLength(10)
    expect(failures().querySelector('[role="status"]')!.textContent).toBe('1–10 of 10 failures')
  } finally { await unmount() }
})
