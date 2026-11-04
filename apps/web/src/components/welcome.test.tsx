// @vitest-environment happy-dom
import { act } from 'react'
import { createRoot } from 'react-dom/client'
import { createMemoryHistory, createRootRoute, createRoute, createRouter, RouterProvider } from '@tanstack/react-router'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { Route as appRootRoute } from '@/routes/__root'
import { Route as welcomeRoute } from '@/routes/welcome'
import { acceptDisclosure, getSessionFn } from '@/server/session-fn'

vi.mock('@tanstack/react-start', () => ({ useServerFn: (fn: unknown) => fn }))
vi.mock('@/server/session-fn', () => ({ getSessionFn: vi.fn(), acceptDisclosure: vi.fn() }))
vi.mock('@/server/org-settings', () => ({ getCompanyBranding: async () => ({ name: 'Northwind Logistics', logoUrl: null, accent: null }) }))
vi.mock('@/server/latest-topic', () => ({ getLatestTopicIdFn: async () => null }))

const user = { id: 'u1', name: 'Learner', isAnonymous: false }
const session = (needsDisclosure: boolean) => ({ user, facebookEnabled: false, needsDisclosure, adminCompanies: [] })

beforeEach(() => vi.clearAllMocks())

async function mount(entries: string[], initialIndex = entries.length - 1) {
  Object.assign(globalThis, { IS_REACT_ACT_ENVIRONMENT: true })
  const rootRoute = createRootRoute({
    beforeLoad: appRootRoute.options.beforeLoad,
    loader: appRootRoute.options.loader,
    component: appRootRoute.options.component,
  })
  const welcome = createRoute({
    getParentRoute: () => rootRoute,
    path: '/welcome',
    validateSearch: welcomeRoute.options.validateSearch,
    beforeLoad: welcomeRoute.options.beforeLoad,
    component: welcomeRoute.options.component,
  })
  const stub = (path: string, label: string) => createRoute({ getParentRoute: () => rootRoute, path, component: () => <p>{label}</p> })
  const router = createRouter({
    routeTree: rootRoute.addChildren([welcome, stub('/today', 'Today page'), stub('/', 'Home page'), stub('/me', 'Me page')]),
    history: createMemoryHistory({ initialEntries: entries, initialIndex }),
  })
  const container = document.createElement('div')
  document.body.appendChild(container)
  const root = createRoot(container)
  await act(async () => { await router.load(); root.render(<RouterProvider router={router} />) })
  const cleanup = async () => {
    await act(async () => root.unmount())
    container.remove()
    delete (globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT
  }
  const gotIt = () => [...container.querySelectorAll('button')].find((b) => b.textContent?.trim() === 'Start learning')!
  return { router, container, cleanup, gotIt }
}

describe('welcome disclosure', () => {
  it('names the company admins and links to the privacy notice', async () => {
    vi.mocked(getSessionFn).mockResolvedValue(session(true))
    const { container, cleanup } = await mount(['/welcome'])
    try {
      expect(container.querySelector('h1')?.textContent).toBe('Before you start')
      expect(container.textContent).toContain('You and Northwind Logistics’ training admins.')
      const link = [...container.querySelectorAll('a')].find((a) => a.textContent?.trim() === 'Read the full privacy notice')!
      expect(link.getAttribute('href')).toBe('https://learnquiz.com/privacy')
      expect(link.getAttribute('target')).toBe('_blank')
      expect(link.getAttribute('rel')).toBe('noopener')
    } finally {
      await cleanup()
    }
  })

  it.each([
    { entry: '/welcome', path: '/today' },
    { entry: '/welcome?redirect=/me', path: '/me' },
  ])('accepts once and lands on $path from $entry', async ({ entry, path }) => {
    vi.mocked(getSessionFn).mockResolvedValue(session(true))
    vi.mocked(acceptDisclosure).mockImplementation(async () => {
      vi.mocked(getSessionFn).mockResolvedValue(session(false))
      return { roleTopicId: null }
    })
    const { router, gotIt, cleanup } = await mount([entry])
    try {
      expect(router.state.location.pathname).toBe('/welcome')
      await act(async () => {
        gotIt().click()
        await vi.waitFor(() => expect(router.state.location.pathname).toBe(path))
      })
      expect(acceptDisclosure).toHaveBeenCalledTimes(1)
    } finally {
      await cleanup()
    }
  })

  it('stays on the page with an error and re-enables Start learning when saving fails', async () => {
    vi.mocked(getSessionFn).mockResolvedValue(session(true))
    vi.mocked(acceptDisclosure).mockRejectedValue(new TypeError('Failed to fetch'))
    const { router, container, gotIt, cleanup } = await mount(['/welcome'])
    try {
      await act(async () => {
        gotIt().click()
        await vi.waitFor(() => expect(acceptDisclosure).toHaveBeenCalledTimes(1))
      })
      await vi.waitFor(() => expect(container.querySelector('[role="alert"]')?.textContent).toContain("Couldn't save. Check your connection and try again."))
      expect(router.state.location.pathname).toBe('/welcome')
      expect(gotIt().disabled).toBe(false)
    } finally {
      await cleanup()
    }
  })

  it('goes back without saving when reviewing an accepted disclosure', async () => {
    vi.mocked(getSessionFn).mockResolvedValue(session(false))
    const { router, gotIt, cleanup } = await mount(['/me', '/welcome?review=1'])
    try {
      expect(router.state.location.pathname).toBe('/welcome')
      await act(async () => {
        gotIt().click()
        await vi.waitFor(() => expect(router.state.location.pathname).toBe('/me'))
      })
      expect(acceptDisclosure).not.toHaveBeenCalled()
    } finally {
      await cleanup()
    }
  })
})
