// @vitest-environment happy-dom
import { act } from 'react'
import { createRoot } from 'react-dom/client'
import { createMemoryHistory, createRootRoute, createRoute, createRouter, RouterProvider } from '@tanstack/react-router'
import { afterEach, beforeEach, expect, it, vi } from 'vitest'
import { authClient } from '@/lib/auth-client'
import { Route as appRootRoute } from '@/routes/__root'
import { Route as settingsRoute } from '@/routes/me.settings'
import { getPushSettings, savePushPreferences, sendTestPush, subscribe } from '@/server/push'
import { getSessionFn } from '@/server/session-fn'

vi.mock('@/server/push', () => ({ getPushSettings: vi.fn(), subscribe: vi.fn(), unsubscribe: vi.fn(), sendTestPush: vi.fn(), savePushPreferences: vi.fn() }))
vi.mock('@/lib/auth-client', () => ({ authClient: { useSession: () => ({ data: { user: { email: 'b@example.test' } } }) } }))
vi.mock('@/server/session-fn', () => ({ getSessionFn: vi.fn() }))
vi.mock('@/server/latest-topic', () => ({ getLatestTopicIdFn: async () => null }))
vi.mock('@/server/today', () => ({ getToday: vi.fn() }))
vi.mock('@/server/org-settings', () => ({ getCompanyBranding: async () => null }))

const prefs = { paused: false, startMinute: 540, endMinute: 1020, timezone: 'UTC', days: [1, 2, 3, 4, 5] }
const schedule = { window: { startMinute: 540, endMinute: 1020, days: [1, 2, 3, 4, 5], timezone: 'UTC', source: 'default' as const }, dailyCap: 3, steadyCap: 3, phase: 'steady' as const, preview: null }
const publicKey = btoa('public-key').replace(/=+$/, '')
const company = { name: 'Acme', startMinute: 360, endMinute: 1080, days: [1, 2, 3, 4, 5], timezone: 'UTC' }
const learner = { id: 'b', name: 'B', email: 'b@example.test', role: 'learner', isAnonymous: false }

type Setup = { user?: typeof learner | (Omit<typeof learner, 'role'> & { role: string }); adminCompanies?: { slug: string; name: string }[]; push?: Partial<Awaited<ReturnType<typeof getPushSettings>>>; current?: unknown }
const sub = (endpoint: string, keys = { p256dh: 'pk', auth: 'au' }) => ({ endpoint, toJSON: () => ({ endpoint, keys }), unsubscribe: vi.fn(async () => true) })
let container: HTMLDivElement
let root: ReturnType<typeof createRoot>
let router: ReturnType<typeof createRouter>
const registration = { pushManager: { getSubscription: vi.fn(), subscribe: vi.fn() } }
const requestPermission = vi.fn(async () => 'granted')

beforeEach(() => {
  Object.assign(globalThis, { IS_REACT_ACT_ENVIRONMENT: true })
  vi.stubGlobal('PushManager', class {})
  vi.stubGlobal('Notification', { requestPermission })
  Object.defineProperty(navigator, 'serviceWorker', { configurable: true, value: { register: vi.fn(async () => registration), ready: Promise.resolve(registration) } })
  registration.pushManager.getSubscription.mockResolvedValue(null)
})

afterEach(async () => {
  await act(async () => root.unmount())
  container.remove()
  Reflect.deleteProperty(navigator, 'serviceWorker')
  localStorage.clear()
  document.documentElement.removeAttribute('data-theme')
  vi.unstubAllGlobals()
  vi.resetAllMocks()
  delete (globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT
})

async function render({ user = learner, adminCompanies = [], push = {}, current = null }: Setup = {}) {
  registration.pushManager.getSubscription.mockResolvedValue(current)
  vi.mocked(getPushSettings).mockResolvedValue({ publicKey, isStaff: false, endpoints: [], prefs, company: null, canPrompt: false, schedule, ...push } as Awaited<ReturnType<typeof getPushSettings>>)
  vi.mocked(getSessionFn).mockResolvedValue({ user, facebookEnabled: false, needsDisclosure: false, companyMember: false, adminCompanies } as Awaited<ReturnType<typeof getSessionFn>>)
  const rootRoute = createRootRoute({ beforeLoad: appRootRoute.options.beforeLoad, loader: appRootRoute.options.loader })
  const settings = createRoute({ getParentRoute: () => rootRoute, path: '/me/settings', beforeLoad: settingsRoute.options.beforeLoad, loader: settingsRoute.options.loader, component: settingsRoute.options.component })
  const stubs = ['/', '/me/profile', '/welcome', '/admin', '/org/$slug'].map((path) => createRoute({ getParentRoute: () => rootRoute, path, component: () => <h1>Stub {path}</h1> }))
  router = createRouter({ routeTree: rootRoute.addChildren([settings, ...stubs]), history: createMemoryHistory({ initialEntries: ['/me/settings'] }) })
  container = document.createElement('div')
  document.body.appendChild(container)
  root = createRoot(container)
  await act(async () => { await router.load(); root.render(<RouterProvider router={router} />) })
}

const byText = (selector: string, text: string) => [...container.querySelectorAll<HTMLElement>(selector)].find((el) => el.textContent === text)!
const click = (el: HTMLElement) => act(async () => el.click())
const switchEl = () => container.querySelector<HTMLElement>('[role="switch"]')!
const alertText = () => container.querySelector('[role="alert"]')?.textContent
const choose = (id: string, value: string) => act(async () => {
  const select = container.querySelector(id) as unknown as HTMLSelectElement
  Object.getOwnPropertyDescriptor(HTMLSelectElement.prototype, 'value')!.set!.call(select, value)
  select.dispatchEvent(new Event('change', { bubbles: true }))
})
const SAVE_ERROR = 'Couldn’t save your changes. Try again.'

it('pauses at once, and puts the switch back with a calm alert when saving fails', async () => {
  await render()
  await click(switchEl())
  expect(savePushPreferences).toHaveBeenCalledExactlyOnceWith({ data: { ...prefs, paused: true } })
  expect(switchEl().getAttribute('aria-checked')).toBe('false')
  expect(container.textContent).toContain('Paused. Turn back on any time.')

  vi.mocked(savePushPreferences).mockRejectedValueOnce(new Error('boom'))
  await click(switchEl())
  expect(switchEl().getAttribute('aria-checked')).toBe('false')
  expect(alertText()).toBe(SAVE_ERROR)
  expect(switchEl().hasAttribute('disabled')).toBe(false)
})

it.each([
  ['has no subscription', null, null],
  ['holds another account’s leftover subscription', sub('https://push.example/a'), 'https://push.example/a'],
])('subscribes this browser before turning questions on when it %s', async (_name, current, leftover) => {
  const endpoint = 'https://push.example/b'
  const keys = { p256dh: 'pk', auth: 'au' }
  const created = sub(endpoint, keys)
  registration.pushManager.subscribe.mockResolvedValue(created)
  await render({ push: { isStaff: true, prefs: { ...prefs, paused: true } }, current })
  await click(switchEl())
  expect(requestPermission).toHaveBeenCalledOnce()
  if (leftover) expect((current as ReturnType<typeof sub>).unsubscribe).toHaveBeenCalledOnce()
  expect(registration.pushManager.subscribe).toHaveBeenCalledOnce()
  expect(subscribe).toHaveBeenCalledExactlyOnceWith({ data: { endpoint, keys } })
  expect(savePushPreferences).toHaveBeenCalledExactlyOnceWith({ data: { ...prefs, paused: false } })
  expect(switchEl().getAttribute('aria-checked')).toBe('true')
  // The new subscription counts as this account's: the test push works and toggling again keeps it.
  expect(byText('button', 'Send test push').hasAttribute('disabled')).toBe(false)
  await click(switchEl())
  registration.pushManager.getSubscription.mockResolvedValue(created)
  await click(switchEl())
  expect(created.unsubscribe).not.toHaveBeenCalled()
  expect(registration.pushManager.subscribe).toHaveBeenCalledOnce()
  expect(savePushPreferences).toHaveBeenLastCalledWith({ data: { ...prefs, paused: false } })
})

it('never turns off the last day and saves other toggles', async () => {
  await render({ push: { company, prefs: { ...prefs, days: [1] } } })
  const day = (label: string) => byText('button[aria-pressed]', label)
  await click(day('Mon'))
  expect(day('Mon').getAttribute('aria-pressed')).toBe('true')
  expect(savePushPreferences).not.toHaveBeenCalled()
  expect(container.textContent).toContain('At least one day')
  await click(day('Tue'))
  expect(savePushPreferences).toHaveBeenCalledExactlyOnceWith({ data: { ...prefs, days: [1, 2] } })
  expect(day('Tue').getAttribute('aria-pressed')).toBe('true')
})

it('pauses and changes hours when the company dropped every chosen day, keeping the saved days (#703)', async () => {
  // Like an older server, reject an empty days list.
  vi.mocked(savePushPreferences).mockImplementation(async ({ data }) => {
    if (data.days?.length === 0) throw new Error('Choose days inside Acme’s hours')
    return { ok: true } as never
  })
  const { days: _days, ...rest } = prefs
  await render({ push: { company: { ...company, days: [2, 4, 5] }, prefs: { ...rest, days: [] } } })
  await click(switchEl())
  expect(switchEl().getAttribute('aria-checked')).toBe('false')
  await choose('#settings-from', '600')
  expect(vi.mocked(savePushPreferences).mock.calls).toEqual([[{ data: { ...rest, paused: true } }], [{ data: { ...rest, paused: true, startMinute: 600 } }]])
  expect(alertText()).toBeUndefined()
  // Choosing a day again still saves it.
  await click(byText('button[aria-pressed]', 'Tue'))
  expect(savePushPreferences).toHaveBeenLastCalledWith({ data: { ...rest, paused: true, startMinute: 600, days: [2] } })
})

it('offers only times inside the company window', async () => {
  await render({ push: { company, prefs: { ...prefs, startMinute: 360, endMinute: 1080 } } })
  const labels = (id: string) => [...container.querySelectorAll<HTMLOptionElement>(`${id} option`)].map((o) => o.textContent)
  const from = labels('#settings-from')
  const to = labels('#settings-to')
  expect([from[0], from.at(-1)]).toEqual(['6:00 AM', '5:30 PM'])
  expect([to[0], to.at(-1)]).toEqual(['6:30 AM', '6:00 PM'])
  expect(from).not.toContain('5:30 AM')
  expect(to).not.toContain('6:30 PM')
  expect(container.textContent).toContain('Inside Acme’s hours: 6:00 AM–6:00 PM')
  await choose('#settings-from', '420')
  expect(savePushPreferences).toHaveBeenCalledExactlyOnceWith({ data: { ...prefs, startMinute: 420, endMinute: 1080 } })
})

it('keeps saved times selected when company hours start off the half hour', async () => {
  await render({ push: { company: { ...company, startMinute: 555, endMinute: 1020 }, prefs: { ...prefs, startMinute: 555, endMinute: 1020 } } })
  const select = (id: string) => container.querySelector(id) as unknown as HTMLSelectElement
  expect(select('#settings-from').value).toBe('555')
  expect(select('#settings-to').value).toBe('1020')
  expect(select('#settings-to').selectedOptions[0].textContent).toBe('5:00 PM')
  expect(select('#settings-from').selectedOptions[0].textContent).toBe('9:15 AM')
})

it('shows staff links and the test push only to staff', async () => {
  const endpoint = 'https://push.example/staff'
  await render({
    user: { ...learner, role: 'admin' }, adminCompanies: [{ slug: 'acme', name: 'Acme' }],
    push: { isStaff: true, endpoints: [endpoint] }, current: sub(endpoint),
  })
  expect(byText('a', 'Acme portal').getAttribute('href')).toBe('/org/acme')
  expect(byText('a', 'Staff area').getAttribute('href')).toBe('/admin')
  expect(byText('a', 'What we record').getAttribute('href')).toBe('/welcome?review=1')
  expect(container.textContent).toContain('b@example.test')
  await click(byText('button', 'Send test push'))
  expect(sendTestPush).toHaveBeenCalledExactlyOnceWith({ data: { endpoint } })
  expect(container.textContent).toContain('Test push accepted.')
})

it('hides staff links from a regular learner', async () => {
  await render()
  expect(container.textContent).not.toContain('portal')
  expect(container.textContent).not.toContain('Staff area')
  expect(container.textContent).not.toContain('Send test push')
})

it('applies and stores the chosen appearance, and System clears it', async () => {
  await render()
  const radio = (label: string) => byText('[role="radio"]', label)
  await click(radio('Dark'))
  expect(document.documentElement.dataset.theme).toBe('dark')
  expect(localStorage.getItem('lq-theme')).toBe('dark')
  expect(radio('Dark').getAttribute('aria-checked')).toBe('true')
  await click(radio('System'))
  expect(document.documentElement.hasAttribute('data-theme')).toBe(false)
  expect(localStorage.getItem('lq-theme')).toBeNull()
})

it('keeps the user on Settings and says why when sign-out fails', async () => {
  Object.assign(authClient, { signOut: vi.fn().mockRejectedValueOnce(new TypeError('Failed to fetch')).mockResolvedValueOnce({ data: null, error: { message: 'Session expired' } }) })
  await render()
  for (let i = 0; i < 2; i++) {
    await click(byText('button', 'Sign out'))
    expect(alertText()).toBe('Couldn’t sign out. Try again.')
    expect(byText('button', 'Sign out').hasAttribute('disabled')).toBe(false)
    expect(router.state.location.pathname).toBe('/me/settings')
  }
})

// Each row: saved hours, the clamped hours shown, then From/To picks inside the company window.
it.each([
  ['both after', 1140, 1260, ['1050', '1080'], [['#settings-from', '600'], ['#settings-to', '900']]],
  ['both before', 240, 300, ['360', '390'], [['#settings-to', '900'], ['#settings-from', '600']]],
  ['under 30 minutes inside', 360, 375, ['360', '390'], [['#settings-to', '900'], ['#settings-from', '600']]],
] as const)('saves From and To when saved hours fall %s the company window', async (_name, startMinute, endMinute, shown, picks) => {
  // Mirrors savePushPreferences, which refuses hours outside the company window.
  vi.mocked(savePushPreferences).mockImplementation(async ({ data }) => {
    if (data.startMinute < company.startMinute || data.endMinute > company.endMinute || data.endMinute - data.startMinute < 30) throw new Error('400')
    return { saved: true }
  })
  await render({ push: { company, prefs: { ...prefs, startMinute, endMinute } } })
  const value = (id: string) => (container.querySelector(id) as unknown as HTMLSelectElement).value
  expect([value('#settings-from'), value('#settings-to')]).toEqual(shown)
  for (const [id, minute] of picks) await choose(id, minute)
  expect(alertText()).toBeUndefined()
  expect([value('#settings-from'), value('#settings-to')]).toEqual(['600', '900'])
  expect(savePushPreferences).toHaveBeenLastCalledWith({ data: { ...prefs, startMinute: 600, endMinute: 900 } })
})
