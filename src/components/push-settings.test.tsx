// @vitest-environment happy-dom
import { act } from 'react'
import { createRoot } from 'react-dom/client'
import { afterEach, expect, it, vi } from 'vitest'
import { PushSettings } from './push-settings'
import { sendTestPush, subscribe, unsubscribe } from '@/server/push'

// The component's external boundaries are browser push APIs and server functions.
vi.mock('@/server/push', () => ({ subscribe: vi.fn(), unsubscribe: vi.fn(), sendTestPush: vi.fn() }))
afterEach(() => {
  vi.restoreAllMocks()
  vi.unstubAllGlobals()
  vi.resetAllMocks()
  delete (globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT
})

it('enables notifications on a click, lets staff send a test, and disables the current browser', async () => {
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
  const container = document.createElement('div')
  document.body.appendChild(container)
  const root = createRoot(container)
  const button = (label: string) => [...container.querySelectorAll('button')].find((b) => b.textContent === label)!
  try {
    await act(async () => root.render(<PushSettings publicKey={publicKey} isStaff endpoints={[]} />))
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
