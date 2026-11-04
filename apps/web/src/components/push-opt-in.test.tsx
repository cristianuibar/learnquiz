// @vitest-environment happy-dom
import { act } from 'react'
import { createRoot } from 'react-dom/client'
import { createMemoryHistory, createRootRoute, createRoute, createRouter, RouterProvider } from '@tanstack/react-router'
import { afterEach, beforeEach, expect, it, vi } from 'vitest'
import { Route as optInRoute } from '@/routes/opt-in'
import { getPushSettings, subscribe } from '@/server/push'

vi.mock('@tanstack/react-start', () => ({ useServerFn: (fn: unknown) => fn }))
vi.mock('@/server/push', () => ({ getPushSettings: vi.fn(), subscribe: vi.fn(), unsubscribe: vi.fn(), sendTestPush: vi.fn(), savePushPreferences: vi.fn() }))

const window_ = { startMinute: 540, endMinute: 1020, days: [1, 2, 3, 4, 5], timezone: 'UTC', source: 'default' as const }
const prefs = { paused: false, startMinute: 540, endMinute: 1020, timezone: 'UTC' }
const settings = (schedule: Partial<{ phase: 'onboarding' | 'steady'; preview: string | null }> = {}) => ({
  publicKey: 'cHVibGljLWtleQ', isStaff: false, endpoints: ['https://push.example/old'], canPrompt: true, prefs: { ...prefs, days: [1, 2, 3, 4, 5] }, company: null,
  schedule: { window: window_, dailyCap: 5, steadyCap: 2, phase: 'onboarding' as const, preview: 'Which valve closes first?', ...schedule },
})

const requestPermission = vi.fn()
const subscription = { endpoint: 'https://push.example/new', toJSON: () => ({ keys: { p256dh: 'p', auth: 'a' } }) }

beforeEach(() => {
  vi.mocked(getPushSettings).mockResolvedValue(settings())
  requestPermission.mockResolvedValue('granted')
  vi.stubGlobal('Notification', { requestPermission })
  vi.stubGlobal('PushManager', class {})
  const registration = { pushManager: { getSubscription: async () => null, subscribe: async () => subscription } }
  Object.defineProperty(navigator, 'serviceWorker', { configurable: true, value: { ready: Promise.resolve(registration) } })
  vi.spyOn(window, 'matchMedia').mockImplementation(() => ({ matches: false }) as MediaQueryList)
})

afterEach(() => {
  vi.restoreAllMocks(); vi.resetAllMocks(); vi.unstubAllGlobals()
  Reflect.deleteProperty(navigator, 'serviceWorker')
  delete (globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT
})

async function renderOptIn() {
  Object.assign(globalThis, { IS_REACT_ACT_ENVIRONMENT: true })
  const rootRoute = createRootRoute()
  const optIn = createRoute({ getParentRoute: () => rootRoute as never, path: '/opt-in', loader: optInRoute.options.loader, component: optInRoute.options.component })
  const today = createRoute({ getParentRoute: () => rootRoute, path: '/today', component: () => <main>Today stub</main> })
  const router = createRouter({ routeTree: rootRoute.addChildren([optIn, today]), history: createMemoryHistory({ initialEntries: ['/opt-in'] }) })
  const container = document.createElement('div')
  document.body.appendChild(container)
  const root = createRoot(container)
  await act(async () => { await router.load(); root.render(<RouterProvider router={router} />) })
  const press = async (label: string) => {
    const button = [...container.querySelectorAll('button')].find((b) => b.textContent === label)!
    await act(async () => button.click())
  }
  return { container, router, press, async cleanup() { await act(async () => root.unmount()); container.remove() } }
}

it('shows the facts and preview from the schedule, and no preview card when there is none', async () => {
  const { container, cleanup } = await renderOptIn()
  try {
    expect(container.querySelector('h1')?.textContent).toBe('Get a question during your shift?')
    const facts = [...container.querySelectorAll('ul[aria-label="How questions work"] li')].map((li) => li.textContent)
    expect(facts).toEqual(['Up to 5 a day while you’re onboarding, then 2.', 'Only 9:00 AM–5:00 PM, Monday to Friday.', 'Skip any. Nothing is lost.'])
    expect(container.querySelector('[role="img"]')?.getAttribute('aria-label')).toBe('Preview of a notification from Learn Quiz: Which valve closes first?')
  } finally { await cleanup() }

  vi.mocked(getPushSettings).mockResolvedValue(settings({ phase: 'steady', preview: null }))
  const steady = await renderOptIn()
  try {
    expect(steady.container.querySelector('ul li')?.textContent).toBe('Up to 2 a day.')
    expect(steady.container.querySelector('[role="img"]')).toBeNull()
  } finally { await steady.cleanup() }
})

it('asks for permission only on Turn on, subscribes, then goes to Today', async () => {
  const { container, router, press, cleanup } = await renderOptIn()
  try {
    expect(requestPermission).not.toHaveBeenCalled()
    await press('Turn on questions')
    expect(requestPermission).toHaveBeenCalledOnce()
    expect(subscribe).toHaveBeenCalledExactlyOnceWith({ data: { endpoint: 'https://push.example/new', keys: { p256dh: 'p', auth: 'a' } } })
    expect(router.state.location.pathname).toBe('/today')
    expect(container.textContent).toBe('Today stub')
  } finally { await cleanup() }
})

it('stays and explains when permission is denied', async () => {
  requestPermission.mockResolvedValue('denied')
  const { container, router, press, cleanup } = await renderOptIn()
  try {
    await press('Turn on questions')
    expect(container.querySelector('[role="alert"]')?.textContent).toBe('Allow notifications in your browser settings to enable them.')
    expect(subscribe).not.toHaveBeenCalled()
    expect(router.state.location.pathname).toBe('/opt-in')
  } finally { await cleanup() }
})

it('asks an iPhone Safari tab to add the app first without requesting anything', async () => {
  vi.spyOn(navigator, 'userAgent', 'get').mockReturnValue('iPhone')
  const { container, router, press, cleanup } = await renderOptIn()
  try {
    expect(container.querySelector('h1')?.textContent).toBe('Add Learn Quiz to your Home Screen')
    expect(container.querySelectorAll('ol[aria-label="Steps"] li')).toHaveLength(3)
    expect([...container.querySelectorAll('button')].some((b) => b.textContent === 'Turn on questions')).toBe(false)
    await press('I’ve added it')
    expect(router.state.location.pathname).toBe('/today')
    expect(requestPermission).not.toHaveBeenCalled()
  } finally { await cleanup() }
})

it('goes to Today on Not now without requesting permission', async () => {
  const { router, press, cleanup } = await renderOptIn()
  try {
    await press('Not now')
    expect(router.state.location.pathname).toBe('/today')
    expect(requestPermission).not.toHaveBeenCalled()
  } finally { await cleanup() }
})
