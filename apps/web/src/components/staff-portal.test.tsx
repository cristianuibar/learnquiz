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
import { Route as portalQuestionsRoute } from '@/routes/admin_.companies.$slug.portal.questions'
import { Route as portalPeopleRoute } from '@/routes/admin_.companies.$slug.portal.people'
import { Route as portalPersonRoute } from '@/routes/admin_.companies.$slug.portal.people_.$id'
import { Route as portalSettingsRoute } from '@/routes/admin_.companies.$slug.portal.settings'
import { getQuestionReview } from '@/server/question-review'
import { getPeople } from '@/server/people'
import { getProfile, getMemberFlags } from '@/server/profile'
import { getCompanySettings } from '@/server/org-settings'
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
vi.mock('@/server/org-settings', () => ({ getCompanyBranding: async () => null, getCompanySettings: vi.fn(), saveCompanySettings: vi.fn() }))
vi.mock('@/server/question-review', () => ({ getQuestionReview: vi.fn(), reviewQuestion: vi.fn() }))
vi.mock('@/server/people', () => ({ getPeople: vi.fn() }))
vi.mock('@/server/profile', () => ({ getProfile: vi.fn(), getMemberFlags: vi.fn() }))
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

const overview = {
  name: 'Northwind', slug: 'northwind', readOnly: true, nextStep: null,
  roles: [{ ...detail.role, documents: 1, failedDocuments: 0, conceptsReady: 3, conceptsTotal: 12, preparing: true, topicStatus: 'generating' }],
  training: { employees: 0, proficientEmployees: 0, daysToProficiency: null, criticalErrorsThisWeek: 0, documentsToReview: 0, firstProficientUserId: null, openErrorUserId: null },
}

beforeEach(() => {
  vi.mocked(getPortalShell).mockResolvedValue(shell)
  vi.mocked(getStaffSession).mockResolvedValue({ name: 'Sam', failedJobs: 0 } as never)
  vi.mocked(getRoleDetail).mockResolvedValue(detail as never)
  vi.mocked(getQuestionReview).mockResolvedValue(review as never)
  vi.mocked(getPeople).mockResolvedValue(people as never)
  vi.mocked(getProfile).mockResolvedValue(profile as never)
  vi.mocked(getMemberFlags).mockResolvedValue({ readOnly: true, flags: [] })
  vi.mocked(getCompanySettings).mockResolvedValue(settings)
  vi.mocked(getOrgOverview).mockResolvedValue(overview as never)
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
    org.addChildren([stub(org as never, '/'), stub(org as never, '/roles'), stub(org as never, '/people'), stub(org as never, '/people/$id'), stub(org as never, '/questions'), stub(org as never, '/settings')]),
    portal.addChildren([
      leaf(portalOverviewRoute, '/'),
      leaf(portalRolesRoute, '/roles'),
      leaf(portalRoleRoute, '/roles/$roleId'),
      leaf(portalQuestionsRoute, '/questions'),
      leaf(portalPeopleRoute, '/people'),
      leaf(portalPersonRoute, '/people/$id'),
      leaf(portalSettingsRoute, '/settings'),
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
  ['normal', 'Picker', '/roles/picker', 'Picker'],
  ['normal', 'All roles', '/roles', 'Roles'],
  ['preparing', 'Picker', '/roles/picker', 'Picker'],
  ['preparing', 'All roles', '/roles', 'Roles'],
  ['preparing', 'Watch the build', '/roles/picker', 'Picker'],
])('opens %s Overview link %s in the read-only staff portal', async (state, label, destination, heading) => {
  if (state === 'normal') {
    vi.mocked(getOrgOverview).mockResolvedValue({
      ...overview,
      roles: [{ ...overview.roles[0], preparing: false, topicStatus: 'ready', conceptsReady: 12 }],
      training: { ...overview.training, employees: 3 },
    } as never)
  }
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
  const buttons = [...container.querySelectorAll('button')].map((b) => `${b.textContent} ${b.getAttribute('aria-label') ?? ''}`)
  for (const gone of [/Edit/, /Retry/, /Upload/, /Add document/, /Paste text/]) expect(buttons.filter((b) => gone.test(b))).toEqual([])
})

it('returns to the staff Overview when the role detail breadcrumb is clicked', async () => {
  vi.mocked(getOrgOverview).mockResolvedValue({
    name: 'Northwind', slug: 'northwind', readOnly: true, nextStep: null, roles: [],
    training: { employees: 3, proficientEmployees: 1, daysToProficiency: 5, criticalErrorsThisWeek: 1, documentsToReview: 0, firstProficientUserId: 'learner1', openErrorUserId: 'learner2' },
  })
  vi.mocked(listRoles).mockResolvedValue({ name: 'Northwind', slug: 'northwind', readOnly: true, roles: [] })
  const { container, router } = await renderAt('/admin/companies/northwind/portal/roles/picker')
  const crumb = container.querySelector<HTMLAnchorElement>('nav[aria-label="Breadcrumb"] a')!
  await act(async () => { crumb.click() })
  await vi.waitFor(() => expect(router.state.status).toBe('idle'))
  expect(router.state.location.pathname).toBe('/admin/companies/northwind/portal')
  expect(container.querySelector('h1')?.textContent).toBe('Overview')
  expect(getOrgOverview).toHaveBeenCalledWith({ data: { slug: 'northwind' } })
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
  expect(people.router.state.location.pathname).toBe('/admin/companies/northwind/portal/people')
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


const settings = { slug: 'northwind', readOnly: true, name: 'Northwind Logistics', logoUrl: '/api/org/org/logo', hasLogo: true, accent: '#543189', timezone: 'Europe/London', workingHours: { days: [1, 3, 5], start: '08:30', end: '17:30' } }
const profile = { name: 'Dana Whitaker', role: 'Picker', started: false, units: [], confidentErrors: [], reachedWeeks: null, weeks: [], topic: null, onboarding: null }
const people = { id: 'org', slug: 'northwind', name: 'Northwind', readOnly: true, roles: [{ id: 'picker', name: 'Picker' }], people: [{ kind: 'member', userId: 'dana', name: 'Dana Whitaker', email: 'dana@example.test', jobRole: 'Picker', status: 'active', lastActiveAt: null, day: 1, onboardingDays: 30, mastery: 0.5, benchmark: 0.85, openCriticalErrors: 0 }] }
const review = {
  readOnly: true, name: 'Northwind', roles: [{ id: 'picker', name: 'Picker' }], role: { id: 'picker', name: 'Picker' }, unreviewed: 0, sources: [],
  units: [{ id: 'u', name: 'Receiving', concepts: [{ id: 'c', name: 'Pallet check', critical: true, counts: { total: 6, unreviewed: 0, flagged: 6, rejected: 0 }, questions: Array.from({ length: 6 }, (_, i) => ({
    id: `q${i}`, status: 'reported', difficulty: 2, reviewedAt: null, createdAt: 1793700000000, source: null,
    payload: { format: 'cloze', stem: `Check pallet ${i}`, explanation: 'Check the wrapping.', accepted_answers: ['Intact'], model_answer: 'Intact', source_quote: null },
    flags: [{ id: `f${i}`, reporterId: 'dana', reporterName: 'Dana Whitaker', createdAt: 1793700000000, label: 'Wrong answer', note: 'The wrapping is torn.', attempt: null }],
  })) }] }],
}

it('opens a flagged question for staff, keeps read filters in the staff portal and hides review controls', async () => {
  const { container, router } = await renderAt('/admin/companies/northwind/portal/questions?role=picker&item=q5&flagged=1')
  expect(getQuestionReview).toHaveBeenCalledWith({ data: { slug: 'northwind', roleId: 'picker' } })
  expect(container.querySelector('#body-q5')?.textContent).toContain('The wrapping is torn.')
  expect(container.querySelector('#body-q5')?.textContent).toContain('Wrong answer')
  expect(container.querySelector('#body-q5')?.textContent).toContain('Intact')
  expect(container.querySelector('#stem-q5')?.textContent).toBe('Check pallet 5')
  const buttons = [...container.querySelectorAll<HTMLButtonElement>('main button')]
  expect(buttons.filter((b) => /Approve|Edit|Retire/.test(b.textContent ?? ''))).toEqual([])
  const person = container.querySelector<HTMLAnchorElement>('#body-q5 a')!
  expect(person.getAttribute('href')).toBe('/admin/companies/northwind/portal/people/dana')
  const filter = buttons.find((b) => b.textContent?.startsWith('Flagged by learners'))!
  await act(async () => filter.click())
  await vi.waitFor(() => expect(router.state.location.search.flagged).toBeUndefined())
  expect(router.state.location.pathname).toBe('/admin/companies/northwind/portal/questions')
})

it('shows saved staff settings as text with no form or controls', async () => {
  const { container, router } = await renderAt('/org/northwind/settings')
  expect(router.state.location.pathname).toBe('/admin/companies/northwind/portal/settings')
  const page = container.querySelector('main')!
  for (const value of ['Settings', 'Northwind Logistics', '#543189', 'Start quiz', 'Europe/London', 'Monday, Wednesday, Friday', '8:30 AM – 5:30 PM']) expect(page.textContent).toContain(value)
  expect(page.querySelector('img')?.getAttribute('src')).toBe(settings.logoUrl)
  expect(page.querySelector('form,input,select,textarea,button')).toBeNull()
})

it('links staff people to the same Training progress page and back without invitation controls', async () => {
  const { container, router } = await renderAt('/admin/companies/northwind/portal/people')
  const page = container.querySelector('main')!
  expect(page.textContent).toContain('1 person')
  expect(page.querySelector('input[placeholder="Search by name or email"]')).not.toBeNull()
  expect([...page.querySelectorAll('button')].filter((b) => /Invite people|Show invite|Create new link|QR|Actions/.test(`${b.textContent} ${b.getAttribute('aria-label')}`))).toEqual([])
  const name = [...page.querySelectorAll('a')].find((a) => a.textContent === 'Dana Whitaker')!
  expect(name?.getAttribute('href')).toBe('/admin/companies/northwind/portal/people/dana')
  await act(async () => name.click())
  await vi.waitFor(() => expect(router.state.location.pathname).toBe('/admin/companies/northwind/portal/people/dana'))
  expect(container.querySelector('h1')?.textContent).toBe('Training progress')
  const back = container.querySelector('main nav a')!
  expect(back.getAttribute('href')).toBe('/admin/companies/northwind/portal/people')
})

it('preserves question deep links and person paths when redirecting staff from the partner portal', async () => {
  const questions = await renderAt('/org/northwind/questions?role=picker&item=q5&flagged=1')
  expect(questions.router.state.location.pathname).toBe('/admin/companies/northwind/portal/questions')
  expect(questions.container.querySelector('#body-q5')?.textContent).toContain('The wrapping is torn.')
  const person = await renderAt('/org/northwind/people/dana')
  expect(person.router.state.location.pathname).toBe('/admin/companies/northwind/portal/people/dana')
})
