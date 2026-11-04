// @vitest-environment happy-dom
import { act } from 'react'
import { createRoot } from 'react-dom/client'
import { createMemoryHistory, createRootRoute, createRoute, createRouter, Outlet, RouterProvider } from '@tanstack/react-router'
import { afterEach, beforeEach, expect, it, vi } from 'vitest'
import { Route as appRootRoute } from '@/routes/__root'
import { Route as orgRoute } from '@/routes/org.$slug'
import { Route as portalRoute } from '@/routes/admin_.companies.$slug.portal'
import { Route as portalOverviewRoute } from '@/routes/admin_.companies.$slug.portal.index'
import { Route as portalRolesRoute } from '@/routes/admin_.companies.$slug.portal.roles'
import { Route as portalRoleRoute } from '@/routes/admin_.companies.$slug.portal.roles_.$roleId'
import { getStaffSession } from '@/server/admin'
import { getOrgOverview, listRoles } from '@/server/org'
import { getPortalShell } from '@/server/org-shell'
import { getRoleDetail } from '@/server/role-detail'
import { getSessionFn } from '@/server/session-fn'

vi.mock('@/server/admin', () => ({ getStaffSession: vi.fn() }))
vi.mock('@/server/org', () => ({ getOrgOverview: vi.fn(), listRoles: vi.fn() }))
vi.mock('@/server/org-shell', () => ({ getPortalShell: vi.fn(), getAccessContext: vi.fn().mockResolvedValue({ email: 'u@x.test' }) }))
vi.mock('@/server/role-detail', () => ({ getRoleDetail: vi.fn(), updateRoleConcept: vi.fn() }))
vi.mock('@/server/curriculum', () => ({ generateRoleCurriculum: vi.fn(), retryConceptGeneration: vi.fn() }))
vi.mock('@/server/role-documents', () => ({ uploadRoleDocument: vi.fn(), retireRoleDocument: vi.fn(), previewRetireRoleDocument: vi.fn(), removeRoleDocument: vi.fn() }))
vi.mock('@/server/session-fn', () => ({ getSessionFn: vi.fn() }))
vi.mock('@/server/latest-topic', () => ({ getLatestTopicIdFn: async () => null }))
vi.mock('@/server/org-settings', () => ({ getCompanyBranding: async () => null }))
vi.mock('@/lib/auth-client', () => ({ authClient: { signOut: vi.fn(), organization: {} } }))
vi.mock('@tanstack/react-start', () => ({ useServerFn: (fn: unknown) => fn }))

type Loader = (ctx: { params: Record<string, string> }) => unknown
const shell = { orgId: 'org', name: 'Northwind', slug: 'northwind', logoUrl: null, userName: 'Sam Staff', role: null, readOnly: true }
const concept = (id: string, name: string, genStatus: string, over = {}) => ({ id, name, summary: `About ${name}`, critical: false, genStatus, genError: null, questionCount: genStatus === 'ready' ? 4 : 0, ...over })
const detail = {
  org: { slug: 'northwind', name: 'Northwind' },
  readOnly: true,
  role: { id: 'picker', name: 'Picker', benchmark: 0.85, onboardingDays: 30, topicId: 't1', topicStatus: 'ready', people: 3, liveQuestions: 12, criticalQuestions: 5 },
  documents: [{ id: 'd1', title: 'Pick handbook', kind: 'pdf', version: 1, createdAt: Date.UTC(2026, 9, 28), status: 'ready', error: null, sizeBytes: 1000, pageCount: 18, chars: 9000, uploaderName: 'Dana' }],
  units: [{ id: 'u1', name: 'Receiving', summary: 'Dock', concepts: [concept('c1', 'Pallet check', 'ready', { critical: true }), concept('c2', 'Label scan', 'failed', { genError: 'boom' })] }],
}

const session = (role: string, adminCompanies: { slug: string }[] = []) =>
  vi.mocked(getSessionFn).mockResolvedValue({ user: { id: 'u', name: 'U', email: 'u@x.test', isAnonymous: false, role }, facebookEnabled: false, needsDisclosure: false, companyMember: false, adminCompanies } as never)

beforeEach(() => {
  vi.mocked(getPortalShell).mockResolvedValue(shell)
  vi.mocked(getStaffSession).mockResolvedValue({ name: 'Sam', failedJobs: 0 } as never)
  vi.mocked(getRoleDetail).mockResolvedValue(detail as never)
  vi.mocked(getOrgOverview).mockResolvedValue({
    name: 'Northwind', slug: 'northwind', readOnly: true, nextStep: null,
    roles: [{ ...detail.role, documents: 1, failedDocuments: 0, conceptsReady: 3, conceptsTotal: 12, preparing: true, topicStatus: 'generating' }],
    training: { employees: 0, proficientEmployees: 0, daysToProficiency: null, criticalErrorsThisWeek: 0, documentsToReview: 0, firstProficientUserId: null, openErrorUserId: null },
  } as never)
  vi.mocked(listRoles).mockResolvedValue({
    name: 'Northwind', slug: 'northwind', readOnly: true,
    roles: [{ ...detail.role, topicStatus: 'ready', documentCount: 1, failedDocuments: 0, conceptsReady: 12, conceptsTotal: 12, preparing: false, peopleCount: 3 }],
  })
  session('admin')
})

let cleanups: Array<() => Promise<void>> = []
afterEach(async () => {
  for (const c of cleanups) await c()
  cleanups = []
  vi.clearAllMocks()
  delete (globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT
})

async function renderAt(path: string) {
  Object.assign(globalThis, { IS_REACT_ACT_ENVIRONMENT: true })
  const rootRoute = createRootRoute({ beforeLoad: appRootRoute.options.beforeLoad, loader: appRootRoute.options.loader, component: Outlet })
  const stub = (parent: typeof rootRoute, p: string) => createRoute({ getParentRoute: () => parent, path: p, component: () => <p>stub {p}</p> })
  const org = createRoute({ getParentRoute: () => rootRoute, path: '/org/$slug', beforeLoad: orgRoute.options.beforeLoad, loader: orgRoute.options.loader as Loader, errorComponent: orgRoute.options.errorComponent, component: orgRoute.options.component })
  const portal = createRoute({ getParentRoute: () => rootRoute, path: '/admin/companies/$slug/portal', beforeLoad: portalRoute.options.beforeLoad, loader: portalRoute.options.loader as Loader, errorComponent: portalRoute.options.errorComponent, component: portalRoute.options.component })
  const leaf = (r: { options: object }, p: string, parent = portal) =>
    createRoute({ getParentRoute: () => parent, path: p, ...r.options } as never)
  const tree = rootRoute.addChildren([
    org.addChildren([stub(org as never, '/'), stub(org as never, '/roles'), stub(org as never, '/people')]),
    portal.addChildren([
      leaf(portalOverviewRoute, '/'),
      leaf(portalRolesRoute, '/roles'),
      leaf(portalRoleRoute, '/roles/$roleId'),
    ]),
    createRoute({ getParentRoute: () => rootRoute, path: '/sign-in', component: () => <p>sign in</p> }),
  ])
  const router = createRouter({ routeTree: tree, history: createMemoryHistory({ initialEntries: [path] }) })
  const container = document.createElement('div')
  document.body.appendChild(container)
  const root = createRoot(container)
  await act(async () => { await router.load(); root.render(<RouterProvider router={router} />) })
  cleanups.push(async () => { await act(async () => root.unmount()); container.remove() })
  return { container, router }
}

it.each([
  ['Picker', '/roles/picker', 'Picker'],
  ['All roles', '/roles', 'Roles'],
  ['Watch the build', '/roles/picker', 'Picker'],
])('opens %s from the read-only staff Overview', async (label, destination, heading) => {
  const { container, router } = await renderAt('/admin/companies/northwind/portal')
  expect(container.querySelector('h1')?.textContent).toBe('Overview')
  const link = [...container.querySelectorAll<HTMLAnchorElement>('main a')].find((a) => a.textContent === label)
  expect(link?.getAttribute('href')).toBe(`/admin/companies/northwind/portal${destination}`)
  await act(async () => { link!.click() })
  await vi.waitFor(() => expect(router.state.location.pathname).toBe(`/admin/companies/northwind/portal${destination}`))
  expect(container.querySelector('h1')?.textContent).toBe(heading)
  expect(container.querySelector('[aria-label="Read-only view"]')).not.toBeNull()
})

it('shows a role to staff with no way to change anything', async () => {
  const { container } = await renderAt('/admin/companies/northwind/portal/roles/picker')
  expect(container.textContent).toContain('Picker')
  expect(container.textContent).toContain('Pallet check')
  expect(container.textContent).toContain('Critical')
  expect(container.querySelector('[role="switch"]')).toBeNull()
  const crumb = [...container.querySelectorAll('ol a')].find((a) => a.textContent === 'Overview')
  expect(crumb?.getAttribute('href')).toBe('/admin/companies/northwind/portal')
  const buttons = [...container.querySelectorAll('button')].map((b) => `${b.textContent} ${b.getAttribute('aria-label') ?? ''}`)
  for (const gone of [/Edit/, /Retry/, /Upload/, /Add document/, /Paste text/]) expect(buttons.filter((b) => gone.test(b))).toEqual([])
})

it('puts the read-only band first in the tab order, before the nav', async () => {
  const { container } = await renderAt('/admin/companies/northwind/portal/roles/picker')
  const band = container.querySelector('[role="region"][aria-label="Read-only view"]')!
  expect(band).not.toBeNull()
  const first = container.querySelector('a[href],button:not([disabled]),input,select,textarea,[tabindex]:not([tabindex="-1"])')!
  expect(band.contains(first)).toBe(true)
  expect(first.textContent).toBe('Exit to staff admin')
  expect(first.getAttribute('href')).toBe('/admin/companies/northwind')
  const nav = container.querySelector('nav')!
  expect(band.compareDocumentPosition(nav) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy()
})

it('sends staff who are not members of the company to the staff portal', async () => {
  const roles = await renderAt('/org/northwind/roles')
  expect(roles.router.state.location.pathname).toBe('/admin/companies/northwind/portal/roles')
  const people = await renderAt('/org/northwind/people')
  expect(people.router.state.location.pathname).toBe('/admin/companies/northwind/portal')
})

it('keeps staff who own or administer the company in the full portal', async () => {
  session('admin', [{ slug: 'northwind' }])
  const { router } = await renderAt('/org/northwind')
  expect(router.state.location.pathname).toBe('/org/northwind')
})

it('shows the denied page to a non-member opening a company portal', async () => {
  session('user')
  vi.mocked(getPortalShell).mockRejectedValue(Object.assign(new Error('Forbidden'), { status: 403 }))
  const { container } = await renderAt('/org/northwind')
  expect(container.textContent).toContain('No access to this portal')
  expect(container.textContent).not.toContain('stub')
})

it('shows the staff denied page to non-staff opening the staff portal', async () => {
  session('user')
  vi.mocked(getStaffSession).mockRejectedValue(Object.assign(new Error('Forbidden'), { status: 403 }))
  const { container } = await renderAt('/admin/companies/northwind/portal')
  expect(container.textContent).toContain('No access to the staff admin')
  expect(container.querySelector('[aria-label="Read-only view"]')).toBeNull()
})
