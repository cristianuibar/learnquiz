// @vitest-environment happy-dom
import { act } from 'react'
import { createRoot } from 'react-dom/client'
import { createMemoryHistory, createRootRoute, createRoute, createRouter, RouterProvider } from '@tanstack/react-router'
import { afterEach, expect, it, vi } from 'vitest'
import { Route as appRootRoute } from '@/routes/__root'
import { Route as meRoute } from '@/routes/me.index'
import { getPushSettings, sendTestPush, subscribe, unsubscribe } from '@/server/push'
import { getSessionFn } from '@/server/session-fn'

// The component's external boundaries are browser push APIs and server functions.
vi.mock('@/server/push', () => ({ getPushSettings: vi.fn(), subscribe: vi.fn(), unsubscribe: vi.fn(), sendTestPush: vi.fn() }))
vi.mock('@/lib/auth-client', () => ({ authClient: {} }))
vi.mock('@/server/session-fn', () => ({ getSessionFn: vi.fn() }))
vi.mock('@/server/latest-topic', () => ({ getLatestTopicIdFn: async () => null }))
afterEach(() => {
  vi.restoreAllMocks()
  vi.unstubAllGlobals()
  vi.resetAllMocks()
  delete (globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT
})

it('keeps staff navigation while enabling, testing and disabling notifications from Profile', async () => {
  Object.assign(globalThis, { IS_REACT_ACT_ENVIRONMENT: true })
  const endpoint = 'https://fcm.googleapis.com/fcm/send/device'
  const keys = { p256dh: 'browser-public-key', auth: 'browser-auth-secret' }
  const current = { endpoint, toJSON: () => ({ endpoint, keys }), unsubscribe: vi.fn(async () => true) }
  const requestPermission = vi.fn(async () => 'granted')
  const browserSubscribe = vi.fn(async () => current)
  const registration = { pushManager: { getSubscription: vi.fn(async () => null), subscribe: browserSubscribe } }
  vi.stubGlobal('PushManager', class {})
  vi.stubGlobal('Notification', { requestPermission })
  Object.defineProperty(navigator, 'serviceWorker', { configurable: true, value: { register: vi.fn(async () => registration), ready: Promise.resolve(registration) } })
  const publicKey = btoa('public-key').replace(/=+$/, '')
  vi.mocked(getPushSettings).mockResolvedValue({ publicKey, isStaff: true, endpoints: [] })
  vi.mocked(getSessionFn).mockResolvedValue({ user: { id: 'staff', name: 'Staff', role: 'admin', isAnonymous: false }, facebookEnabled: false, needsDisclosure: false })
  const rootRoute = createRootRoute({ beforeLoad: appRootRoute.options.beforeLoad, loader: appRootRoute.options.loader })
  const me = createRoute({ getParentRoute: () => rootRoute, path: '/me/', beforeLoad: meRoute.options.beforeLoad, loader: meRoute.options.loader, component: meRoute.options.component })
  const admin = createRoute({ getParentRoute: () => rootRoute, path: '/admin', component: () => <h1>Staff area</h1> })
  const router = createRouter({ routeTree: rootRoute.addChildren([me, admin]), history: createMemoryHistory({ initialEntries: ['/me/'] }) })
  const container = document.createElement('div')
  document.body.appendChild(container)
  const root = createRoot(container)
  const button = (label: string) => [...container.querySelectorAll('button')].find((b) => b.textContent === label)!
  try {
    await act(async () => { await router.load(); root.render(<RouterProvider router={router} />) })
    expect(container.querySelector('a[href="/admin"]')?.textContent).toBe('Staff area')
    expect(container.querySelector('h2')?.textContent).toBe('Notifications')
    expect(requestPermission).not.toHaveBeenCalled()
    expect(button('Send test push').disabled).toBe(true)

    await act(async () => button('Enable notifications').click())
    expect(browserSubscribe).toHaveBeenCalledWith({ userVisibleOnly: true, applicationServerKey: expect.any(Uint8Array) })
    expect(subscribe).toHaveBeenCalledExactlyOnceWith({ data: { endpoint, keys } })
    expect(container.querySelector('[role="status"]')?.textContent).toBe('Notifications enabled on this browser.')

    await act(async () => button('Send test push').click())
    expect(sendTestPush).toHaveBeenCalledExactlyOnceWith({ data: { endpoint } })
    expect(container.querySelector('[role="status"]')?.textContent).toContain('Test push accepted.')

    await act(async () => button('Disable notifications').click())
    expect(unsubscribe).toHaveBeenCalledExactlyOnceWith({ data: { endpoint } })
    expect(current.unsubscribe).toHaveBeenCalledOnce()
    expect(button('Send test push').disabled).toBe(true)
    expect(container.querySelector('[role="status"]')?.textContent).toBe('Notifications disabled on this browser.')
  } finally {
    await act(async () => root.unmount())
    container.remove()
    Reflect.deleteProperty(navigator, 'serviceWorker')
  }
})
