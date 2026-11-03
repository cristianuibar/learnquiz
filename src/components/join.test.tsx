// @vitest-environment happy-dom
import { act } from 'react'
import { createRoot } from 'react-dom/client'
import { createMemoryHistory, createRootRoute, createRoute, createRouter, RouterProvider } from '@tanstack/react-router'
import { expect, it, vi } from 'vitest'
import { Route as appRootRoute } from '@/routes/__root'
import { Route as joinRoute } from '@/routes/join.$invitationId'
import { getSessionFn } from '@/server/session-fn'

const { signUp, acceptInvitation } = vi.hoisted(() => ({ signUp: vi.fn(), acceptInvitation: vi.fn() }))

vi.mock('@/lib/auth-client', () => ({ authClient: { signUp: { email: signUp }, organization: { acceptInvitation } } }))
vi.mock('@/server/session-fn', () => ({ getSessionFn: vi.fn() }))
vi.mock('@/server/org-settings', () => ({ getCompanyBranding: async () => null }))
vi.mock('@/server/latest-topic', () => ({ getLatestTopicIdFn: async () => null }))
vi.mock('@/server/org', () => ({
  getInvite: async () => ({ company: 'Acme', email: 'learner@example.test', name: 'Learner', status: 'pending' }),
}))

it('keeps the signed-in join controls and error when accepting fails after sign-up', async () => {
  const session = { user: null, facebookEnabled: false, needsDisclosure: false, adminCompanies: [] }
  vi.mocked(getSessionFn).mockResolvedValue(session)
  signUp.mockImplementation(async () => {
    vi.mocked(getSessionFn).mockResolvedValue({ ...session, user: { id: 'learner', name: 'Learner', isAnonymous: false } })
    return { error: null }
  })
  acceptInvitation.mockResolvedValue({ error: { message: 'Could not accept invitation' } })

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
  const router = createRouter({ routeTree: rootRoute.addChildren([join]), history: createMemoryHistory({ initialEntries: ['/join/invite'] }) })
  const container = document.createElement('div')
  document.body.appendChild(container)
  const root = createRoot(container)
  try {
    await act(async () => { await router.load(); root.render(<RouterProvider router={router} />) })
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
    await act(async () => root.unmount())
    container.remove()
    delete (globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT
  }
})
