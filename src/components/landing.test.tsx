// @vitest-environment happy-dom
import { readFileSync, readdirSync } from 'node:fs'
import type { DatabaseSync as SqliteDatabase } from 'node:sqlite'
import { drizzle } from 'drizzle-orm/sqlite-proxy'
import { act } from 'react'
import { createRoot } from 'react-dom/client'
import { createMemoryHistory, createRootRoute, createRoute, createRouter, RouterProvider } from '@tanstack/react-router'
import { afterAll, afterEach, beforeAll, beforeEach, expect, it, vi } from 'vitest'
import { Route as appRootRoute } from '@/routes/__root'
import { Route as indexRoute } from '@/routes/index'
import { Route as meRoute } from '@/routes/me.index'
import { Route as orgRoute } from '@/routes/org.$slug.index'
import { Route as signInRoute } from '@/routes/sign-in'
import { Route as startRoute } from '@/routes/start'
import { Route as welcomeRoute } from '@/routes/welcome'
import { getSessionUser } from '@/server/session'

const holder = vi.hoisted(() => ({ db: null as unknown }))

// Run the real routes and server handlers; replace only transport, bindings and authentication.
vi.mock('@tanstack/react-start', () => ({
  useServerFn: (fn: unknown) => fn,
  createServerFn: () => {
    const builder = { validator: () => builder, handler: (fn: unknown) => fn }
    return builder
  },
}))
vi.mock('@tanstack/react-start/server', () => ({ getRequestHeaders: () => new Headers() }))
vi.mock('@/db', () => ({ getDb: () => holder.db }))
vi.mock('@/server/env', () => ({ getEnv: () => ({}) }))
vi.mock('@/server/auth', () => ({
  facebookEnabled: () => false,
  getAuth: () => ({ api: { getSession: async () => {
    const user = await getSessionUser()
    return user && { user, session: { activeOrganizationId: null } }
  } } }),
}))
vi.mock('@/server/session', () => ({ getSessionUser: vi.fn(), getLearnerId: async () => null }))
vi.mock('@/lib/auth-client', () => ({
  authClient: { signOut: async () => {
    vi.mocked(getSessionUser).mockResolvedValue(null)
    return { error: null }
  }, signIn: { email: async ({ email }: { email: string }) => {
    const id = email.split('@')[0]
    vi.mocked(getSessionUser).mockResolvedValue({ id, name: id, isAnonymous: false } as never)
    return { error: null }
  } } },
}))

// Keep node:sqlite out of Vite's browser-environment import resolver.
const { DatabaseSync } = process.getBuiltinModule('node:sqlite') as typeof import('node:sqlite')
let sqlite: SqliteDatabase
beforeAll(() => {
  sqlite = new DatabaseSync(':memory:')
  for (const file of readdirSync('drizzle').filter((f) => f.endsWith('.sql')).sort()) {
    sqlite.exec(readFileSync(`drizzle/${file}`, 'utf8').replaceAll('--> statement-breakpoint', ''))
  }
  for (const id of ['owner', 'admin', 'combined', 'employee', 'standalone']) {
    sqlite.prepare('INSERT INTO user (id, name, email) VALUES (?, ?, ?)').run(id, id, `${id}@example.test`)
    sqlite.prepare('INSERT INTO consents (user_id, kind, accepted_at) VALUES (?, ?, ?)').run(id, 'disclosure-v1', 1)
  }
  for (const [id, name] of [['northwind', 'Northwind'], ['contoso', 'Contoso']]) {
    sqlite.prepare('INSERT INTO organization (id, name, slug, created_at) VALUES (?, ?, ?, ?)').run(id, name, id, 1)
  }
  for (const [id, org, role, createdAt] of [
    ['owner', 'northwind', 'owner', 1], ['owner', 'contoso', 'admin', 2],
    ['admin', 'northwind', 'admin', 1], ['combined', 'northwind', 'member,admin', 1],
    ['employee', 'northwind', 'member', 1], ['employee', 'contoso', 'member', 2],
  ] as const) {
    sqlite.prepare('INSERT INTO member (id, user_id, organization_id, role, created_at) VALUES (?, ?, ?, ?, ?)').run(`${id}-${org}`, id, org, role, createdAt)
  }
  holder.db = drizzle(async (sql, params, method) => {
    const stmt = sqlite.prepare(sql)
    stmt.setReturnArrays(true)
    if (method === 'run') { stmt.run(...params); return { rows: [] } }
    return { rows: (method === 'get' ? stmt.get(...params) : stmt.all(...params)) as never }
  })
})
beforeEach(() => {
  sqlite.exec('BEGIN')
  vi.mocked(getSessionUser).mockResolvedValue(null)
  Object.assign(globalThis, { IS_REACT_ACT_ENVIRONMENT: true })
})
afterEach(() => {
  sqlite.exec('ROLLBACK')
  delete (globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT
})
afterAll(() => sqlite.close())

async function renderApp(initialEntry = '/sign-in') {
  const rootRoute = createRootRoute({ beforeLoad: appRootRoute.options.beforeLoad, component: appRootRoute.options.component, loader: appRootRoute.options.loader })
  const routes = [
    createRoute({ getParentRoute: () => rootRoute, path: '/', beforeLoad: indexRoute.options.beforeLoad, component: indexRoute.options.component }),
    createRoute({ getParentRoute: () => rootRoute, path: '/sign-in', beforeLoad: signInRoute.options.beforeLoad, validateSearch: signInRoute.options.validateSearch, component: signInRoute.options.component }),
    createRoute({ getParentRoute: () => rootRoute, path: '/start', validateSearch: startRoute.options.validateSearch, component: startRoute.options.component }),
    createRoute({ getParentRoute: () => rootRoute, path: '/me', beforeLoad: meRoute.options.beforeLoad, loader: meRoute.options.loader, component: meRoute.options.component }),
    createRoute({ getParentRoute: () => rootRoute, path: '/org/$slug', loader: orgRoute.options.loader, errorComponent: orgRoute.options.errorComponent, component: orgRoute.options.component }),
    createRoute({ getParentRoute: () => rootRoute, path: '/welcome', beforeLoad: welcomeRoute.options.beforeLoad, validateSearch: welcomeRoute.options.validateSearch, component: welcomeRoute.options.component }),
  ]
  const router = createRouter({ routeTree: rootRoute.addChildren(routes), history: createMemoryHistory({ initialEntries: [initialEntry] }) })
  const container = document.createElement('div')
  document.body.appendChild(container)
  const root = createRoot(container)
  await act(async () => { await router.load(); root.render(<RouterProvider router={router} />) })
  return {
    container, router,
    async cleanup() { await act(async () => root.unmount()); container.remove() },
  }
}

it.each([
  ['owner', '/org/northwind', 'Northwind'],
  ['admin', '/org/northwind', 'Northwind'],
  ['combined', '/org/northwind', 'Northwind'],
  ['employee', '/start', 'What do you want to learn?'],
  ['standalone', '/start', 'What do you want to learn?'],
])('signs in %s and lands on %s', async (id, pathname, heading) => {
  const { container, router, cleanup } = await renderApp()
  try {
    container.querySelector<HTMLInputElement>('#email')!.value = `${id}@example.test`
    container.querySelector<HTMLInputElement>('#password')!.value = 'test-password'
    await act(async () => {
      container.querySelector('form')!.dispatchEvent(new Event('submit', { bubbles: true, cancelable: true }))
      await vi.waitFor(() => expect(router.state.location.pathname).toBe(pathname))
    })
    expect(container.querySelector('h1')?.textContent).toBe(heading)
    if (id === 'employee' || id === 'standalone') {
      await act(async () => { await router.navigate({ to: '/me' }) })
      expect(container.querySelectorAll('a[href^="/org/"]')).toHaveLength(0)
    }
  } finally { await cleanup() }
})

it('lets an owner leave the portal to train, return through Profile and sign out', async () => {
  sqlite.prepare('INSERT INTO org_settings (org_id, company_name, working_hours_json, logo_key, accent) VALUES (?, ?, ?, ?, ?)').run('northwind', 'Northwind', JSON.stringify({ days: [1, 2, 3, 4, 5], start: '09:00', end: '17:00' }), 'northwind-logo', '#543189')
  vi.mocked(getSessionUser).mockResolvedValue({ id: 'owner', name: 'Owner', isAnonymous: false, role: 'admin' } as never)
  const { container, router, cleanup } = await renderApp('/')
  try {
    expect(router.state.location.pathname).toBe('/org/northwind')
    expect(container.querySelector('header img')?.getAttribute('alt')).toBe('Northwind')
    expect(container.querySelector('h1')?.textContent).toBe('Northwind')
    await act(async () => { container.querySelector<HTMLAnchorElement>('header a')!.click(); await router.load() })
    expect(router.state.location.pathname).toBe('/start')
    expect(container.querySelector('h1')?.textContent).toBe('What do you want to learn?')
    await act(async () => { container.querySelector<HTMLAnchorElement>('a[href="/me"]')!.click(); await router.load() })
    expect([...container.querySelectorAll('a[href^="/org/"]')].map((a) => a.textContent)).toEqual(['Northwind portal', 'Contoso portal'])
    expect(container.querySelector('a[href="/admin"]')?.textContent).toBe('Staff area')
    await act(async () => { container.querySelector<HTMLAnchorElement>('a[href="/org/contoso"]')!.click(); await router.load() })
    expect(router.state.location.pathname).toBe('/org/contoso')
    expect(container.querySelector('h1')?.textContent).toBe('Contoso')
    await act(async () => { container.querySelector<HTMLAnchorElement>('header a')!.click(); await router.load() })
    await act(async () => { container.querySelector<HTMLAnchorElement>('a[href="/me"]')!.click(); await router.load() })
    const signOut = [...container.querySelectorAll<HTMLButtonElement>('main button')].find((button) => button.textContent === 'Sign out')!
    await act(async () => {
      signOut.click()
      await vi.waitFor(() => expect(router.state.location.pathname).toBe('/'))
    })
    expect(container.querySelector('h1')?.textContent).toBe('Quiz it, until you learn it')
  } finally { await cleanup() }
})

it('requires disclosure before sending an owner to the portal', async () => {
  sqlite.prepare('DELETE FROM consents WHERE user_id = ?').run('owner')
  vi.mocked(getSessionUser).mockResolvedValue({ id: 'owner', name: 'Owner', isAnonymous: false } as never)
  const { container, router, cleanup } = await renderApp('/')
  try {
    expect(router.state.location.pathname).toBe('/welcome')
    expect(container.querySelector('h1')?.textContent).toBe('Before you start')
    await act(async () => {
      container.querySelector<HTMLButtonElement>('main button')!.click()
      await vi.waitFor(() => expect(router.state.location.pathname).toBe('/org/northwind'))
    })
    expect(container.querySelector('h1')?.textContent).toBe('Northwind')
  } finally { await cleanup() }
})
