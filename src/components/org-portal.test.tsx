// @vitest-environment happy-dom
import { act } from 'react'
import { createRoot } from 'react-dom/client'
import { createMemoryHistory, createRootRoute, createRoute, createRouter, Outlet, RouterProvider } from '@tanstack/react-router'
import { expect, it, vi } from 'vitest'
import { Route as appRootRoute } from '@/routes/__root'
import { Route as orgRoute } from '@/routes/org.$slug'
import { Route as peopleRoute } from '@/routes/org.$slug.people'
import { Route as signInRoute } from '@/routes/sign-in'
import { authClient } from '@/lib/auth-client'
import { getPeople } from '@/server/org'
import { getSessionFn } from '@/server/session-fn'

vi.mock('@/server/org', () => ({ getPeople: vi.fn() }))
vi.mock('@/lib/auth-client', () => ({ authClient: { organization: { inviteMember: vi.fn() } } }))
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

it('focuses the invalid field on the invite form and ties its message to it', async () => {
  vi.mocked(getPeople).mockResolvedValue({ id: 'org', name: 'Acme', slug: 'x', baseUrl: 'http://localhost', roles: [{ id: 'r1', name: 'Cashier' }], members: [], readOnly: false, invites: [] } as never)
  Object.assign(globalThis, { IS_REACT_ACT_ENVIRONMENT: true })
  vi.mocked(getSessionFn).mockImplementation(async () => ({ user: { id: 'u', name: 'U', isAnonymous: false, role: 'user' }, facebookEnabled: false, needsDisclosure: false, adminCompanies: [] }))
  const invite = vi.mocked(authClient.organization.inviteMember)
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
    invite.mockResolvedValueOnce({ error: { message: 'Could not create the invite' } } as never)
    await type('name', 'Sam')
    await type('email', 'a@b.co')
    await submit()
    expect(container.textContent).toContain('Could not create the invite')
    invite.mockClear()
    await type('name', '   ')
    await submit()
    expect(container.textContent).not.toContain('Could not create the invite')
    expect(field('name').getAttribute('aria-invalid')).toBe('true')
    expect(message('name')).toBe('Enter a name')
    expect(document.activeElement).toBe(field('name'))
    expect(invite).not.toHaveBeenCalled()

    invite.mockResolvedValue({ error: { code: 'USER_IS_ALREADY_INVITED_TO_THIS_ORGANIZATION', message: 'User is already invited to this organization' } } as never)
    await type('name', 'Sam')
    await submit()
    expect(invite).toHaveBeenCalledTimes(1)
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
