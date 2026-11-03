// @vitest-environment happy-dom
import { act } from 'react'
import { createRoot } from 'react-dom/client'
import { createMemoryHistory, createRootRoute, createRoute, createRouter, Outlet, RouterProvider } from '@tanstack/react-router'
import { expect, it, vi } from 'vitest'
import { Route as roleDetailRoute } from '@/routes/org.$slug.roles_.$roleId'
import { retireRoleDocument } from '@/server/role-documents'
import { getRoleDetail, updateRoleConcept } from '@/server/role-detail'

vi.mock('@/server/role-detail', () => ({ getRoleDetail: vi.fn(), updateRoleConcept: vi.fn() }))
vi.mock('@/server/curriculum', () => ({ generateRoleCurriculum: vi.fn(), retryConceptGeneration: vi.fn() }))
vi.mock('@/server/role-documents', () => ({ uploadRoleDocument: vi.fn(), retireRoleDocument: vi.fn() }))
vi.mock('@tanstack/react-start', () => ({ useServerFn: (fn: unknown) => fn }))

it('shows a role with its documents and concepts and saves the Critical toggle', async () => {
  const detail = {
    org: { slug: 'x', name: 'Acme' },
    readOnly: false,
    role: { id: 'r1', name: 'Cashier', benchmark: 0.85, onboardingDays: 30, topicId: 't1', topicStatus: 'generating' },
    documents: [{ id: 'd1', title: 'Till handbook', kind: 'pdf', version: 2, createdAt: Date.UTC(2026, 0, 5) }],
    units: [{
      id: 'u1', name: 'Opening', summary: 'Start of day',
      concepts: [
        { id: 'c1', name: 'Cash float', summary: 'Count the float', critical: false, genStatus: 'ready', genError: null },
        { id: 'c2', name: 'Card reader', summary: 'Pair the reader', critical: false, genStatus: 'generating', genError: null },
      ],
    }],
  }
  vi.mocked(getRoleDetail).mockResolvedValue(detail as never)
  vi.mocked(updateRoleConcept).mockResolvedValue({ ok: true })
  Object.assign(globalThis, { IS_REACT_ACT_ENVIRONMENT: true })
  const rootRoute = createRootRoute({ component: Outlet })
  const page = createRoute({ getParentRoute: () => rootRoute, path: '/org/$slug/roles/$roleId', loader: roleDetailRoute.options.loader as (ctx: { params: { slug: string; roleId: string } }) => ReturnType<typeof getRoleDetail>, component: roleDetailRoute.options.component })
  const router = createRouter({ routeTree: rootRoute.addChildren([page]), history: createMemoryHistory({ initialEntries: ['/org/x/roles/r1'] }) })
  const container = document.createElement('div')
  document.body.appendChild(container)
  const root = createRoot(container)
  try {
    await act(async () => { await router.load(); root.render(<RouterProvider router={router} />) })
    expect(container.textContent).toContain('Version 2')
    expect(container.textContent).toContain('Cash float')
    expect(container.textContent).toContain('Card reader')
    expect(container.textContent).toContain('1 of 2 concepts done')
    expect(container.textContent).toContain('Training: Preparing training')
    expect(getRoleDetail).toHaveBeenCalledWith({ data: { slug: 'x', roleId: 'r1' } })
    const before = vi.mocked(getRoleDetail).mock.calls.length
    const box = container.querySelector<HTMLInputElement>('input[type="checkbox"]')!
    await act(async () => { box.click() })
    expect(updateRoleConcept).toHaveBeenCalledWith({ data: { slug: 'x', conceptId: 'c1', critical: true } })
    await vi.waitFor(() => expect(vi.mocked(getRoleDetail).mock.calls.length).toBeGreaterThan(before))
  } finally {
    await act(async () => root.unmount())
    container.remove()
    delete (globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT
  }
})

it('retires a document after confirmation', async () => {
  const detail = {
    org: { slug: 'x', name: 'Acme' },
    readOnly: false,
    role: { id: 'r1', name: 'Cashier', benchmark: 0.85, onboardingDays: 30, topicId: 't1', topicStatus: 'ready' },
    documents: [{ id: 'd1', title: 'Till handbook', kind: 'pdf', version: 2, createdAt: Date.UTC(2026, 0, 5) }],
    units: [],
  }
  vi.mocked(getRoleDetail).mockResolvedValue(detail as never)
  vi.mocked(retireRoleDocument).mockResolvedValue({ ok: true })
  const confirm = vi.fn(() => true)
  vi.stubGlobal('confirm', confirm)
  Object.assign(globalThis, { IS_REACT_ACT_ENVIRONMENT: true })
  const rootRoute = createRootRoute({ component: Outlet })
  const page = createRoute({ getParentRoute: () => rootRoute, path: '/org/$slug/roles/$roleId', loader: roleDetailRoute.options.loader as (ctx: { params: { slug: string; roleId: string } }) => ReturnType<typeof getRoleDetail>, component: roleDetailRoute.options.component })
  const router = createRouter({ routeTree: rootRoute.addChildren([page]), history: createMemoryHistory({ initialEntries: ['/org/x/roles/r1'] }) })
  const container = document.createElement('div')
  document.body.appendChild(container)
  const root = createRoot(container)
  try {
    await act(async () => { await router.load(); root.render(<RouterProvider router={router} />) })
    const button = [...container.querySelectorAll('button')].find((b) => b.textContent === 'Retire Till handbook')!
    const before = vi.mocked(getRoleDetail).mock.calls.length
    await act(async () => { button.click() })
    expect(confirm).toHaveBeenCalledWith('Retire this document? Its questions stop appearing in practice.')
    expect(retireRoleDocument).toHaveBeenCalledWith({ data: { slug: 'x', roleId: 'r1', sourceId: 'd1' } })
    await vi.waitFor(() => expect(vi.mocked(getRoleDetail).mock.calls.length).toBeGreaterThan(before))
  } finally {
    vi.unstubAllGlobals()
    await act(async () => root.unmount())
    container.remove()
    delete (globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT
  }
})
