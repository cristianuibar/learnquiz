// @vitest-environment happy-dom
import { act } from 'react'
import { createRoot } from 'react-dom/client'
import { createMemoryHistory, createRootRoute, createRoute, createRouter, Outlet, RouterProvider } from '@tanstack/react-router'
import { expect, it, vi } from 'vitest'
import { Route as companyRoute } from '@/routes/admin.companies_.$slug'
import { getCompany } from '@/server/admin-companies'

vi.mock('@/server/admin-companies', () => ({ getCompany: vi.fn() }))

const seed = {
  id: 'acme', name: 'Acme', slug: 'acme', logo: '/logo.svg', createdAt: new Date('2026-09-29T00:00:00Z'), owner: 'Dana', activeLearners: 2, modelSpend: 148.2,
  members: [{ id: 'm1', name: 'Dana', email: 'dana@acme.test', role: 'owner', joinedAt: new Date('2026-09-29T00:00:00Z'), lastActive: Date.parse('2026-11-04T09:15:00Z') },
    { id: 'm2', name: 'Marcus', email: 'marcus@acme.test', role: 'admin', joinedAt: new Date('2026-09-30T00:00:00Z'), lastActive: Date.parse('2026-11-03T10:00:00Z') },
    { id: 'm3', name: 'Amara', email: 'amara@acme.test', role: 'member', joinedAt: new Date('2026-10-01T00:00:00Z'), lastActive: Date.parse('2026-11-01T10:00:00Z') },
  ],
  invitations: [{ id: 'i1', name: 'Luca', email: 'luca@acme.test', role: 'member', createdAt: new Date('2026-11-02T00:00:00Z') }],
  roles: [{ id: 'r1', name: 'Picker', topicStatus: 'ready', preparing: true, conceptsTotal: 24, conceptsReady: 9, liveQuestions: 0, people: 1 }],
  documents: [{ id: 'd1', title: 'Picking SOP', role: 'Picker', kind: 'pdf', sizeBytes: 1100000, pageCount: 9, chars: 6240, version: 3, createdAt: Date.parse('2026-11-02T00:00:00Z'), uploaderName: 'Dana', status: 'ready', unreviewed: 0, generating: true }],
  spendByJob: [{ purpose: 'items', models: ['muse-spark-1.3', 'accounts/fireworks/models/muse-spark-open'], cost: 116.3 }, { purpose: 'grade', models: ['muse-spark-1.3'], cost: 31.9 }],
}

async function mount(data = seed) {
  Object.assign(globalThis, { IS_REACT_ACT_ENVIRONMENT: true })
  vi.spyOn(Date, 'now').mockReturnValue(Date.parse('2026-11-04T12:00:00Z'))
  vi.mocked(getCompany).mockResolvedValue(data as never)
  const rootRoute = createRootRoute({ component: Outlet })
  const company = createRoute({ getParentRoute: (() => rootRoute) as never, path: '/admin/companies/$slug' as never, loader: companyRoute.options.loader as never, component: companyRoute.options.component })
  const router = createRouter({ routeTree: rootRoute.addChildren([company as never]), history: createMemoryHistory({ initialEntries: ['/admin/companies/acme'] }) })
  const container = document.createElement('div')
  document.body.appendChild(container)
  const root = createRoot(container)
  await act(async () => { await router.load(); root.render(<RouterProvider router={router} />) })
  return { container, cleanup: async () => {
    await act(async () => root.unmount())
    container.remove()
    vi.restoreAllMocks()
    delete (globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT
  } }
}

it('shows the read-only company detail with accessible tables, recorded models and the staff portal link', async () => {
  const { container, cleanup } = await mount()
  try {
    expect(container.querySelector('h1')!.textContent).toBe('Acme')
    expect(container.querySelector('dl')?.textContent).toContain('Active learners · 30 days2')
    expect(container.querySelector('dl')?.textContent).toContain('Model spend · 30 days$148.20')
    const tables = [...container.querySelectorAll('table')]
    expect(tables.map((t) => t.querySelector('caption')?.textContent)).toEqual([
      'Members of Acme', 'Job roles at Acme and their training status', 'Documents uploaded by Acme, newest first', 'Model spend by job for Acme, last 30 days, in US dollars',
    ])
    expect(tables.every((t) => [...t.querySelectorAll('thead th')].every((th) => th.getAttribute('scope') === 'col'))).toBe(true)
    expect(tables[0].textContent).toContain('Luca')
    expect(tables[0].textContent).toContain('Not joined')
    expect(tables[0].textContent).toContain('Today 09:15')
    expect(tables[0].textContent).toContain('Yesterday')
    expect(tables[0].textContent).toContain('Nov 1')
    expect(tables[1].textContent).toContain('9 of 24 concepts ready')
    expect(tables[1].textContent).toContain('Still generating')
    expect(tables[2].textContent).toContain('Picking SOP')
    expect(tables[2].textContent).toContain('1.1 MB · 9 pages')
    const spend = container.querySelector('figure')!
    expect(spend.textContent).toContain('Muse Spark muse-spark-1.3')
    expect(spend.textContent).toContain('Muse Spark Open')
    expect(spend.textContent).toContain('accounts/fireworks/models/muse-spark-open')
    expect([...tables[3].querySelectorAll('tfoot th, tfoot td')].map((c) => c.textContent)).toEqual(['Total', '', '$148.20'])
    expect([...container.querySelectorAll('a')].map((a) => [a.textContent, a.getAttribute('href')])).toEqual([
      ['Companies', '/admin/companies'], ['View portal (read only)', '/admin/companies/acme/portal'],
    ])
    expect(container.querySelector('button, input, select, [role="menu"], [role="switch"]')).toBeNull()
  } finally { await cleanup() }
})

it('shows missing spend as no data, including the accessible chart total', async () => {
  const { container, cleanup } = await mount({ ...seed, modelSpend: null, spendByJob: [] } as never)
  try {
    expect(container.querySelector('dl')?.textContent).toContain('Model spend · 30 days—No data yet')
    expect(container.querySelector('figure')?.textContent).toContain('No data yet')
    expect(container.querySelector('figure')?.textContent).not.toContain('$0.00')
  } finally { await cleanup() }
})
