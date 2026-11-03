// @vitest-environment happy-dom
import { act } from 'react'
import { createRoot } from 'react-dom/client'
import { createMemoryHistory, createRootRoute, createRoute, createRouter, RouterProvider } from '@tanstack/react-router'
import { beforeEach, expect, it, vi } from 'vitest'
import { Route as appRootRoute } from '@/routes/__root'
import { Route as joinRoute } from '@/routes/join.$invitationId'
import { getSessionFn } from '@/server/session-fn'

const { signUp, signOut, acceptInvitation, getInvite } = vi.hoisted(() => ({ signUp: vi.fn(), signOut: vi.fn(), acceptInvitation: vi.fn(), getInvite: vi.fn() }))

vi.mock('@/lib/auth-client', () => ({ authClient: { signUp: { email: signUp }, signOut, organization: { acceptInvitation } } }))
vi.mock('@/server/session-fn', () => ({ getSessionFn: vi.fn() }))
vi.mock('@/server/org-settings', () => ({ getCompanyBranding: async () => null }))
vi.mock('@/server/latest-topic', () => ({ getLatestTopicIdFn: async () => null }))
vi.mock('@/server/org', () => ({ getInvite }))

beforeEach(() => vi.clearAllMocks())

const invite = { company: 'Acme', email: 'learner@example.test', name: 'Learner', status: 'pending', otherAccount: false }

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
  const router = createRouter({ routeTree: rootRoute.addChildren([join, signIn]), history: createMemoryHistory({ initialEntries: ['/join/invite'] }) })
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
  const session = { user: null, facebookEnabled: false, needsDisclosure: false, adminCompanies: [] }
  vi.mocked(getSessionFn).mockResolvedValue(session)
  signUp.mockImplementation(async () => {
    vi.mocked(getSessionFn).mockResolvedValue({ ...session, user: { id: 'learner', name: 'Learner', isAnonymous: false } })
    return { error: null }
  })
  acceptInvitation.mockResolvedValue({ error: { message: 'Could not accept invitation' } })

  getInvite.mockResolvedValue(invite)
  const { container, cleanup } = await mount()
  try {
    expect(container.querySelector('button[type="submit"]')?.textContent).toBe('Sign up')
    container.querySelector<HTMLInputElement>('#password')!.value = 'test-password'
    await act(async () => {
      container.querySelector('form')!.dispatchEvent(new Event('submit', { bubbles: true, cancelable: true }))
      await vi.waitFor(() => expect(acceptInvitation).toHaveBeenCalledWith({ invitationId: 'invite' }))
    })
    expect(container.textContent).toContain('Signed in as Learner')
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
  vi.mocked(getSessionFn).mockResolvedValue({ user: { id: 'owner', name: 'Owner', isAnonymous: false }, facebookEnabled: false, needsDisclosure: false, adminCompanies: [] })
  getInvite.mockResolvedValue({ ...invite, otherAccount: true })
  signOut.mockImplementation(async () => {
    vi.mocked(getSessionFn).mockResolvedValue({ user: null, facebookEnabled: false, needsDisclosure: false, adminCompanies: [] })
    return { error: null }
  })
  const { router, container, cleanup } = await mount()
  try {
    const labels = [...container.querySelectorAll('button')].map((button) => button.textContent?.trim())
    expect(labels).toEqual(['Sign in as learner@example.test'])
    expect(container.textContent).toContain('Signed in as Owner. This invite is for learner@example.test.')
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
