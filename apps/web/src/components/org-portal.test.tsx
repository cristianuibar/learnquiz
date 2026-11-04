// @vitest-environment happy-dom
import { act } from 'react'
import { createRoot } from 'react-dom/client'
import { createMemoryHistory, createRootRoute, createRoute, createRouter, Outlet, RouterProvider } from '@tanstack/react-router'
import { beforeEach, expect, it, vi } from 'vitest'
import { Route as appRootRoute } from '@/routes/__root'
import { Route as orgRoute } from '@/routes/org.$slug'
import { Route as indexRoute } from '@/routes/org.$slug.index'
import { Route as peopleRoute } from '@/routes/org.$slug.people'
import { Route as signInRoute } from '@/routes/sign-in'
import { getOrgOverview } from '@/server/org'
import { getPeople } from '@/server/people'
import { getPortalShell } from '@/server/org-shell'
import { getSessionFn } from '@/server/session-fn'

vi.mock('@/server/org', () => ({ getOrgOverview: vi.fn() }))
vi.mock('@/server/people', () => ({ getPeople: vi.fn() }))
const { inviteMember } = vi.hoisted(() => ({ inviteMember: vi.fn() }))
vi.mock('@/lib/auth-client', () => ({ authClient: { organization: { inviteMember } } }))
vi.mock('@/server/org-shell', () => ({ getPortalShell: vi.fn() }))
vi.mock('@/server/session-fn', () => ({ getSessionFn: vi.fn() }))
vi.mock('@/server/latest-topic', () => ({ getLatestTopicIdFn: async () => null }))
vi.mock('@/server/org-settings', () => ({ getCompanyBranding: async () => null }))
vi.mock('@/components/credentials-form', () => ({ CredentialsForm: ({ onDone }: { onDone: () => void }) => <button onClick={onDone}>Sign in</button> }))

const shell = { orgId: 'org', name: 'Acme', slug: 'x', logoUrl: null, userName: 'Dana Whitaker', role: 'owner' as 'owner' | 'admin' | null, readOnly: false }
beforeEach(() => { vi.mocked(getPortalShell).mockResolvedValue(shell) })

it('sends signed-out visitors on a portal page to sign-in and back after login', async () => {
  vi.mocked(getPeople).mockResolvedValue({ id: 'org', name: 'Acme', slug: 'x', baseUrl: 'http://localhost', roles: [], people: [], readOnly: false } as never)
  Object.assign(globalThis, { IS_REACT_ACT_ENVIRONMENT: true })
  let user: { id: string; name: string; isAnonymous: boolean; role: string } | null = null
  vi.mocked(getSessionFn).mockImplementation(async () => ({ user, facebookEnabled: false, needsDisclosure: false, companyMember: false, adminCompanies: [] }))
  const rootRoute = createRootRoute({ beforeLoad: appRootRoute.options.beforeLoad, loader: appRootRoute.options.loader, component: Outlet })
  const org = createRoute({ getParentRoute: () => rootRoute, path: '/org/$slug', beforeLoad: orgRoute.options.beforeLoad, loader: orgRoute.options.loader as (ctx: { params: { slug: string } }) => unknown, errorComponent: orgRoute.options.errorComponent, component: orgRoute.options.component })
  const people = createRoute({ getParentRoute: () => org, path: '/people', loader: peopleRoute.options.loader as (ctx: { params: { slug: string } }) => ReturnType<typeof getPeople>, component: peopleRoute.options.component })
  const signIn = createRoute({ getParentRoute: () => rootRoute, path: '/sign-in', validateSearch: signInRoute.options.validateSearch, beforeLoad: signInRoute.options.beforeLoad, component: signInRoute.options.component })
  const router = createRouter({ routeTree: rootRoute.addChildren([org.addChildren([people]), signIn]), history: createMemoryHistory({ initialEntries: ['/org/x/people'] }) })
  const container = document.createElement('div')
  document.body.appendChild(container)
  const root = createRoot(container)
  try {
    await act(async () => { await router.load(); root.render(<RouterProvider router={router} />) })
    expect(router.state.location.pathname).toBe('/sign-in')
    expect(router.state.location.search).toEqual({ redirect: '/org/x/people' })
    expect(getPeople).not.toHaveBeenCalled()
    user = { id: 'owner', name: 'Owner', isAnonymous: false, role: 'user' }
    await act(async () => { container.querySelector('button')!.click() })
    await vi.waitFor(() => expect(router.state.location.pathname).toBe('/org/x/people'))
    expect(getPeople).toHaveBeenCalledWith({ data: { slug: 'x' } })
  } finally {
    await act(async () => root.unmount())
    container.remove()
    delete (globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT
  }
})

it('shows the portal nav on portal pages, trimmed for Learn Quiz staff, with a working mobile menu', async () => {
  vi.mocked(getPeople).mockResolvedValue({ id: 'org', name: 'Acme', slug: 'x', baseUrl: 'http://localhost', roles: [], people: [], readOnly: false } as never)
  Object.assign(globalThis, { IS_REACT_ACT_ENVIRONMENT: true })
  vi.mocked(getSessionFn).mockResolvedValue({ user: { id: 'u', name: 'U', isAnonymous: false, role: 'user' }, facebookEnabled: false, needsDisclosure: false, companyMember: false, adminCompanies: [] } as never)
  const rootRoute = createRootRoute({ beforeLoad: appRootRoute.options.beforeLoad, loader: appRootRoute.options.loader, component: Outlet })
  const org = createRoute({ getParentRoute: () => rootRoute, path: '/org/$slug', beforeLoad: orgRoute.options.beforeLoad, loader: orgRoute.options.loader as (ctx: { params: { slug: string } }) => unknown, errorComponent: orgRoute.options.errorComponent, component: orgRoute.options.component })
  const index = createRoute({ getParentRoute: () => org, path: '/', component: () => <p>Overview page</p> })
  const people = createRoute({ getParentRoute: () => org, path: '/people', loader: peopleRoute.options.loader as (ctx: { params: { slug: string } }) => ReturnType<typeof getPeople>, component: peopleRoute.options.component })
  const router = createRouter({ routeTree: rootRoute.addChildren([org.addChildren([index, people])]), history: createMemoryHistory({ initialEntries: ['/org/x/people'] }) })
  const container = document.createElement('div')
  document.body.appendChild(container)
  const root = createRoot(container)
  const links = () => [...container.querySelectorAll<HTMLAnchorElement>('nav[aria-label="Acme portal"] a')]
  const signOut = () => container.querySelector('button[aria-label="Sign out"]')
  const menu = () => container.querySelector<HTMLButtonElement>('button[aria-label="Menu"]')!
  try {
    await act(async () => { await router.load(); root.render(<RouterProvider router={router} />) })
    expect(links().map((a) => [a.textContent, a.getAttribute('href')])).toEqual([
      ['Overview', '/org/x'], ['Roles', '/org/x/roles'], ['Questions', '/org/x/questions'], ['People', '/org/x/people'], ['Settings', '/org/x/settings'],
    ])
    expect(links().filter((a) => a.getAttribute('aria-current') === 'page').map((a) => a.textContent)).toEqual(['People'])
    await act(async () => { links()[0].click() })
    await vi.waitFor(() => expect(router.state.location.pathname).toBe('/org/x'))
    expect(links()[0].getAttribute('aria-current')).toBe('page')
    expect(container.querySelector('nav[aria-label="Acme portal"]')!.textContent).toContain('Owner')
    expect(signOut()).not.toBeNull()

    expect(menu().getAttribute('aria-expanded')).toBe('false')
    expect(document.getElementById(menu().getAttribute('aria-controls')!)).not.toBeNull()
    await act(async () => { menu().click() })
    expect(menu().getAttribute('aria-expanded')).toBe('true')
    await act(async () => { document.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true })) })
    expect(menu().getAttribute('aria-expanded')).toBe('false')
    expect(document.activeElement).toBe(menu())

    vi.mocked(getPortalShell).mockResolvedValue({ ...shell, role: null, readOnly: true })
    await act(async () => { await router.invalidate() })
    expect(links().map((a) => a.textContent)).toEqual(['Overview', 'People'])
    expect(container.textContent).toContain('Read only')
    expect(container.textContent).toContain('Staff view')
    expect(signOut()).toBeNull()
  } finally {
    await act(async () => root.unmount())
    container.remove()
    delete (globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT
  }
})

let refresh: () => Promise<void> = async () => {}

async function renderAt(path: string, leaf: { path: string; loader: (ctx: { params: { slug: string } }) => unknown; component: typeof peopleRoute.options.component; pendingComponent?: unknown; errorComponent?: unknown }) {
  Object.assign(globalThis, { IS_REACT_ACT_ENVIRONMENT: true })
  vi.mocked(getSessionFn).mockResolvedValue({ user: { id: 'u', name: 'U', isAnonymous: false, role: 'user' }, facebookEnabled: false, needsDisclosure: false, companyMember: false, adminCompanies: [] } as never)
  const rootRoute = createRootRoute({ beforeLoad: appRootRoute.options.beforeLoad, loader: appRootRoute.options.loader, component: Outlet })
  const org = createRoute({ getParentRoute: () => rootRoute, path: '/org/$slug', beforeLoad: orgRoute.options.beforeLoad, loader: orgRoute.options.loader as (ctx: { params: { slug: string } }) => unknown, errorComponent: orgRoute.options.errorComponent, component: orgRoute.options.component })
  const router = createRouter({ routeTree: rootRoute.addChildren([org.addChildren([createRoute({ getParentRoute: () => org, ...(leaf as object) } as never)])]), history: createMemoryHistory({ initialEntries: [path] }) })
  refresh = () => router.invalidate()
  const container = document.createElement('div')
  document.body.appendChild(container)
  const root = createRoot(container)
  await act(async () => { await router.load(); root.render(<RouterProvider router={router} />) })
  return {
    container,
    cleanup: async () => {
      await act(async () => root.unmount())
      container.remove()
      delete (globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT
    },
  }
}

const peopleLeaf = { path: '/people', loader: peopleRoute.options.loader as (ctx: { params: { slug: string } }) => ReturnType<typeof getPeople>, component: peopleRoute.options.component }

const member = (userId: string, name: string, jobRole: string, status: 'active' | 'proficient', mastery: number, extra = {}) =>
  ({ kind: 'member', userId, name, email: `${name.toLowerCase()}@acme.test`, jobRole, status, day: 9, onboardingDays: 30, proficientInDays: null, lastActiveAt: null, mastery, benchmark: 85, openCriticalErrors: 2, ...extra })
const invite = (id: string, name: string, status: 'invited' | 'expired', jobRoleId: string, jobRole: string) =>
  ({ kind: 'invite', invitationId: id, name, email: `${name.toLowerCase()}@acme.test`, jobRole, jobRoleId, status, invitedAt: Date.UTC(2026, 10, 2), expiresAt: Date.UTC(2026, 10, 9) })
const roles = [{ id: 'r1', name: 'Cashier', benchmark: 85, onboardingDays: 30, topicId: 't1', topicStatus: 'ready' }, { id: 'r2', name: 'Cook', benchmark: 85, onboardingDays: 30, topicId: 't2', topicStatus: 'ready' }]
const fixture = [
  member('u1', 'Ana', 'Cashier', 'active', 42),
  member('u2', 'Ben', 'Cook', 'proficient', 90, { proficientInDays: 21 }),
  invite('i1', 'Cy', 'invited', 'r1', 'Cashier'),
  invite('i2', 'Di', 'expired', 'r2', 'Cook'),
]
const load = (people: unknown[], extra = {}) => vi.mocked(getPeople).mockResolvedValue({ id: 'org', name: 'Acme', slug: 'x', baseUrl: 'http://localhost', roles, people, readOnly: false, ...extra } as never)
const click = (el: Element) => act(async () => { (el as HTMLElement).click() })
const named = (scope: { querySelectorAll(s: string): Iterable<Element> }, tag: string, text: string) => [...scope.querySelectorAll(tag)].find((e) => e.textContent!.trim() === text)!

it('combines search, role and status filters and reports the narrowed count', async () => {
  load(fixture)
  const { container, cleanup } = await renderAt('/org/x/people', peopleLeaf)
  try {
    const footer = () => container.querySelector('[role=status]')!.textContent
    const names = () => [...container.querySelectorAll('tbody tr')].map((r) => r.querySelector('td')!.firstElementChild!.firstElementChild!.textContent)
    expect(footer()).toBe('4 people')
    const search = container.querySelector('input[type=search]') as HTMLInputElement
    const role = container.querySelector('select') as HTMLSelectElement
    const set = (el: HTMLInputElement | HTMLSelectElement, value: string) => act(async () => {
      const proto = el instanceof HTMLSelectElement ? HTMLSelectElement.prototype : HTMLInputElement.prototype
      Object.getOwnPropertyDescriptor(proto, 'value')!.set!.call(el, value)
      el.dispatchEvent(new Event(el instanceof HTMLSelectElement ? 'change' : 'input', { bubbles: true }))
    })
    await set(role, 'r1')
    expect(names()).toEqual(['Ana', 'Cy'])
    expect(footer()).toBe('2 of 4 people')
    await set(search, 'CY@ACME')
    expect(names()).toEqual(['Cy'])
    expect(footer()).toBe('1 of 4 people')
    // Counts follow search and role, not the chip.
    expect(named(container, 'button', 'Invited 1')).toBeDefined()
    await click(named(container, 'button', 'Expired 0'))
    expect(names()).toEqual([])
    await set(search, '')
    await set(role, '')
    expect(names()).toEqual(['Di'])
    expect(footer()).toBe('1 of 4 people')
  } finally {
    await cleanup()
  }
})

it('toggles a status chip, links members, and shows progress and invites as text', async () => {
  load(fixture)
  const { container, cleanup } = await renderAt('/org/x/people', peopleLeaf)
  try {
    const chip = named(container, 'button', 'Active 1')
    expect(chip.getAttribute('aria-pressed')).toBe('false')
    await click(chip)
    expect(chip.getAttribute('aria-pressed')).toBe('true')
    await click(chip)
    expect(chip.getAttribute('aria-pressed')).toBe('false')

    const row = (name: string) => [...container.querySelectorAll('tbody tr')].find((r) => r.textContent!.includes(name))!
    expect(row('Ana').querySelector('a')!.getAttribute('href')).toBe('/org/x/people/u1')
    expect(row('Ana').textContent).toContain('42% of 85% benchmark')
    expect(row('Ana').textContent).toContain('Day 9 of 30')
    expect(row('Ben').textContent).toContain('Proficient in 21 days')
    expect(row('Cy').querySelector('a')).toBeNull()
    expect(row('Cy').textContent).toContain('Not joined')
    expect(row('Cy').textContent).toContain('Link expires Nov 9')
    expect(row('Di').textContent).toContain('Link expired Nov 9')
    expect(container.querySelectorAll('th button, [aria-sort]')).toHaveLength(0)
  } finally {
    await cleanup()
  }
})

it('shows only a card with an Invite people button when nobody is invited', async () => {
  load([])
  const { container, cleanup } = await renderAt('/org/x/people', peopleLeaf)
  try {
    expect(container.textContent).toContain('No one invited yet.')
    expect(named(container, 'button', 'Invite people')).toBeDefined()
    expect(container.querySelector('table')).toBeNull()
  } finally {
    await cleanup()
  }
})

const overviewLeaf = {
  path: '/',
  loader: indexRoute.options.loader as (ctx: { params: { slug: string } }) => ReturnType<typeof getOrgOverview>,
  component: indexRoute.options.component,
  pendingComponent: indexRoute.options.pendingComponent,
  errorComponent: indexRoute.options.errorComponent,
}
const training = { employees: 4, proficientEmployees: 1, daysToProficiency: null, criticalErrorsThisWeek: 2, documentsToReview: 6, firstProficientUserId: 'u1', openErrorUserId: null }
const noTraining = { ...training, employees: 0, proficientEmployees: 0, criticalErrorsThisWeek: 0, documentsToReview: 0, firstProficientUserId: null }
const role = { id: 'r1', name: 'Cashier', benchmark: 0.85, onboardingDays: 30, topicId: 't1', topicStatus: 'ready', people: 3, documents: 2, conceptsReady: 24, conceptsTotal: 24, preparing: false }
const building = (ready: number) => ({ ...role, id: 'r2', name: 'Barista', topicId: 't2', topicStatus: 'generating', onboardingDays: 1, documents: 1, conceptsReady: ready, conceptsTotal: 31, preparing: ready < 31 })
const overview = (o: Record<string, unknown>) => ({ name: 'Acme', slug: 'x', readOnly: false, nextStep: null, roles: [role], training, ...o }) as never
const hrefs = (c: Element) => Object.fromEntries([...c.querySelectorAll('main a')].map((a) => [a.textContent, a.getAttribute('href')]))

it('shows the figures, role table and next step on the overview', async () => {
  vi.mocked(getOrgOverview).mockResolvedValue(overview({
    roles: [role, { ...building(9), conceptsTotal: 24 }],
    nextStep: { unreviewed: 12, documentTitle: 'Opening SOP', roleId: 'r1', topicId: 't1' },
  }))
  const { container, cleanup } = await renderAt('/org/x', overviewLeaf)
  try {
    expect(container.querySelector('h1')!.textContent).toBe('Overview')
    const text = container.textContent!
    expect(text).toContain('Employees4')
    expect(text).toContain('Avg. days to proficiency—No data yet')
    expect(text).toContain('Next step: review 12 new questions from Opening SOP.')
    const links = hrefs(container)
    expect(links['Review questions']).toBe('/org/x/questions?role=r1')
    expect(links['Cashier']).toBe('/org/x/roles/r1')
    expect(links['All roles']).toBe('/org/x/roles')
    expect(links['Avg. days to proficiency—No data yet']).toBe('/org/x/people/u1')
    expect(links['Critical-step errors this week2']).toBeUndefined()
    const rows = [...container.querySelectorAll('tbody tr')].map((r) => r.textContent)
    expect(rows[0]).toContain('Ready')
    expect(rows[0]).toContain('85%')
    expect(rows[0]).toContain('30 days')
    expect(rows[1]).toContain('Preparing training')
    expect(rows[1]).toContain('9 of 24 concepts')
    expect(rows[1]).toContain('1 day')
  } finally {
    await cleanup()
  }
})

it.each([
  ['a role without documents', [{ ...role, topicStatus: 'draft', documents: 0 }], 'Cashier has no documents yet', 'Upload SOP', '/org/x/roles/r1'],
  ['no roles', [], 'Create your first job role.', 'Create your first job role.', '/org/x/roles'],
])('guides the first step on an empty overview with %s', async (_name, roles, copy, link, href) => {
  vi.mocked(getOrgOverview).mockResolvedValue(overview({ roles, training: noTraining }))
  const { container, cleanup } = await renderAt('/org/x', overviewLeaf)
  try {
    expect(container.querySelector('h2#overview-empty')!.textContent).toBe('Add your first SOP')
    expect(container.textContent).toContain(copy)
    expect(hrefs(container)[link]).toBe(href)
    expect(container.textContent).not.toContain('Employees')
  } finally {
    await cleanup()
  }
})

it('announces build progress politely in steps of five, and the end', async () => {
  let ready = 12
  vi.mocked(getOrgOverview).mockImplementation(async () => overview({ roles: [building(ready)], training: noTraining }))
  const { container, cleanup } = await renderAt('/org/x', overviewLeaf)
  try {
    const status = () => container.querySelector('p[role="status"]')!.textContent
    expect(container.querySelector('h2#overview-preparing')!.textContent).toBe('Preparing Barista training')
    expect(container.querySelector('[role="progressbar"]')!.getAttribute('aria-valuetext')).toBe('12 of 31 concepts ready')
    expect(status()).toBe('')
    const hrefsNow = hrefs(container)
    expect(hrefsNow['Invite people']).toBe('/org/x/people')
    expect(hrefsNow['Watch the build']).toBe('/org/x/roles/r2')
    for (const [next, said] of [[14, ''], [15, '15 of 31 concepts ready'], [19, '15 of 31 concepts ready'], [31, '31 of 31 concepts ready.']] as const) {
      ready = next
      await act(async () => { await refresh() })
      expect(status()).toBe(said)
    }
  } finally {
    await cleanup()
  }
})

it.each([
  ['a figures state', { roles: [role], nextStep: { unreviewed: 1, documentTitle: 'Doc', roleId: 'r1', topicId: 't1' } }],
  ['an empty state', { roles: [{ ...role, topicStatus: 'draft', documents: 0 }], training: noTraining }],
  ['a preparing state', { roles: [building(3)], training: noTraining }],
])('hides every action staff cannot use on the read-only overview (%s)', async (_name, data) => {
  vi.mocked(getOrgOverview).mockResolvedValue(overview({ ...data, readOnly: true }))
  const { container, cleanup } = await renderAt('/org/x', overviewLeaf)
  try {
    const labels = Object.keys(hrefs(container))
    for (const gone of ['Review questions', 'Upload SOP', 'Invite people', 'Watch the build', 'All roles', 'Cashier', 'Barista']) expect(labels).not.toContain(gone)
    expect(container.textContent).not.toContain('Next step')
    expect(container.textContent).toMatch(/Cashier|Barista/)
  } finally {
    await cleanup()
  }
})

it('focuses the invalid field on the invite form and ties its message to it', async () => {
  load(fixture)
  Object.assign(globalThis, { IS_REACT_ACT_ENVIRONMENT: true })
  vi.mocked(getSessionFn).mockImplementation(async () => ({ user: { id: 'u', name: 'U', isAnonymous: false, role: 'user' }, facebookEnabled: false, needsDisclosure: false, companyMember: false, adminCompanies: [] }))
  const rootRoute = createRootRoute({ beforeLoad: appRootRoute.options.beforeLoad, loader: appRootRoute.options.loader, component: Outlet })
  const org = createRoute({ getParentRoute: () => rootRoute, path: '/org/$slug', beforeLoad: orgRoute.options.beforeLoad, loader: orgRoute.options.loader as (ctx: { params: { slug: string } }) => unknown, errorComponent: orgRoute.options.errorComponent, component: orgRoute.options.component })
  const people = createRoute({ getParentRoute: () => org, path: '/people', loader: peopleRoute.options.loader as (ctx: { params: { slug: string } }) => ReturnType<typeof getPeople>, component: peopleRoute.options.component })
  const router = createRouter({ routeTree: rootRoute.addChildren([org.addChildren([people])]), history: createMemoryHistory({ initialEntries: ['/org/x/people'] }) })
  const container = document.createElement('div')
  document.body.appendChild(container)
  const root = createRoot(container)
  const field = (id: string) => document.querySelector<HTMLInputElement>('#' + id)!
  const type = (id: string, value: string) => act(async () => {
    Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value')!.set!.call(field(id), value)
    field(id).dispatchEvent(new Event('input', { bubbles: true }))
  })
  const submit = () => act(async () => { document.querySelector('form')!.requestSubmit() })
  const message = (id: string) => document.getElementById(field(id).getAttribute('aria-describedby')!)?.textContent
  try {
    await act(async () => { await router.load(); root.render(<RouterProvider router={router} />) })
    await click(named(container, 'button', 'Invite people'))
    expect(document.querySelector('[role=dialog]')!.textContent).toContain('Invite people')
    inviteMember.mockResolvedValueOnce({ error: { message: 'Could not create the invite' } } as never)
    await type('name', 'Sam')
    await type('email', 'a@b.co')
    await submit()
    expect(document.body.textContent).toContain('Could not create the invite')
    inviteMember.mockClear()
    await type('name', '   ')
    await submit()
    expect(document.body.textContent).not.toContain('Could not create the invite')
    expect(field('name').getAttribute('aria-invalid')).toBe('true')
    expect(message('name')).toBe('Enter a name')
    expect(document.activeElement).toBe(field('name'))
    expect(inviteMember).not.toHaveBeenCalled()

    inviteMember.mockResolvedValue({ error: { code: 'USER_IS_ALREADY_INVITED_TO_THIS_ORGANIZATION', message: 'User is already invited to this organization' } } as never)
    await type('name', 'Sam')
    await submit()
    expect(inviteMember).toHaveBeenCalledTimes(1)
    expect(field('name').getAttribute('aria-invalid')).toBeNull()
    expect(field('email').getAttribute('aria-invalid')).toBe('true')
    expect(message('email')).toBe('User is already invited to this organization')
    expect(document.activeElement).toBe(field('email'))

    inviteMember.mockResolvedValue({ data: { id: 'i9' }, error: null } as never)
    await type('email', 'new@b.co')
    await submit()
    await vi.waitFor(() => expect(document.querySelector('[role=dialog]')).toBeNull())
  } finally {
    await act(async () => root.unmount())
    container.remove()
    delete (globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT
  }
})
