// @vitest-environment happy-dom
import { act } from 'react'
import { createRoot } from 'react-dom/client'
import { createMemoryHistory, createRootRoute, createRoute, createRouter, RouterProvider } from '@tanstack/react-router'
import { afterEach, expect, it, vi } from 'vitest'
import { Route as appRootRoute } from '@/routes/__root'
import { Route as meRoute } from '@/routes/me.index'
import { getPushSettings, savePushPreferences, sendTestPush, subscribe, unsubscribe } from '@/server/push'
import { getSessionFn } from '@/server/session-fn'

// The component's external boundaries are browser push APIs and server functions.
vi.mock('@/server/push', () => ({ getPushSettings: vi.fn(), subscribe: vi.fn(), unsubscribe: vi.fn(), sendTestPush: vi.fn(), savePushPreferences: vi.fn() }))
vi.mock('@/lib/auth-client', () => ({ authClient: {} }))
vi.mock('@/server/session-fn', () => ({ getSessionFn: vi.fn() }))
vi.mock('@/server/latest-topic', () => ({ getLatestTopicIdFn: async () => null }))
vi.mock('@/server/org-settings', () => ({ getCompanyBranding: async () => null }))
const prefs = { paused: false, startMinute: 540, endMinute: 1020, timezone: 'UTC' }
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
  vi.mocked(getPushSettings).mockResolvedValue({ publicKey, isStaff: true, endpoints: [], prefs, canPrompt: false })
  vi.mocked(getSessionFn).mockResolvedValue({ user: { id: 'staff', name: 'Staff', role: 'admin', isAnonymous: false }, facebookEnabled: false, needsDisclosure: false, adminCompanies: [{ name: 'Acme', slug: 'acme' }] })
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
    expect(container.querySelector('a[href="/org/acme"]')?.textContent).toBe('Acme portal')
    expect(container.querySelector('a[href="/me/profile"]')?.textContent).toBe('Training progress')
    expect(container.querySelector('h2')?.textContent).toBe('Notifications')
    expect(container.querySelectorAll('[aria-labelledby="push-heading"]')).toHaveLength(1)
    expect(requestPermission).not.toHaveBeenCalled()
    expect(button('Send test push').disabled).toBe(true)

    await act(async () => button('Enable notifications').click())
    expect(browserSubscribe).toHaveBeenCalledWith({ userVisibleOnly: true, applicationServerKey: expect.any(Uint8Array) })
    expect(subscribe).toHaveBeenCalledExactlyOnceWith({ data: { endpoint, keys } })
    expect(container.querySelector('[role="status"]')?.textContent).toBe('Notifications enabled on this browser.')

    await act(async () => button('Send test push').click())
    expect(sendTestPush).toHaveBeenCalledExactlyOnceWith({ data: { endpoint } })
    expect(container.querySelector('[role="status"]')?.textContent).toContain('Test push accepted.')

    vi.mocked(unsubscribe).mockRejectedValueOnce(new Error('Could not disable. Try again.'))
    await act(async () => button('Disable notifications').click())
    expect(container.querySelector('[role="alert"]')?.textContent).toBe('Could not disable. Try again.')
    expect(current.unsubscribe).not.toHaveBeenCalled()
    expect(button('Send test push').disabled).toBe(false)

    await act(async () => button('Disable notifications').click())
    expect(unsubscribe).toHaveBeenNthCalledWith(2, { data: { endpoint } })
    expect(current.unsubscribe).toHaveBeenCalledOnce()
    expect(button('Send test push').disabled).toBe(true)
    expect(container.querySelector('[role="status"]')?.textContent).toBe('Notifications disabled on this browser.')
    await act(async () => button('Pause pushes').click())
    expect(savePushPreferences).toHaveBeenLastCalledWith({ data: { ...prefs, paused: true } })
    expect(button('Resume pushes').disabled).toBe(false)
    await act(async () => {
      const input = container.querySelector<HTMLInputElement>('#push-start')!
      Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value')!.set!.call(input, '10:00')
      input.dispatchEvent(new Event('input', { bubbles: true }))
    })
    await act(async () => button('Save working hours').click())
    expect(savePushPreferences).toHaveBeenLastCalledWith({ data: { ...prefs, paused: true, startMinute: 600 } })
    vi.mocked(savePushPreferences).mockRejectedValueOnce(new Error('Could not save. Try again.'))
    await act(async () => button('Resume pushes').click())
    expect(container.querySelector('[role="alert"]')?.textContent).toBe('Could not save. Try again.')
    expect(button('Resume pushes').disabled).toBe(false)
  } finally {
    await act(async () => root.unmount())
    container.remove()
    Reflect.deleteProperty(navigator, 'serviceWorker')
  }
})

it("replaces another account's leftover browser subscription when enabling notifications", async () => {
  Object.assign(globalThis, { IS_REACT_ACT_ENVIRONMENT: true })
  const sub = (endpoint: string, keys: { p256dh: string; auth: string }) => ({ endpoint, toJSON: () => ({ endpoint, keys }), unsubscribe: vi.fn(async () => true) })
  const leftover = sub('https://fcm.googleapis.com/fcm/send/account-a', { p256dh: 'a-public-key', auth: 'a-auth-secret' })
  const endpoint = 'https://fcm.googleapis.com/fcm/send/account-b'
  const keys = { p256dh: 'b-public-key', auth: 'b-auth-secret' }
  const created = sub(endpoint, keys)
  const browserSubscribe = vi.fn(async () => created)
  const registration = { pushManager: { getSubscription: vi.fn(async () => leftover), subscribe: browserSubscribe } }
  vi.stubGlobal('PushManager', class {})
  vi.stubGlobal('Notification', { requestPermission: vi.fn(async () => 'granted') })
  Object.defineProperty(navigator, 'serviceWorker', { configurable: true, value: { register: vi.fn(async () => registration), ready: Promise.resolve(registration) } })
  vi.mocked(getPushSettings).mockResolvedValue({ publicKey: btoa('public-key').replace(/=+$/, ''), isStaff: false, endpoints: [], prefs, canPrompt: false })
  vi.mocked(getSessionFn).mockResolvedValue({ user: { id: 'b', name: 'B', role: 'learner', isAnonymous: false }, facebookEnabled: false, needsDisclosure: false, adminCompanies: [] })
  const rootRoute = createRootRoute({ beforeLoad: appRootRoute.options.beforeLoad, loader: appRootRoute.options.loader })
  const me = createRoute({ getParentRoute: () => rootRoute, path: '/me/', beforeLoad: meRoute.options.beforeLoad, loader: meRoute.options.loader, component: meRoute.options.component })
  const router = createRouter({ routeTree: rootRoute.addChildren([me]), history: createMemoryHistory({ initialEntries: ['/me/'] }) })
  const container = document.createElement('div')
  document.body.appendChild(container)
  const root = createRoot(container)
  try {
    await act(async () => { await router.load(); root.render(<RouterProvider router={router} />) })
    await act(async () => [...container.querySelectorAll('button')].find((b) => b.textContent === 'Enable notifications')!.click())
    expect(leftover.unsubscribe).toHaveBeenCalledOnce()
    expect(browserSubscribe).toHaveBeenCalledOnce()
    expect(subscribe).toHaveBeenCalledExactlyOnceWith({ data: { endpoint, keys } })
    expect(container.querySelector('[role="status"]')?.textContent).toBe('Notifications enabled on this browser.')
    expect(container.querySelector('[role="alert"]')).toBeNull()
  } finally {
    await act(async () => root.unmount())
    container.remove()
    Reflect.deleteProperty(navigator, 'serviceWorker')
  }
})
