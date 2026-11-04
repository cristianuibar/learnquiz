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
import { Route as orgLayoutRoute } from '@/routes/org.$slug'
import { Route as orgRoute } from '@/routes/org.$slug.index'
import { Route as rolesRoute } from '@/routes/org.$slug.roles'
import { Route as roleDetailRoute } from '@/routes/org.$slug.roles_.$roleId'
import { Route as signInRoute } from '@/routes/sign-in'
import { Route as startRoute } from '@/routes/start'
import { Route as todayRoute } from '@/routes/today'
import { Route as welcomeRoute } from '@/routes/welcome'
import { getLearnerId, getSessionUser } from '@/server/session'

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
vi.mock('@/server/session', () => ({ getSessionUser: vi.fn(), getLearnerId: vi.fn() }))
vi.mock('@/lib/auth-client', () => ({
  authClient: { signOut: async () => {
    vi.mocked(getSessionUser).mockResolvedValue(null)
    return { error: null }
  }, signIn: { email: async ({ email }: { email: string }) => {
    const id = email.split('@')[0]
    vi.mocked(getSessionUser).mockResolvedValue({ id, name: id, isAnonymous: false } as never)
    return { error: null }
  } }, signUp: { email: async () => {
    vi.mocked(getSessionUser).mockResolvedValue({ id: 'guest', name: 'Gina', isAnonymous: false } as never)
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
  for (const id of ['owner', 'admin', 'combined', 'employee', 'standalone', 'learner', 'guest', 'newguest']) {
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
  vi.mocked(getLearnerId).mockImplementation(async () => (await getSessionUser())?.id ?? null)
  Object.assign(globalThis, { IS_REACT_ACT_ENVIRONMENT: true })
})
afterEach(() => {
  sqlite.exec('ROLLBACK')
  delete (globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT
})
afterAll(() => sqlite.close())

async function renderApp(initialEntry = '/sign-in') {
  const rootRoute = createRootRoute({ beforeLoad: appRootRoute.options.beforeLoad, component: appRootRoute.options.component, loader: appRootRoute.options.loader })
  const orgLayout = createRoute({ getParentRoute: () => rootRoute, path: '/org/$slug', beforeLoad: orgLayoutRoute.options.beforeLoad, component: orgLayoutRoute.options.component })
  const routes = [
    createRoute({ getParentRoute: () => rootRoute, path: '/', beforeLoad: indexRoute.options.beforeLoad, component: indexRoute.options.component }),
    createRoute({ getParentRoute: () => rootRoute, path: '/sign-in', beforeLoad: signInRoute.options.beforeLoad, validateSearch: signInRoute.options.validateSearch, component: signInRoute.options.component }),
    createRoute({ getParentRoute: () => rootRoute, path: '/join/$token', component: () => <h1>Join</h1> }),
    createRoute({ getParentRoute: () => rootRoute, path: '/start', validateSearch: startRoute.options.validateSearch, component: startRoute.options.component }),
    createRoute({ getParentRoute: () => rootRoute, path: '/today', beforeLoad: todayRoute.options.beforeLoad, loader: todayRoute.options.loader, errorComponent: todayRoute.options.errorComponent, component: todayRoute.options.component }),
    orgLayout.addChildren([
      createRoute({ getParentRoute: () => orgLayout, path: '/', loader: orgRoute.options.loader as (ctx: { params: { slug: string } }) => unknown, errorComponent: orgRoute.options.errorComponent, component: orgRoute.options.component }),
      createRoute({ getParentRoute: () => orgLayout, path: '/roles', loader: rolesRoute.options.loader as (ctx: { params: { slug: string } }) => unknown, errorComponent: rolesRoute.options.errorComponent, component: rolesRoute.options.component }),
      createRoute({ getParentRoute: () => orgLayout, path: '/roles/$roleId', component: roleDetailRoute.options.component }),
    ]),
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
  } finally { await cleanup() }
})

it('switches the sign-in heading and page title with the form mode', async () => {
  const { container, cleanup } = await renderApp()
  const toggle = (label: string) => act(async () => [...container.querySelectorAll('button')].find((b) => b.textContent === label)!.click())
  try {
    expect([container.querySelector('h1')?.textContent, document.title]).toEqual(['Sign in', 'Sign in · Learn Quiz'])
    await toggle('Create an account')
    expect([container.querySelector('h1')?.textContent, document.title]).toEqual(['Create an account', 'Create an account · Learn Quiz'])
    expect(container.querySelector('button[type="submit"]')?.textContent).toBe('Create account')
    await toggle('I already have an account')
    expect([container.querySelector('h1')?.textContent, document.title]).toEqual(['Sign in', 'Sign in · Learn Quiz'])
  } finally { await cleanup() }
})

it('prefills an editable email from the sign-in link and returns to the redirect', async () => {
  const { container, router, cleanup } = await renderApp('/sign-in?email=learner%40example.test&redirect=%2Fjoin%2Finvite')
  try {
    const email = container.querySelector<HTMLInputElement>('#email')!
    expect(email.value).toBe('learner@example.test')
    expect(email.readOnly).toBe(false)
    container.querySelector<HTMLInputElement>('#password')!.value = 'test-password'
    await act(async () => {
      container.querySelector('form')!.dispatchEvent(new Event('submit', { bubbles: true, cancelable: true }))
      await vi.waitFor(() => expect(router.state.location.pathname).toBe('/join/invite'))
    })
    expect(container.querySelector('h1')?.textContent).toBe('Join')
  } finally { await cleanup() }
})

it('lets an owner leave the portal to train and return to a portal', async () => {
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
    await act(async () => { await router.navigate({ to: '/org/$slug', params: { slug: 'contoso' } }) })
    expect(container.querySelector('h1')?.textContent).toBe('Contoso')
    await act(async () => { container.querySelector<HTMLAnchorElement>('header a')!.click(); await router.load() })
    expect(router.state.location.pathname).toBe('/start')
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

function seedTopic(learnerId: string) {
  const now = Date.now()
  sqlite.prepare("INSERT INTO topics (id, learner_id, title, status, created_at) VALUES ('t1', ?, 'Spanish verbs', 'ready', 1)").run(learnerId)
  sqlite.prepare("INSERT INTO units (id, topic_id, \"order\", name) VALUES ('u1', 't1', 0, 'Unit')").run()
  sqlite.prepare("INSERT INTO concepts (id, topic_id, unit_id, \"order\", name, summary) VALUES ('c1', 't1', 'u1', 0, 'Concept', 'Summary')").run()
  for (const [id, due] of [['i1', now - 1000], ['i2', now + 86_400_000]] as const) {
    sqlite.prepare("INSERT INTO items (id, concept_id, topic_id, format, payload_json, created_at) VALUES (?, 'c1', 't1', 'mcq', '{}', 1)").run(id)
    sqlite.prepare('INSERT INTO learner_item (learner_id, item_id, due, stability, difficulty, state) VALUES (?, ?, ?, 1, 5, 2)').run(learnerId, id, due)
  }
  sqlite.prepare("INSERT INTO learner_topic (learner_id, topic_id, streak_count, last_session_at, xp) VALUES (?, 't1', 4, ?, 120)").run(learnerId, Date.now())
  sqlite.prepare("INSERT INTO placements (id, learner_id, topic_id, log_json, created_at) VALUES ('p1', ?, 't1', '{}', 1)").run(learnerId)
}

it('signs in a learner with a ready topic and lands on Today', async () => {
  seedTopic('learner')
  const { container, router, cleanup } = await renderApp()
  try {
    container.querySelector<HTMLInputElement>('#email')!.value = 'learner@example.test'
    container.querySelector<HTMLInputElement>('#password')!.value = 'test-password'
    await act(async () => {
      container.querySelector('form')!.dispatchEvent(new Event('submit', { bubbles: true, cancelable: true }))
      await vi.waitFor(() => expect(router.state.location.pathname).toBe('/today'))
    })
    expect(container.querySelector('h1')?.textContent).toBe('Today')
    expect(container.querySelector('main h2')?.textContent).toBe('Your first session')
    expect([...container.querySelectorAll('main button')].map((b) => b.textContent)).toEqual(['Play · 5 min'])
    expect(container.querySelector('a[href="/start"]')?.textContent).toBe('Learn something new')
  } finally { await cleanup() }
})

it('sends a guest who creates an account to Today with their topic', async () => {
  seedTopic('guest')
  vi.mocked(getSessionUser).mockResolvedValue({ id: 'guest', name: 'Guest', isAnonymous: true } as never)
  const { container, router, cleanup } = await renderApp()
  try {
    await act(async () => { [...container.querySelectorAll('button')].find((b) => b.textContent === 'Create an account')!.click() })
    container.querySelector<HTMLInputElement>('#name')!.value = 'Gina'
    container.querySelector<HTMLInputElement>('#email')!.value = 'gina@example.test'
    container.querySelector<HTMLInputElement>('#password')!.value = 'test-password'
    await act(async () => {
      container.querySelector('form')!.dispatchEvent(new Event('submit', { bubbles: true, cancelable: true }))
      await vi.waitFor(() => expect(router.state.location.pathname).toBe('/today'))
    })
    expect(container.querySelector('h1')?.textContent).toBe('Today')
    expect(container.querySelector('main h2')?.textContent).toBe('Your first session')
  } finally { await cleanup() }
})

it('sends a new guest without a topic from Today to Start', async () => {
  vi.mocked(getSessionUser).mockResolvedValue({ id: 'newguest', name: 'Guest', isAnonymous: true } as never)
  const { container, router, cleanup } = await renderApp('/today')
  try {
    expect(router.state.location.pathname).toBe('/start')
    expect(container.querySelector('h1')?.textContent).toBe('What do you want to learn?')
  } finally { await cleanup() }
})

it('lists job roles linking to their detail pages and to no page that does not exist', async () => {
  sqlite.prepare('INSERT INTO job_roles (id, org_id, name, created_at) VALUES (?, ?, ?, ?)').run('barista', 'northwind', 'Barista', 1)
  sqlite.prepare('INSERT INTO topics (id, job_role_id, title, created_at) VALUES (?, ?, ?, ?)').run('barista-topic', 'barista', 'Barista', 1)
  vi.mocked(getSessionUser).mockResolvedValue({ id: 'owner', name: 'Owner', isAnonymous: false } as never)
  const { container, router, cleanup } = await renderApp('/org/northwind')
  try {
    await act(async () => { container.querySelector<HTMLAnchorElement>('nav[aria-label="Company"] a[href="/org/northwind/roles"]')!.click(); await router.load() })
    expect(container.querySelector('h1')?.textContent).toBe('Job roles')
    expect(container.querySelector('main li')?.textContent).toContain('Barista')
    expect(container.querySelector('main li a')?.getAttribute('href')).toBe('/org/northwind/roles/barista')
    for (const a of container.querySelectorAll<HTMLAnchorElement>('main a')) {
      expect(router.matchRoutes(a.getAttribute('href')!).at(-1)?.pathname.replace(/(.)\/$/, '$1')).toBe(a.getAttribute('href'))
    }
  } finally { await cleanup() }
})

it('styles the visitor Sign in link as a label, not a smaller body size', async () => {
  const { container, cleanup } = await renderApp('/')
  try {
    const signIn = container.querySelector<HTMLAnchorElement>('header a[href="/sign-in"]')!
    expect([signIn.textContent, signIn.classList.contains('text-label'), signIn.classList.contains('text-sm')]).toEqual(['Sign in', true, false])
  } finally { await cleanup() }
})
