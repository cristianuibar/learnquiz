// @vitest-environment happy-dom
import { act } from 'react'
import { createRoot } from 'react-dom/client'
import { createMemoryHistory, createRootRoute, createRoute, createRouter, Outlet, RouterProvider } from '@tanstack/react-router'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { Route as appRootRoute } from '@/routes/__root'
import { Route as orgRoute } from '@/routes/org.$slug'
import { Route as roleRoute } from '@/routes/org.$slug.roles_.$roleId'
import { Route as personRoute } from '@/routes/org.$slug.people_.$id'
import { Route as signInRoute } from '@/routes/sign-in'
import { getRoleDetail } from '@/server/role-detail'
import { getAccessContext, getPortalShell } from '@/server/org-shell'
import { getProfile } from '@/server/profile'
import { getSessionFn } from '@/server/session-fn'

const { signOut } = vi.hoisted(() => ({ signOut: vi.fn() }))
vi.mock('@/lib/auth-client', () => ({ authClient: { signOut } }))
vi.mock('@/server/org-shell', () => ({ getPortalShell: vi.fn(), getAccessContext: vi.fn() }))
vi.mock('@/server/role-detail', () => ({ getRoleDetail: vi.fn(), updateRoleConcept: vi.fn() }))
vi.mock('@/server/curriculum', () => ({ generateRoleCurriculum: vi.fn(), retryConceptGeneration: vi.fn() }))
vi.mock('@/server/role-documents', () => ({ uploadRoleDocument: vi.fn(), retireRoleDocument: vi.fn() }))
vi.mock('@/server/profile', () => ({ getProfile: vi.fn(), getMemberFlags: vi.fn(async () => []) }))
vi.mock('@/server/session-fn', () => ({ getSessionFn: vi.fn() }))
vi.mock('@/server/latest-topic', () => ({ getLatestTopicIdFn: async () => null }))
vi.mock('@/server/org-settings', () => ({ getCompanyBranding: async () => null }))
vi.mock('@/components/credentials-form', () => ({ CredentialsForm: () => <p>Credentials</p> }))

const shell = { orgId: 'org', name: 'Acme', slug: 'x', logoUrl: null, userName: 'Dana Whitaker', role: 'owner' as 'owner' | 'admin' | null, readOnly: false }
const status = (code: number) => Object.assign(new Error(code === 403 ? 'Only company admins can do this' : 'Not found'), { status: code })
type Loader = (ctx: { params: Record<string, string> }) => unknown

beforeEach(() => {
  vi.clearAllMocks()
  vi.mocked(getPortalShell).mockResolvedValue(shell)
})

async function renderAt(path: string) {
  Object.assign(globalThis, { IS_REACT_ACT_ENVIRONMENT: true })
  let user: { id: string; name: string; isAnonymous: boolean; role: string } | null = { id: 'u', name: 'U', isAnonymous: false, role: 'user' }
  vi.mocked(getSessionFn).mockImplementation(async () => ({ user, facebookEnabled: false, needsDisclosure: false, companyMember: false, adminCompanies: [] }))
  signOut.mockImplementation(async () => { user = null; return { data: { success: true }, error: null } })
  const rootRoute = createRootRoute({ beforeLoad: appRootRoute.options.beforeLoad, loader: appRootRoute.options.loader, component: Outlet })
  const org = createRoute({ getParentRoute: () => rootRoute, path: '/org/$slug', beforeLoad: orgRoute.options.beforeLoad, loader: orgRoute.options.loader as Loader, errorComponent: orgRoute.options.errorComponent, component: orgRoute.options.component })
  const leaf = (path: string, r: typeof roleRoute | typeof personRoute) =>
    createRoute({ getParentRoute: () => org, path, loader: r.options.loader as Loader, errorComponent: r.options.errorComponent, notFoundComponent: r.options.notFoundComponent, component: r.options.component })
  const signIn = createRoute({ getParentRoute: () => rootRoute, path: '/sign-in', validateSearch: signInRoute.options.validateSearch, beforeLoad: signInRoute.options.beforeLoad, component: signInRoute.options.component })
  const tree = rootRoute.addChildren([org.addChildren([leaf('/roles/$roleId', roleRoute), leaf('/people/$id', personRoute)]), signIn])
  const router = createRouter({ routeTree: tree, history: createMemoryHistory({ initialEntries: [path] }) })
  const container = document.createElement('div')
  document.body.appendChild(container)
  const root = createRoot(container)
  await act(async () => { await router.load(); root.render(<RouterProvider router={router} />) })
  return {
    router,
    container,
    cleanup: async () => {
      await act(async () => root.unmount())
      container.remove()
      delete (globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT
    },
  }
}

describe('permission denied', () => {
  it.each([
    ['a member of the company', { email: 'm@x.test', company: 'Acme', owner: 'Dana Whitaker' }, ["Acme's portal", 'Ask Dana Whitaker'], []],
    ['not a member', { email: 'm@x.test', company: null, owner: null }, ['Only owners and admins can open this portal.'], ['Acme', 'Dana Whitaker']],
  ])('tells someone who is %s why, without navigation, and offers another account', async (_who, access, shown, hidden) => {
    vi.mocked(getPortalShell).mockRejectedValue(status(403))
    vi.mocked(getAccessContext).mockResolvedValue(access)
    const path = '/org/x/roles/r1?tab=a'
    const { router, container, cleanup } = await renderAt(path)
    try {
      await vi.waitFor(() => expect(container.textContent).toContain('m@x.test'))
      expect(getAccessContext).toHaveBeenCalledWith({ data: { slug: 'x' } })
      const h1 = container.querySelector('h1')!
      expect(h1.textContent).toBe('No access to this portal')
      expect(document.activeElement).toBe(h1)
      for (const t of shown) expect(container.textContent).toContain(t)
      for (const t of hidden) expect(container.textContent).not.toContain(t)
      expect(container.querySelector('[role="navigation"], nav')).toBeNull()
      expect([...container.querySelectorAll('button')].map((b) => b.textContent)).toEqual(['Sign in with another account'])
      expect(router.state.location.pathname).toBe('/org/x/roles/r1')

      await act(async () => { container.querySelector('button')!.click() })
      await vi.waitFor(() => expect(router.state.location.pathname).toBe('/sign-in'))
      expect(signOut).toHaveBeenCalledTimes(1)
      expect(router.state.location.search).toEqual({ redirect: path })
    } finally {
      await cleanup()
    }
  })
})

describe('not found inside the portal', () => {
  it.each([
    ['role', '/org/x/roles/bad', getRoleDetail, 'Role not found', 'View roles', '/org/x/roles'],
    ['person', '/org/x/people/bad', getProfile, 'Person not found', 'View people', '/org/x/people'],
  ] as const)('shows %s not found with the nav kept and nothing marked current', async (_what, path, fn, title, list, listHref) => {
    vi.mocked(fn as (typeof getRoleDetail)).mockRejectedValue(status(404))
    const { container, cleanup } = await renderAt(path)
    try {
      const h1 = container.querySelector('h1')!
      expect(h1.textContent).toBe(title)
      expect(document.activeElement).toBe(h1)
      const link = (name: string) => [...container.querySelectorAll('a')].find((a) => a.textContent === name)
      expect(link('Go to Overview')?.getAttribute('href')).toBe('/org/x')
      expect(link(list)?.getAttribute('href')).toBe(listHref)
      const nav = container.querySelector('nav[aria-label="Acme portal"]')!
      expect(nav).not.toBeNull()
      expect(nav.querySelector('[aria-current]')).toBeNull()
      expect([...container.querySelectorAll('button')].map((b) => b.textContent)).not.toContain('Try again')
    } finally {
      await cleanup()
    }
  })
})
