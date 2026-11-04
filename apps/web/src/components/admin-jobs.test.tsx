// @vitest-environment happy-dom
import { act } from 'react'
import { createRoot } from 'react-dom/client'
import { createMemoryHistory, createRootRoute, createRoute, createRouter, Outlet, RouterProvider } from '@tanstack/react-router'
import { afterEach, beforeEach, expect, it, vi } from 'vitest'
import { Route as jobsRoute } from '@/routes/admin.jobs'
import { getGenerationJobs, retryJobs, type JobRow } from '@/server/admin-jobs'

vi.mock('@/server/admin-jobs', () => ({ JOB_FILTERS: ['notReady', 'failed', 'generating', 'pending', 'ready'], JOB_PAGE_SIZE: 25, getGenerationJobs: vi.fn(), retryJobs: vi.fn() }))

const T0 = Date.UTC(2026, 10, 4, 10, 40, 0)
const rows: JobRow[] = [
  { id: 'c1', kind: 'concept', company: 'Northwind Logistics', role: 'Forklift operator', target: 'Battery change procedure', state: 'failed', startedAt: T0, error: 'Model call timed out' },
  { id: 'c2', kind: 'concept', company: 'Tallis Hotels', role: 'Front desk agent', target: 'Late check-out requests', state: 'failed', startedAt: T0, error: 'Invalid JSON from model' },
  { id: 'c3', kind: 'curriculum', company: 'Tallis Hotels', role: 'Night auditor', target: 'Night auditor curriculum', state: 'generating', startedAt: T0 + 60_000, error: null },
  { id: 'c4', kind: 'concept', company: 'Northwind Logistics', role: null, target: 'Pallet stacking limits', state: 'pending', startedAt: null, error: null },
]
const page = (counts = { failed: 3, generating: 1, pending: 1, ready: 389 }) => ({ counts, total: rows.length, rows, updatedAt: T0 + 120_000 })

beforeEach(() => {
  Object.assign(globalThis, { IS_REACT_ACT_ENVIRONMENT: true })
  vi.mocked(getGenerationJobs).mockReset().mockResolvedValue(page())
  vi.mocked(retryJobs).mockReset()
})
afterEach(() => { delete (globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT })

async function mount() {
  const rootRoute = createRootRoute({ component: Outlet })
  const jobs = createRoute({ getParentRoute: (() => rootRoute) as never, path: '/admin/jobs' as never, validateSearch: jobsRoute.options.validateSearch, loaderDeps: jobsRoute.options.loaderDeps, loader: jobsRoute.options.loader as never, component: jobsRoute.options.component })
  const router = createRouter({ routeTree: rootRoute.addChildren([jobs as never]), history: createMemoryHistory({ initialEntries: ['/admin/jobs'] }) })
  const container = document.createElement('div')
  document.body.appendChild(container)
  const root = createRoot(container)
  await act(async () => { await router.load(); root.render(<RouterProvider router={router} />) })
  return { container, unmount: async () => { await act(async () => root.unmount()); container.remove() } }
}

const box = (c: HTMLElement, name: string) => c.querySelector<HTMLInputElement>(`input[aria-label="${name}"]`)!
const button = (c: HTMLElement, text: string) => [...c.querySelectorAll('button')].find((b) => b.textContent === text)!
const click = (el: Element) => act(async () => { (el as HTMLElement).click() })
const status = (c: HTMLElement) => c.querySelector('p[role="status"].sr-only')!.textContent

it('retries the selected failed jobs, then confirms in a focused banner', async () => {
  const { container, unmount } = await mount()
  try {
    vi.mocked(retryJobs).mockRejectedValueOnce(new Error('Server unavailable'))
    await click(box(container, 'Select Battery change procedure, Northwind Logistics'))
    await click(box(container, 'Select Late check-out requests, Tallis Hotels'))
    await click(button(container, 'Retry 2 jobs'))
    expect(container.querySelector('[role="alert"]')!.textContent).toContain('Server unavailable')
    expect(box(container, 'Select Battery change procedure, Northwind Logistics').checked).toBe(true)
    expect(box(container, 'Select Late check-out requests, Tallis Hotels').checked).toBe(true)

    vi.mocked(retryJobs).mockResolvedValueOnce({ queued: 2, skipped: 0 })
    await click(button(container, 'Retry 2 jobs'))
    expect(retryJobs).toHaveBeenLastCalledWith({ data: { ids: ['c1', 'c2'] } })
    const banner = [...container.querySelectorAll('[role="status"]')].find((e) => e.textContent?.includes('queued again'))!
    expect(banner.textContent).toContain('2 jobs queued again.')
    expect(document.activeElement).toBe(banner)
    expect(container.querySelectorAll('input[type="checkbox"]:checked')).toHaveLength(0)
  } finally {
    await unmount()
  }
})

it('polls every 5 s only while nothing is selected and updates are not paused', async () => {
  vi.useFakeTimers({ toFake: ['setInterval', 'clearInterval'] })
  const { container, unmount } = await mount()
  try {
    const calls = () => vi.mocked(getGenerationJobs).mock.calls.length
    const advance = (ms: number) => act(async () => { await vi.advanceTimersByTimeAsync(ms) })
    let n = calls()
    await advance(5000)
    expect(calls()).toBeGreaterThan(n)

    await click(box(container, 'Select Battery change procedure, Northwind Logistics'))
    n = calls()
    await advance(10_000)
    expect(calls()).toBe(n)

    await click(button(container, 'Clear selection'))
    await act(async () => { container.querySelector<HTMLElement>('input:focus')?.blur() })
    const pause = button(container, 'Pause updates')
    await click(pause)
    expect(pause.getAttribute('aria-pressed')).toBe('true')
    n = calls()
    await advance(10_000)
    expect(calls()).toBe(n)

    await click(pause)
    await advance(5000)
    expect(calls()).toBeGreaterThan(n)
  } finally {
    await unmount()
    vi.useRealTimers()
  }
})

it('announces counts only when they change', async () => {
  vi.useFakeTimers({ toFake: ['setInterval', 'clearInterval'] })
  const { container, unmount } = await mount()
  try {
    const advance = () => act(async () => { await vi.advanceTimersByTimeAsync(5000) })
    expect(status(container)).toBe('3 failed, 1 generating, 1 pending, 389 ready.')
    await advance()
    expect(status(container)).toBe('3 failed, 1 generating, 1 pending, 389 ready.')
    vi.mocked(getGenerationJobs).mockResolvedValue(page({ failed: 2, generating: 2, pending: 1, ready: 389 }))
    await advance()
    expect(status(container)).toBe('2 failed, 2 generating, 1 pending, 389 ready.')
  } finally {
    await unmount()
    vi.useRealTimers()
  }
})
