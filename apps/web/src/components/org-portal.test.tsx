// @vitest-environment happy-dom
import { act } from 'react'
import { createRoot } from 'react-dom/client'
import { createMemoryHistory, createRootRoute, createRoute, createRouter, Outlet, RouterProvider } from '@tanstack/react-router'
import { expect, it, vi } from 'vitest'
import { Route as appRootRoute } from '@/routes/__root'
import { Route as orgRoute } from '@/routes/org.$slug'
import { Route as indexRoute } from '@/routes/org.$slug.index'
import { Route as peopleRoute } from '@/routes/org.$slug.people'
import { Route as signInRoute } from '@/routes/sign-in'
import { getOrgOverview, getPeople } from '@/server/org'
import { getSessionFn } from '@/server/session-fn'

vi.mock('@/server/org', () => ({ getPeople: vi.fn(), getOrgOverview: vi.fn() }))
const { cancelInvitation, inviteMember } = vi.hoisted(() => ({ cancelInvitation: vi.fn(), inviteMember: vi.fn() }))
vi.mock('@/lib/auth-client', () => ({ authClient: { organization: { cancelInvitation, inviteMember } } }))
vi.mock('@/server/session-fn', () => ({ getSessionFn: vi.fn() }))
vi.mock('@/server/latest-topic', () => ({ getLatestTopicIdFn: async () => null }))
vi.mock('@/server/org-settings', () => ({ getCompanyBranding: async () => null }))
vi.mock('@/components/credentials-form', () => ({ CredentialsForm: ({ onDone }: { onDone: () => void }) => <button onClick={onDone}>Sign in</button> }))

it('sends signed-out visitors on a portal page to sign-in and back after login', async () => {
  vi.mocked(getPeople).mockResolvedValue({ id: 'org', name: 'Acme', slug: 'x', baseUrl: 'http://localhost', roles: [], members: [], readOnly: false, invites: [] } as never)
  Object.assign(globalThis, { IS_REACT_ACT_ENVIRONMENT: true })
  let user: { id: string; name: string; isAnonymous: boolean; role: string } | null = null
  vi.mocked(getSessionFn).mockImplementation(async () => ({ user, facebookEnabled: false, needsDisclosure: false, adminCompanies: [] }))
  const rootRoute = createRootRoute({ beforeLoad: appRootRoute.options.beforeLoad, loader: appRootRoute.options.loader, component: Outlet })
  const org = createRoute({ getParentRoute: () => rootRoute, path: '/org/$slug', beforeLoad: orgRoute.options.beforeLoad, component: orgRoute.options.component })
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

it('shows the company nav on portal pages, trimmed for Learn Quiz staff', async () => {
  vi.mocked(getPeople).mockResolvedValue({ id: 'org', name: 'Acme', slug: 'x', baseUrl: 'http://localhost', roles: [], members: [], readOnly: false, invites: [] } as never)
  Object.assign(globalThis, { IS_REACT_ACT_ENVIRONMENT: true })
  let role = 'user'
  vi.mocked(getSessionFn).mockImplementation(async () => ({ user: { id: 'u', name: 'U', isAnonymous: false, role }, facebookEnabled: false, needsDisclosure: false, adminCompanies: [] }))
  const rootRoute = createRootRoute({ beforeLoad: appRootRoute.options.beforeLoad, loader: appRootRoute.options.loader, component: Outlet })
  const org = createRoute({ getParentRoute: () => rootRoute, path: '/org/$slug', beforeLoad: orgRoute.options.beforeLoad, component: orgRoute.options.component })
  const index = createRoute({ getParentRoute: () => org, path: '/', component: () => <p>Overview page</p> })
  const people = createRoute({ getParentRoute: () => org, path: '/people', loader: peopleRoute.options.loader as (ctx: { params: { slug: string } }) => ReturnType<typeof getPeople>, component: peopleRoute.options.component })
  const router = createRouter({ routeTree: rootRoute.addChildren([org.addChildren([index, people])]), history: createMemoryHistory({ initialEntries: ['/org/x/people'] }) })
  const container = document.createElement('div')
  document.body.appendChild(container)
  const root = createRoot(container)
  const links = () => [...container.querySelectorAll<HTMLAnchorElement>('nav[aria-label="Company"] a')]
  try {
    await act(async () => { await router.load(); root.render(<RouterProvider router={router} />) })
    expect(links().map((a) => [a.textContent, a.getAttribute('href')])).toEqual([
      ['Overview', '/org/x'], ['Roles', '/org/x/roles'], ['People', '/org/x/people'], ['Question review', '/org/x/questions'], ['Settings', '/org/x/settings'],
    ])
    expect(links().filter((a) => a.getAttribute('aria-current') === 'page').map((a) => a.textContent)).toEqual(['People'])
    await act(async () => { links()[0].click() })
    await vi.waitFor(() => expect(router.state.location.pathname).toBe('/org/x'))
    expect(links()[0].getAttribute('aria-current')).toBe('page')

    role = 'admin'
    await act(async () => { await router.invalidate() })
    expect(links().map((a) => a.textContent)).toEqual(['Overview', 'People'])
  } finally {
    await act(async () => root.unmount())
    container.remove()
    delete (globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT
  }
})

it('asks before revoking an invite and keeps it pending when dismissed', async () => {
  const invite = { id: 'inv1', name: 'Ana', email: 'ana@acme.test', jobRole: 'Cashier', expired: false }
  let invites = [invite]
  vi.mocked(getPeople).mockImplementation(async () => ({ id: 'org', name: 'Acme', slug: 'x', baseUrl: 'http://localhost', roles: [], members: [], readOnly: false, invites }) as never)
  cancelInvitation.mockImplementation(async () => { invites = []; return { error: null } })
  Object.assign(globalThis, { IS_REACT_ACT_ENVIRONMENT: true })
  vi.mocked(getSessionFn).mockResolvedValue({ user: { id: 'u', name: 'U', isAnonymous: false, role: 'user' }, facebookEnabled: false, needsDisclosure: false, adminCompanies: [] } as never)
  const rootRoute = createRootRoute({ beforeLoad: appRootRoute.options.beforeLoad, loader: appRootRoute.options.loader, component: Outlet })
  const org = createRoute({ getParentRoute: () => rootRoute, path: '/org/$slug', beforeLoad: orgRoute.options.beforeLoad, component: orgRoute.options.component })
  const people = createRoute({ getParentRoute: () => org, path: '/people', loader: peopleRoute.options.loader as (ctx: { params: { slug: string } }) => ReturnType<typeof getPeople>, component: peopleRoute.options.component })
  const router = createRouter({ routeTree: rootRoute.addChildren([org.addChildren([people])]), history: createMemoryHistory({ initialEntries: ['/org/x/people'] }) })
  const container = document.createElement('div')
  document.body.appendChild(container)
  const root = createRoot(container)
  const button = (scope: Element, name: string) => [...scope.querySelectorAll('button')].find((b) => b.textContent === name)
  const dialog = () => document.querySelector('[role="dialog"]')
  try {
    await act(async () => { await router.load(); root.render(<RouterProvider router={router} />) })
    await act(async () => { button(container, 'Revoke invite')!.click() })
    expect(dialog()!.textContent).toContain('The link stops working for ana@acme.test.')
    await act(async () => { button(dialog()!, 'Keep invite')!.click() })
    expect(dialog()).toBeNull()
    expect(cancelInvitation).not.toHaveBeenCalled()
    expect(container.textContent).toContain('ana@acme.test')

    await act(async () => { button(container, 'Revoke invite')!.click() })
    await act(async () => { button(dialog()!, 'Revoke invite')!.click() })
    await vi.waitFor(() => expect(container.textContent).not.toContain('ana@acme.test'))
    expect(cancelInvitation).toHaveBeenCalledTimes(1)
    expect(cancelInvitation).toHaveBeenCalledWith({ invitationId: 'inv1' })
  } finally {
    await act(async () => root.unmount())
    container.remove()
    delete (globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT
  }
})

async function renderAt(path: string, leaf: { path: string; loader: (ctx: { params: { slug: string } }) => unknown; component: typeof peopleRoute.options.component }) {
  Object.assign(globalThis, { IS_REACT_ACT_ENVIRONMENT: true })
  vi.mocked(getSessionFn).mockResolvedValue({ user: { id: 'u', name: 'U', isAnonymous: false, role: 'user' }, facebookEnabled: false, needsDisclosure: false, adminCompanies: [] } as never)
  const rootRoute = createRootRoute({ beforeLoad: appRootRoute.options.beforeLoad, loader: appRootRoute.options.loader, component: Outlet })
  const org = createRoute({ getParentRoute: () => rootRoute, path: '/org/$slug', beforeLoad: orgRoute.options.beforeLoad, component: orgRoute.options.component })
  const router = createRouter({ routeTree: rootRoute.addChildren([org.addChildren([createRoute({ getParentRoute: () => org, ...leaf })])]), history: createMemoryHistory({ initialEntries: [path] }) })
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

it('shows status, progress toward benchmark and last active for each person', async () => {
  const training = { stage: 'onboarding', progress: 0.5, daysToProficiency: null, criticalConfidentErrors: 0 }
  vi.mocked(getPeople).mockResolvedValue({
    id: 'org', name: 'Acme', slug: 'x', baseUrl: 'http://localhost', roles: [], readOnly: false,
    invites: [{ id: 'inv1', name: 'Ana', email: 'ana@acme.test', jobRole: 'Cashier', expiresAt: 0, expired: false }],
    members: [
      { id: 'm1', userId: 'u1', name: 'Ben', email: 'ben@acme.test', role: 'member', jobRole: 'Cashier', lastActiveAt: Date.UTC(2026, 2, 5), training },
      { id: 'm2', userId: 'u2', name: 'Cy', email: 'cy@acme.test', role: 'member', jobRole: 'Cashier', lastActiveAt: null, training: { ...training, stage: 'proficient', progress: 1 } },
    ],
  } as never)
  const { container, cleanup } = await renderAt('/org/x/people', { path: '/people', loader: peopleRoute.options.loader as (ctx: { params: { slug: string } }) => ReturnType<typeof getPeople>, component: peopleRoute.options.component })
  try {
    const items = [...container.querySelectorAll('li')].map((li) => li.textContent)
    expect(items.some((t) => t!.includes('Ana') && t!.includes('Invited'))).toBe(true)
    const ben = items.find((t) => t!.includes('Ben'))!
    expect(ben).toContain('Still learning')
    expect(ben).toContain('50% of benchmark')
    expect(ben).toContain('Last active: 5 Mar 2026')
    const cy = items.find((t) => t!.includes('Cy'))!
    expect(cy).toContain('Proficient')
    expect(cy).toContain('Last active: -')
    expect(container.querySelector('progress[aria-label="Progress toward benchmark"]')).not.toBeNull()
  } finally {
    await cleanup()
  }
})

it('shows the training figures on the overview, with a dash for unknown values', async () => {
  vi.mocked(getOrgOverview).mockResolvedValue({
    id: 'org', name: 'Acme', slug: 'x', readOnly: false, roles: [{ id: 'r1', name: 'Cashier' }],
    training: { employees: 4, proficientEmployees: 1, daysToProficiency: null, criticalErrorsThisWeek: 2, documentsToReview: null },
  } as never)
  const { container, cleanup } = await renderAt('/org/x', { path: '/', loader: indexRoute.options.loader as (ctx: { params: { slug: string } }) => ReturnType<typeof getOrgOverview>, component: indexRoute.options.component })
  try {
    const figures = Object.fromEntries([...container.querySelectorAll('dl > div')].map((d) => [d.querySelector('dt')!.textContent, d.querySelector('dd')!.textContent]))
    expect(figures).toEqual({
      Employees: '4', Proficient: '1', 'Average days to proficiency': '-', 'Critical-step errors this week': '2', 'Documents waiting for review': '-',
    })
  } finally {
    await cleanup()
  }
})

it('tells an admin to invite the first employee when the company has no members', async () => {
  vi.mocked(getPeople).mockResolvedValue({ id: 'org', name: 'Acme', slug: 'x', baseUrl: 'http://localhost', roles: [], readOnly: false, invites: [], members: [] } as never)
  const { container, cleanup } = await renderAt('/org/x/people', { path: '/people', loader: peopleRoute.options.loader as (ctx: { params: { slug: string } }) => ReturnType<typeof getPeople>, component: peopleRoute.options.component })
  try {
    expect(container.textContent).toContain('Invite your first employee.')
  } finally {
    await cleanup()
  }
})

it('links an empty job role list on the overview to the roles page', async () => {
  vi.mocked(getOrgOverview).mockResolvedValue({
    id: 'org', name: 'Acme', slug: 'x', readOnly: false, roles: [],
    training: { employees: 0, proficientEmployees: 0, daysToProficiency: null, criticalErrorsThisWeek: 0, documentsToReview: 0 },
  } as never)
  const { container, cleanup } = await renderAt('/org/x', { path: '/', loader: indexRoute.options.loader as (ctx: { params: { slug: string } }) => ReturnType<typeof getOrgOverview>, component: indexRoute.options.component })
  try {
    const link = [...container.querySelectorAll('main a')].find((a) => a.textContent === 'Create your first job role.')
    expect(link?.getAttribute('href')).toBe('/org/x/roles')
  } finally {
    await cleanup()
  }
})

it('focuses the invalid field on the invite form and ties its message to it', async () => {
  vi.mocked(getPeople).mockResolvedValue({ id: 'org', name: 'Acme', slug: 'x', baseUrl: 'http://localhost', roles: [{ id: 'r1', name: 'Cashier' }], members: [], readOnly: false, invites: [] } as never)
  Object.assign(globalThis, { IS_REACT_ACT_ENVIRONMENT: true })
  vi.mocked(getSessionFn).mockImplementation(async () => ({ user: { id: 'u', name: 'U', isAnonymous: false, role: 'user' }, facebookEnabled: false, needsDisclosure: false, adminCompanies: [] }))
  const rootRoute = createRootRoute({ beforeLoad: appRootRoute.options.beforeLoad, loader: appRootRoute.options.loader, component: Outlet })
  const org = createRoute({ getParentRoute: () => rootRoute, path: '/org/$slug', beforeLoad: orgRoute.options.beforeLoad, component: orgRoute.options.component })
  const people = createRoute({ getParentRoute: () => org, path: '/people', loader: peopleRoute.options.loader as (ctx: { params: { slug: string } }) => ReturnType<typeof getPeople>, component: peopleRoute.options.component })
  const router = createRouter({ routeTree: rootRoute.addChildren([org.addChildren([people])]), history: createMemoryHistory({ initialEntries: ['/org/x/people'] }) })
  const container = document.createElement('div')
  document.body.appendChild(container)
  const root = createRoot(container)
  const field = (id: string) => container.querySelector<HTMLInputElement>('#' + id)!
  const type = (id: string, value: string) => act(async () => {
    Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value')!.set!.call(field(id), value)
    field(id).dispatchEvent(new Event('input', { bubbles: true }))
  })
  const submit = () => act(async () => { container.querySelector('form')!.requestSubmit() })
  const message = (id: string) => document.getElementById(field(id).getAttribute('aria-describedby')!)?.textContent
  try {
    await act(async () => { await router.load(); root.render(<RouterProvider router={router} />) })
    inviteMember.mockResolvedValueOnce({ error: { message: 'Could not create the invite' } } as never)
    await type('name', 'Sam')
    await type('email', 'a@b.co')
    await submit()
    expect(container.textContent).toContain('Could not create the invite')
    inviteMember.mockClear()
    await type('name', '   ')
    await submit()
    expect(container.textContent).not.toContain('Could not create the invite')
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
  } finally {
    await act(async () => root.unmount())
    container.remove()
    delete (globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT
  }
})

it('brings a new invite\'s Copy link and its expanded QR code into view', async () => {
  const old = { id: 'inv0', name: 'Bo', email: 'bo@acme.test', jobRole: 'Cashier', expired: false }
  let invites = [old]
  vi.mocked(getPeople).mockImplementation(async () => ({ id: 'org', name: 'Acme', slug: 'x', baseUrl: 'http://localhost', roles: [{ id: 'r1', name: 'Cashier' }], members: [], readOnly: false, invites }) as never)
  inviteMember.mockReset().mockImplementation(async () => { invites = [{ id: 'inv1', name: 'Sam', email: 'sam@acme.test', jobRole: 'Cashier', expired: false }, old]; return { data: { id: 'inv1' }, error: null } })
  const scrolled: Element[] = []
  const scroll = vi.spyOn(Element.prototype, 'scrollIntoView').mockImplementation(function (this: Element) { scrolled.push(this) })
  Object.assign(globalThis, { IS_REACT_ACT_ENVIRONMENT: true })
  vi.mocked(getSessionFn).mockImplementation(async () => ({ user: { id: 'u', name: 'U', isAnonymous: false, role: 'user' }, facebookEnabled: false, needsDisclosure: false, adminCompanies: [] }))
  const rootRoute = createRootRoute({ beforeLoad: appRootRoute.options.beforeLoad, loader: appRootRoute.options.loader, component: Outlet })
  const org = createRoute({ getParentRoute: () => rootRoute, path: '/org/$slug', beforeLoad: orgRoute.options.beforeLoad, component: orgRoute.options.component })
  const people = createRoute({ getParentRoute: () => org, path: '/people', loader: peopleRoute.options.loader as (ctx: { params: { slug: string } }) => ReturnType<typeof getPeople>, component: peopleRoute.options.component })
  const router = createRouter({ routeTree: rootRoute.addChildren([org.addChildren([people])]), history: createMemoryHistory({ initialEntries: ['/org/x/people'] }) })
  const container = document.createElement('div')
  document.body.appendChild(container)
  const root = createRoot(container)
  const field = (id: string) => container.querySelector<HTMLInputElement>('#' + id)!
  const type = (id: string, value: string) => act(async () => {
    Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value')!.set!.call(field(id), value)
    field(id).dispatchEvent(new Event('input', { bubbles: true }))
  })
  const row = (email: string) => [...container.querySelectorAll('li')].find((li) => li.textContent?.includes(email))!
  const button = (scope: Element, name: string) => [...scope.querySelectorAll('button')].find((b) => b.textContent === name)!
  try {
    await act(async () => { await router.load(); root.render(<RouterProvider router={router} />) })
    expect(scrolled).toEqual([])
    await type('name', 'Sam')
    await type('email', 'sam@acme.test')
    await act(async () => { container.querySelector('form')!.requestSubmit() })
    await vi.waitFor(() => expect(document.activeElement).toBe(button(row('sam@acme.test'), 'Copy link')))
    expect(scrolled).toEqual([row('sam@acme.test')])

    await act(async () => { button(row('sam@acme.test'), 'QR code').click() })
    expect(scrolled.at(-1)).toBe(row('sam@acme.test').querySelector('img[alt="QR code for the invite link of Sam"]'))
  } finally {
    scroll.mockRestore()
    await act(async () => root.unmount())
    container.remove()
    delete (globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT
  }
})
