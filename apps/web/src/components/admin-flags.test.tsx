// @vitest-environment happy-dom
import { act } from 'react'
import { createRoot } from 'react-dom/client'
import { createMemoryHistory, createRootRoute, createRoute, createRouter, Outlet, RouterProvider } from '@tanstack/react-router'
import { expect, it, vi } from 'vitest'
import { Route as flagsRoute } from '@/routes/admin.flags'
import { getContentFlags } from '@/server/admin-flags'

vi.mock('@/server/admin-flags', () => ({ getContentFlags: vi.fn() }))
type Row = Awaited<ReturnType<typeof getContentFlags>>['rows'][number]
const NOW = Date.parse('2026-11-02T12:00:00Z')
const base = { id: 'open', itemId: 'item-open', roleId: 'picker', type: 'learner', stem: 'What do you scan first?', company: 'Alpha', slug: 'alpha', unit: 'Scanning', reason: 'wrong', note: 'Answer is off', createdAt: NOW, personName: 'Jordan', resolvedAt: null, retiredAt: null } satisfies Row
const seed: Row[] = [
  base,
  { ...base, id: 'retired', itemId: 'item-retired', type: 'partner', stem: 'Which tape seals a box?', company: 'Beta', slug: 'beta', reason: null, note: null, retiredAt: NOW - 1000, createdAt: NOW - 1000, personName: 'Dana' },
  { ...base, id: 'resolved', itemId: 'item-resolved', stem: 'Where is the label?', resolvedAt: NOW - 86_400_000, createdAt: NOW - 2000 },
  { ...base, id: 'legacy', itemId: 'item-legacy', type: 'partner', stem: 'Old question', personName: null, reason: null, note: null, createdAt: NOW - 3000 },
]

async function mount(rows = seed, initial = '/admin/flags') {
  Object.assign(globalThis, { IS_REACT_ACT_ENVIRONMENT: true })
  vi.mocked(getContentFlags).mockResolvedValue({ rows, companies: [{ name: 'Alpha', slug: 'alpha' }, { name: 'Beta', slug: 'beta' }, { name: 'Empty', slug: 'empty' }], counts: { all: rows.length, learner: 2, partner: 2 } })
  const parent = createRootRoute({ component: Outlet })
  const route = createRoute({ getParentRoute: () => parent, path: '/admin/flags', validateSearch: flagsRoute.options.validateSearch, loader: flagsRoute.options.loader as never, component: flagsRoute.options.component })
  const router = createRouter({ routeTree: parent.addChildren([route as never]), history: createMemoryHistory({ initialEntries: [initial] }) })
  const container = document.createElement('div')
  document.body.appendChild(container)
  const root = createRoot(container)
  await act(async () => { await router.load(); root.render(<RouterProvider router={router} />) })
  const buttons = () => [...container.querySelectorAll<HTMLButtonElement>('button')]
  const click = async (name: string) => { await act(async () => buttons().find((b) => b.textContent?.trim() === name)!.click()) }
  const select = async (id: string, value: string) => {
    await act(async () => { const el = container.querySelector(`#${id}`) as unknown as HTMLSelectElement; el.value = value; el.dispatchEvent(new Event('change', { bubbles: true })) })
  }
  const stems = () => [...container.querySelectorAll('tbody a')].map((a) => a.textContent)
  const status = () => container.querySelector('p[role="status"]')!.textContent
  const cleanup = async () => { await act(async () => root.unmount()); container.remove(); delete (globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT }
  return { container, router, buttons, click, select, stems, status, cleanup }
}

it('shows a read-only list, links exact questions, and combines type, company and status filters in the URL', async () => {
  const ui = await mount()
  try {
    expect(ui.container.querySelector('h1')?.textContent).toBe('Content flags')
    expect(ui.status()).toBe('Showing 4 flags')
    expect(ui.buttons().some((b) => /Resolve|Retire$|Edit/.test(b.textContent ?? ''))).toBe(false)
    expect([...ui.container.querySelectorAll('tbody a')].map((a) => a.getAttribute('href'))).toEqual(seed.map((r) => `/admin/companies/${r.slug}/portal/questions?role=${r.roleId}&item=${r.itemId}`))
    expect(ui.container.textContent).toContain('Resolved Nov 1')
    expect(ui.container.textContent).toContain('Not recorded')
    expect(ui.container.textContent).toContain('No reason recorded')
    await ui.click('Reported by learners 2')
    expect(ui.stems()).toEqual([base.stem, 'Where is the label?'])
    expect(ui.status()).toBe('Showing 2 flags')
    await ui.select('fl-status', 'resolved')
    expect(ui.stems()).toEqual(['Where is the label?'])
    expect(ui.status()).toBe('Showing 1 flags')
    expect(ui.buttons().map((b) => b.textContent?.trim())).toContain('All 3')
    await ui.click('Retired by partners 2')
    expect(ui.stems()).toEqual(['Which tape seals a box?', 'Old question'])
    await ui.select('fl-company', 'beta')
    expect(ui.stems()).toEqual(['Which tape seals a box?'])
    expect(ui.router.state.location.search).toEqual({ type: 'partner', company: 'beta', status: 'resolved' })
    expect(ui.buttons().map((b) => b.textContent?.trim())).toContain('Reported by learners 0')
    await ui.select('fl-status', 'open')
    expect(ui.status()).toBe('Showing 0 flags')
    expect(ui.container.textContent).toContain('No flags match these filters: Retired by partners, Beta, Open.')
    await ui.click('Clear filters')
    expect(ui.status()).toBe('Showing 4 flags')
    expect(ui.router.state.location.search).toEqual({ type: 'all', company: '', status: 'all' })
    expect(document.activeElement).toBe(ui.container.querySelector('#fl-company'))
    await ui.click('When')
    expect(ui.stems()).toEqual(seed.map((r) => r.stem).reverse())
    expect(ui.container.querySelector('th[aria-sort]')?.getAttribute('aria-sort')).toBe('ascending')
  } finally { await ui.cleanup() }
})

it('keeps only the newest 200 after applying bookmarked filters and explains the limit', async () => {
  const rows: Row[] = Array.from({ length: 201 }, (_, i) => ({ ...base, id: `f${i}`, itemId: `q${i}`, stem: `Question ${i}`, createdAt: NOW - i }))
  rows.push({ ...seed[1], createdAt: NOW - 10000 })
  const ui = await mount(rows)
  try {
    expect(ui.stems()).toHaveLength(200)
    expect(ui.stems().at(-1)).toBe('Question 199')
    expect(ui.container.querySelector('caption')?.textContent).toContain('Showing the newest 200 flags')
    await act(async () => { await ui.router.navigate({ to: '/admin/flags', search: { type: 'partner', company: 'beta', status: 'resolved' } } as never) })
    expect(ui.stems()).toEqual(['Which tape seals a box?'])
    expect(ui.status()).toBe('Showing 1 flags')
    expect(ui.container.querySelector('caption')?.textContent).not.toContain('200')
  } finally { await ui.cleanup() }
})
