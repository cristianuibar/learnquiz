// @vitest-environment happy-dom
import { act, type ReactNode } from 'react'
import { createRoot } from 'react-dom/client'
import { createMemoryHistory, createRouter, RouterProvider } from '@tanstack/react-router'
import { expect, it, vi } from 'vitest'
import { routeTree } from '@/routeTree.gen'
import { getSessionFn } from '@/server/session-fn'

const { signIn, getPeople, getOrgOverview } = vi.hoisted(() => ({ signIn: vi.fn(), getPeople: vi.fn(), getOrgOverview: vi.fn() }))

vi.mock('@/lib/auth-client', () => ({ authClient: { signIn: { email: signIn } } }))
vi.mock('@/server/session-fn', () => ({ getSessionFn: vi.fn() }))
vi.mock('@/server/latest-topic', () => ({ getLatestTopicIdFn: async () => null }))
vi.mock('@/server/org', () => ({ getPeople, getOrgOverview }))
vi.mock('@/server/env', () => ({})) // cloudflare:workers is unavailable outside a Worker.

// Mount the real route tree without the server document and development tools.
Object.assign(routeTree.options, { shellComponent: ({ children }: { children: ReactNode }) => children })

it.each([
  { path: '/org/acme', isGuest: false, heading: 'Acme' },
  { path: '/org/acme/people?from=shared#members', isGuest: false, heading: 'People at Acme' },
  { path: '/org/acme', isGuest: true, heading: 'Acme' },
  { path: '/org/acme/people?from=shared#members', isGuest: true, heading: 'People at Acme' },
])('returns to $path after signing in (guest: $isGuest)', async ({ path, isGuest, heading }) => {
  const session = { user: null, facebookEnabled: false, needsDisclosure: false }
  const partner = { id: 'partner', name: 'Partner', isAnonymous: false }
  vi.mocked(getSessionFn).mockResolvedValue({ ...session, user: isGuest ? { ...partner, isAnonymous: true } : null })
  signIn.mockImplementation(async () => {
    vi.mocked(getSessionFn).mockResolvedValue({ ...session, user: partner })
    return { error: null }
  })
  getPeople.mockClear().mockResolvedValue({ id: 'acme', name: 'Acme', slug: 'acme', roles: [], members: [], invites: [], readOnly: false, baseUrl: 'http://localhost:3000' })
  getOrgOverview.mockClear().mockResolvedValue({ name: 'Acme', slug: 'acme', roles: [], readOnly: false })

  Object.assign(globalThis, { IS_REACT_ACT_ENVIRONMENT: true })
  const router = createRouter({ routeTree, history: createMemoryHistory({ initialEntries: [path] }), defaultPendingMinMs: 0 })
  const container = document.createElement('div')
  document.body.appendChild(container)
  const root = createRoot(container)
  try {
    await act(async () => { await router.load(); root.render(<RouterProvider router={router} />) })
    expect(router.state.location.pathname).toBe('/sign-in')
    expect(router.state.location.search).toEqual({ redirect: path })
    expect(container.querySelector('h1')?.textContent).toBe('Sign in')
    expect(getPeople).not.toHaveBeenCalled()
    expect(getOrgOverview).not.toHaveBeenCalled()

    container.querySelector<HTMLInputElement>('#email')!.value = 'partner@example.test'
    container.querySelector<HTMLInputElement>('#password')!.value = 'test-password'
    await act(async () => {
      container.querySelector('form')!.dispatchEvent(new Event('submit', { bubbles: true, cancelable: true }))
      await vi.waitFor(() => expect(container.querySelector('h1')?.textContent).toBe(heading))
    })
    expect(router.state.location.href).toBe(path)
  } finally {
    await act(async () => root.unmount())
    container.remove()
    delete (globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT
  }
})
