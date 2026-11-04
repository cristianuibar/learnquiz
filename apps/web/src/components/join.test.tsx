// @vitest-environment happy-dom
import { act } from 'react'
import { createRoot } from 'react-dom/client'
import { createMemoryHistory, createRootRoute, createRoute, createRouter, RouterProvider } from '@tanstack/react-router'
import { beforeEach, expect, it, vi } from 'vitest'
import { Route as appRootRoute } from '@/routes/__root'
import { Route as joinRoute } from '@/routes/join.$invitationId'
import { getSessionFn } from '@/server/session-fn'

const { signUp, signOut, acceptInvitation, getInvite, social } = vi.hoisted(() => ({ signUp: vi.fn(), signOut: vi.fn(), acceptInvitation: vi.fn(), getInvite: vi.fn(), social: vi.fn() }))

vi.mock('@/lib/auth-client', () => ({ authClient: { signUp: { email: signUp }, signOut, signIn: { social }, organization: { acceptInvitation } } }))
vi.mock('@/server/session-fn', () => ({ getSessionFn: vi.fn() }))
vi.mock('@/server/org-settings', () => ({ getCompanyBranding: async () => null }))
vi.mock('@/server/latest-topic', () => ({ getLatestTopicIdFn: async () => null }))
vi.mock('@/server/org', () => ({ getInvite }))

beforeEach(() => vi.clearAllMocks())

const invite = { company: 'Acme', email: 'learner@example.test', name: 'Learner', status: 'pending', otherAccount: false, roleName: 'Warehouse picker', accent: null, logoUrl: null }

async function mount() {
  Object.assign(globalThis, { IS_REACT_ACT_ENVIRONMENT: true })
  const rootRoute = createRootRoute({
    beforeLoad: appRootRoute.options.beforeLoad,
    loader: appRootRoute.options.loader,
    component: appRootRoute.options.component,
  })
  const join = createRoute({
    getParentRoute: () => rootRoute,
    path: '/join/$invitationId',
    loader: joinRoute.options.loader,
    component: joinRoute.options.component,
    errorComponent: joinRoute.options.errorComponent,
  })
  const signIn = createRoute({ getParentRoute: () => rootRoute, path: '/sign-in', validateSearch: (search: Record<string, unknown>) => search, component: () => <p>Sign in page</p> })
  const today = createRoute({ getParentRoute: () => rootRoute, path: '/today', component: () => <p>Today page</p> })
  const router = createRouter({ routeTree: rootRoute.addChildren([join, signIn, today]), history: createMemoryHistory({ initialEntries: ['/join/invite'] }) })
  const container = document.createElement('div')
  document.body.appendChild(container)
  const root = createRoot(container)
  await act(async () => { await router.load(); root.render(<RouterProvider router={router} />) })
  const cleanup = async () => {
    await act(async () => root.unmount())
    container.remove()
    delete (globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT
  }
  return { router, container, cleanup }
}

it('keeps the signed-in join controls and error when accepting fails after sign-up', async () => {
  const session = { user: null, facebookEnabled: false, needsDisclosure: false, companyMember: false, adminCompanies: [] }
  vi.mocked(getSessionFn).mockResolvedValue(session)
  signUp.mockImplementation(async () => {
    vi.mocked(getSessionFn).mockResolvedValue({ ...session, user: { id: 'learner', name: 'Learner', isAnonymous: false } })
    return { error: null }
  })
  acceptInvitation.mockResolvedValue({ error: { message: 'Could not accept invitation' } })

  getInvite.mockResolvedValue(invite)
  const { container, cleanup } = await mount()
  try {
    expect(container.querySelector('button[type="submit"]')?.textContent).toBe('Create account')
    container.querySelector<HTMLInputElement>('#password')!.value = 'test-password'
    await act(async () => {
      container.querySelector('form')!.dispatchEvent(new Event('submit', { bubbles: true, cancelable: true }))
      await vi.waitFor(() => expect(acceptInvitation).toHaveBeenCalledWith({ invitationId: 'invite' }))
    })
    expect(container.querySelector('[role="alert"]')?.textContent).toBe('Could not accept invitation')
    const joinButton = [...container.querySelectorAll('button')].find((button) => button.textContent?.trim() === 'Join Acme')
    expect(joinButton?.disabled).toBe(false)
    expect(container.querySelector('form')).toBeNull()

    await act(async () => {
      joinButton!.click()
      await vi.waitFor(() => expect(acceptInvitation).toHaveBeenCalledTimes(2))
    })
    expect(container.querySelector('[role="alert"]')?.textContent).toBe('Could not accept invitation')
    expect(joinButton?.disabled).toBe(false)
    expect(signUp).toHaveBeenCalledTimes(1)
  } finally {
    await cleanup()
  }
})

it('offers to sign in as the invited address instead of joining from another account', async () => {
  vi.mocked(getSessionFn).mockResolvedValue({ user: { id: 'owner', name: 'Owner', isAnonymous: false }, facebookEnabled: false, needsDisclosure: false, companyMember: false, adminCompanies: [] })
  getInvite.mockResolvedValue({ ...invite, otherAccount: true })
  signOut.mockImplementation(async () => {
    vi.mocked(getSessionFn).mockResolvedValue({ user: null, facebookEnabled: false, needsDisclosure: false, companyMember: false, adminCompanies: [] })
    return { error: null }
  })
  const { router, container, cleanup } = await mount()
  try {
    const labels = [...container.querySelectorAll('button')].map((button) => button.textContent?.trim())
    expect(labels).toEqual(['Sign in as learner@example.test'])
    expect(container.textContent).toContain("You're signed in as Owner. This invite is for learner@example.test.")
    await act(async () => {
      container.querySelector('button')!.click()
      await vi.waitFor(() => expect(router.state.location.pathname).toBe('/sign-in'))
    })
    expect(signOut).toHaveBeenCalledTimes(1)
    expect(router.state.location.search).toEqual({ redirect: '/join/invite', email: 'learner@example.test' })
    expect(acceptInvitation).not.toHaveBeenCalled()
  } finally {
    await cleanup()
  }
})

it('re-enables the sign-in button and shows an error when sign-out is rejected offline', async () => {
  vi.mocked(getSessionFn).mockResolvedValue({ user: { id: 'owner', name: 'Owner', isAnonymous: false }, facebookEnabled: false, needsDisclosure: false, companyMember: false, adminCompanies: [] })
  getInvite.mockResolvedValue({ ...invite, otherAccount: true })
  signOut.mockRejectedValueOnce(new TypeError('Failed to fetch'))
  signOut.mockResolvedValueOnce({ error: null })
  const { router, container, cleanup } = await mount()
  try {
    const button = container.querySelector('button')!
    await act(async () => {
      button.click()
      await vi.waitFor(() => expect(signOut).toHaveBeenCalledTimes(1))
    })
    await vi.waitFor(() => expect(container.querySelector('[role="alert"]')?.textContent).toBe('Could not sign out'))
    expect(button.disabled).toBe(false)
    expect(router.state.location.pathname).toBe('/join/invite')

    await act(async () => {
      button.click()
      await vi.waitFor(() => expect(router.state.location.pathname).toBe('/sign-in'))
    })
    expect(signOut).toHaveBeenCalledTimes(2)
  } finally {
    await cleanup()
  }
})

it.each([
  { viewer: { id: 'learner', name: 'Learner', isAnonymous: false }, label: 'Continue to Today', path: '/today', search: {} },
  { viewer: null, label: 'Sign in as learner@example.test', path: '/sign-in', search: { redirect: '/today', email: 'learner@example.test' } },
])('leads $label from an invite that was already used', async ({ viewer, label, path, search }) => {
  vi.mocked(getSessionFn).mockResolvedValue({ user: viewer, facebookEnabled: false, needsDisclosure: false, companyMember: false, adminCompanies: [] })
  getInvite.mockResolvedValue({ ...invite, status: 'accepted' })
  const { router, container, cleanup } = await mount()
  try {
    expect(container.querySelector('h1')?.textContent).toBe('This invite was already used')
    const link = [...container.querySelectorAll('main a')].find((a) => a.textContent?.trim() === label) as HTMLAnchorElement
    await act(async () => {
      link.click()
      await vi.waitFor(() => expect(router.state.location.pathname).toBe(path))
    })
    expect(router.state.location.search).toEqual(search)
  } finally {
    await cleanup()
  }
})

it('enables the create button only from eight password characters', async () => {
  vi.mocked(getSessionFn).mockResolvedValue({ user: null, facebookEnabled: false, needsDisclosure: false, companyMember: false, adminCompanies: [] })
  getInvite.mockResolvedValue(invite)
  const { container, cleanup } = await mount()
  try {
    const input = container.querySelector<HTMLInputElement>('#password')!
    const cta = container.querySelector<HTMLButtonElement>('button[type="submit"]')!
    const set = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value')!.set!
    const type = async (value: string) => {
      await act(async () => {
        set.call(input, value)
        input.dispatchEvent(new Event('input', { bubbles: true }))
      })
    }
    await type('abcdefg')
    expect(cta.disabled).toBe(true)
    await type('abcdefgh')
    expect(cta.disabled).toBe(false)
  } finally {
    await cleanup()
  }
})

it.each([true, false])('shows Facebook sign-up only when enabled (%s)', async (facebookEnabled) => {
  vi.mocked(getSessionFn).mockResolvedValue({ user: null, facebookEnabled, needsDisclosure: false, companyMember: false, adminCompanies: [] })
  getInvite.mockResolvedValue(invite)
  const { container, cleanup } = await mount()
  try {
    const button = [...container.querySelectorAll('button')].find((b) => b.textContent?.trim() === 'Continue with Facebook')
    expect(!!button).toBe(facebookEnabled)
    if (button) {
      await act(async () => button.click())
      expect(social).toHaveBeenCalledWith({ provider: 'facebook', callbackURL: '/join/invite' })
    }
  } finally {
    await cleanup()
  }
})
