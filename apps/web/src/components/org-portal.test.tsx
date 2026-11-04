// @vitest-environment happy-dom
import { act } from 'react'
import { createRoot } from 'react-dom/client'
import { createMemoryHistory, createRootRoute, createRoute, createRouter, Outlet, RouterProvider } from '@tanstack/react-router'
import { beforeEach, expect, it, vi } from 'vitest'
import { Route as appRootRoute } from '@/routes/__root'
import { Route as orgRoute } from '@/routes/org.$slug'
import { Route as indexRoute } from '@/routes/org.$slug.index'
import { Route as peopleRoute } from '@/routes/org.$slug.people'
import { Route as signInRoute } from '@/routes/sign-in'
import { getOrgOverview } from '@/server/org'
import { getPeople } from '@/server/people'
import { getPortalShell } from '@/server/org-shell'
import { getSessionFn } from '@/server/session-fn'

vi.mock('@/server/org', () => ({ getOrgOverview: vi.fn() }))
vi.mock('@/server/people', () => ({ getPeople: vi.fn() }))
const { inviteMember, cancelInvitation } = vi.hoisted(() => ({ inviteMember: vi.fn(), cancelInvitation: vi.fn() }))
vi.mock('@/lib/auth-client', () => ({ authClient: { organization: { inviteMember, cancelInvitation } } }))
vi.mock('@/server/org-shell', () => ({ getPortalShell: vi.fn() }))
vi.mock('@/server/session-fn', () => ({ getSessionFn: vi.fn() }))
vi.mock('@/server/latest-topic', () => ({ getLatestTopicIdFn: async () => null }))
vi.mock('@/server/org-settings', () => ({ getCompanyBranding: async () => null }))
vi.mock('@/components/credentials-form', () => ({ CredentialsForm: ({ onDone }: { onDone: () => void }) => <button onClick={onDone}>Sign in</button> }))

const shell = { orgId: 'org', name: 'Acme', slug: 'x', logoUrl: null, userName: 'Dana Whitaker', role: 'owner' as 'owner' | 'admin' | null, readOnly: false }
beforeEach(() => { vi.mocked(getPortalShell).mockResolvedValue(shell) })

it('sends signed-out visitors on a portal page to sign-in and back after login', async () => {
  vi.mocked(getPeople).mockResolvedValue({ id: 'org', name: 'Acme', slug: 'x', baseUrl: 'http://localhost', roles: [], people: [], readOnly: false } as never)
  Object.assign(globalThis, { IS_REACT_ACT_ENVIRONMENT: true })
  let user: { id: string; name: string; isAnonymous: boolean; role: string } | null = null
  vi.mocked(getSessionFn).mockImplementation(async () => ({ user, facebookEnabled: false, needsDisclosure: false, companyMember: false, adminCompanies: [] }))
  const rootRoute = createRootRoute({ beforeLoad: appRootRoute.options.beforeLoad, loader: appRootRoute.options.loader, component: Outlet })
  const org = createRoute({ getParentRoute: () => rootRoute, path: '/org/$slug', beforeLoad: orgRoute.options.beforeLoad, loader: orgRoute.options.loader as (ctx: { params: { slug: string } }) => unknown, errorComponent: orgRoute.options.errorComponent, component: orgRoute.options.component })
  const people = createRoute({ getParentRoute: () => org, path: '/people', loader: peopleRoute.options.loader as (ctx: { params: { slug: string } }) => ReturnType<typeof getPeople>, component: peopleRoute.options.component })
  const signIn = createRoute({ getParentRoute: () => rootRoute, path: '/sign-in', validateSearch: signInRoute.options.validateSearch, beforeLoad: signInRoute.options.beforeLoad, component: signInRoute.options.component })
  const router = createRouter({ routeTree: rootRoute.addChildren([org.addChildren([people]), signIn]), history: createMemoryHistory({ initialEntries: ['/org/x/people'] }) })
  const container = document.createElement('div')
  document.body.appendChild(container)
  const root = createRoot(container)
  try {
    await act(async () => { await router.load(); root.render(<RouterProvider router={router} />) })
    expect(router.state.location.pathname).toBe('/sign-in')
    expect(router.state.location.search).toEqual({ redirect: '/org/x/people' })
    expect(getPeople).not.toHaveBeenCalled()
    user = { id: 'owner', name: 'Owner', isAnonymous: false, role: 'user' }
    await act(async () => { container.querySelector('button')!.click() })
    await vi.waitFor(() => expect(router.state.location.pathname).toBe('/org/x/people'))
    expect(getPeople).toHaveBeenCalledWith({ data: { slug: 'x' } })
  } finally {
    await act(async () => root.unmount())
    container.remove()
    delete (globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT
  }
})

it('shows the portal nav on portal pages, trimmed for Learn Quiz staff, with a working mobile menu', async () => {
  vi.mocked(getPeople).mockResolvedValue({ id: 'org', name: 'Acme', slug: 'x', baseUrl: 'http://localhost', roles: [], people: [], readOnly: false } as never)
  Object.assign(globalThis, { IS_REACT_ACT_ENVIRONMENT: true })
  vi.mocked(getSessionFn).mockResolvedValue({ user: { id: 'u', name: 'U', isAnonymous: false, role: 'user' }, facebookEnabled: false, needsDisclosure: false, companyMember: false, adminCompanies: [] } as never)
  const rootRoute = createRootRoute({ beforeLoad: appRootRoute.options.beforeLoad, loader: appRootRoute.options.loader, component: Outlet })
  const org = createRoute({ getParentRoute: () => rootRoute, path: '/org/$slug', beforeLoad: orgRoute.options.beforeLoad, loader: orgRoute.options.loader as (ctx: { params: { slug: string } }) => unknown, errorComponent: orgRoute.options.errorComponent, component: orgRoute.options.component })
  const index = createRoute({ getParentRoute: () => org, path: '/', component: () => <p>Overview page</p> })
  const people = createRoute({ getParentRoute: () => org, path: '/people', loader: peopleRoute.options.loader as (ctx: { params: { slug: string } }) => ReturnType<typeof getPeople>, component: peopleRoute.options.component })
  const router = createRouter({ routeTree: rootRoute.addChildren([org.addChildren([index, people])]), history: createMemoryHistory({ initialEntries: ['/org/x/people'] }) })
  const container = document.createElement('div')
  document.body.appendChild(container)
  const root = createRoot(container)
  const links = () => [...container.querySelectorAll<HTMLAnchorElement>('nav[aria-label="Acme portal"] a')]
  const signOut = () => container.querySelector('button[aria-label="Sign out"]')
  const menu = () => container.querySelector<HTMLButtonElement>('button[aria-label="Menu"]')!
  try {
    await act(async () => { await router.load(); root.render(<RouterProvider router={router} />) })
    expect(links().map((a) => [a.textContent, a.getAttribute('href')])).toEqual([
      ['Overview', '/org/x'], ['Roles', '/org/x/roles'], ['Questions', '/org/x/questions'], ['People', '/org/x/people'], ['Settings', '/org/x/settings'],
    ])
    expect(links().filter((a) => a.getAttribute('aria-current') === 'page').map((a) => a.textContent)).toEqual(['People'])
    await act(async () => { links()[0].click() })
    await vi.waitFor(() => expect(router.state.location.pathname).toBe('/org/x'))
    expect(links()[0].getAttribute('aria-current')).toBe('page')
    expect(container.querySelector('nav[aria-label="Acme portal"]')!.textContent).toContain('Owner')
    expect(signOut()).not.toBeNull()

    expect(menu().getAttribute('aria-expanded')).toBe('false')
    expect(document.getElementById(menu().getAttribute('aria-controls')!)).not.toBeNull()
    await act(async () => { menu().click() })
    expect(menu().getAttribute('aria-expanded')).toBe('true')
    await act(async () => { document.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true })) })
    expect(menu().getAttribute('aria-expanded')).toBe('false')
    expect(document.activeElement).toBe(menu())

    vi.mocked(getPortalShell).mockResolvedValue({ ...shell, role: null, readOnly: true })
    await act(async () => { await router.invalidate() })
    expect(links().map((a) => a.textContent)).toEqual(['Overview', 'People'])
    expect(container.textContent).toContain('Read only')
    expect(container.textContent).toContain('Staff view')
    expect(signOut()).toBeNull()
  } finally {
    await act(async () => root.unmount())
    container.remove()
    delete (globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT
  }
})

let refresh: () => Promise<void> = async () => {}

async function renderAt(path: string, leaf: { path: string; loader: (ctx: { params: { slug: string } }) => unknown; component: typeof peopleRoute.options.component; pendingComponent?: unknown; errorComponent?: unknown }) {
  Object.assign(globalThis, { IS_REACT_ACT_ENVIRONMENT: true })
  vi.mocked(getSessionFn).mockResolvedValue({ user: { id: 'u', name: 'U', isAnonymous: false, role: 'user' }, facebookEnabled: false, needsDisclosure: false, companyMember: false, adminCompanies: [] } as never)
  const rootRoute = createRootRoute({ beforeLoad: appRootRoute.options.beforeLoad, loader: appRootRoute.options.loader, component: Outlet })
  const org = createRoute({ getParentRoute: () => rootRoute, path: '/org/$slug', beforeLoad: orgRoute.options.beforeLoad, loader: orgRoute.options.loader as (ctx: { params: { slug: string } }) => unknown, errorComponent: orgRoute.options.errorComponent, component: orgRoute.options.component })
  const router = createRouter({ routeTree: rootRoute.addChildren([org.addChildren([createRoute({ getParentRoute: () => org, ...(leaf as object) } as never)])]), history: createMemoryHistory({ initialEntries: [path] }) })
  refresh = () => router.invalidate()
  const container = document.createElement('div')
  document.body.appendChild(container)
  const root = createRoot(container)
  await act(async () => { await router.load(); root.render(<RouterProvider router={router} />) })
  return {
    container,
    router,
    cleanup: async () => {
      await act(async () => root.unmount())
      container.remove()
      delete (globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT
    },
  }
}

const peopleLeaf = { path: '/people', loader: peopleRoute.options.loader as (ctx: { params: { slug: string } }) => ReturnType<typeof getPeople>, component: peopleRoute.options.component, validateSearch: peopleRoute.options.validateSearch }

const member = (userId: string, name: string, jobRole: string, status: 'active' | 'proficient', mastery: number, extra = {}) =>
  ({ kind: 'member', userId, name, email: `${name.toLowerCase()}@acme.test`, jobRole, status, day: 9, onboardingDays: 30, proficientInDays: null, lastActiveAt: null, mastery, benchmark: 85, openCriticalErrors: 2, ...extra })
const invite = (id: string, name: string, status: 'invited' | 'expired', jobRoleId: string, jobRole: string) =>
  ({ kind: 'invite', invitationId: id, name, email: `${name.toLowerCase()}@acme.test`, jobRole, jobRoleId, status, invitedAt: Date.UTC(2026, 10, 2), expiresAt: Date.UTC(2026, 10, 9) })
const roles = [{ id: 'r1', name: 'Cashier', benchmark: 85, onboardingDays: 30, topicId: 't1', topicStatus: 'ready' }, { id: 'r2', name: 'Cook', benchmark: 85, onboardingDays: 30, topicId: 't2', topicStatus: 'ready' }]
const fixture = [
  member('u1', 'Ana', 'Cashier', 'active', 42),
  member('u2', 'Ben', 'Cook', 'proficient', 90, { proficientInDays: 21 }),
  invite('i1', 'Cy', 'invited', 'r1', 'Cashier'),
  invite('i2', 'Di', 'expired', 'r2', 'Cook'),
]
const load = (people: unknown[], extra = {}) => vi.mocked(getPeople).mockResolvedValue({ id: 'org', name: 'Acme', slug: 'x', baseUrl: 'http://localhost', roles, people, readOnly: false, ...extra } as never)
const click = (el: Element) => act(async () => { (el as HTMLElement).click() })
const named = (scope: { querySelectorAll(s: string): Iterable<Element> }, tag: string, text: string) => [...scope.querySelectorAll(tag)].find((e) => e.textContent!.trim() === text)!

it('combines search, role and status filters and reports the narrowed count', async () => {
  load(fixture)
  const { container, cleanup } = await renderAt('/org/x/people', peopleLeaf)
  try {
    const footer = () => container.querySelector('[role=status]')!.textContent
    const names = () => [...container.querySelectorAll('tbody tr')].map((r) => r.querySelector('td')!.firstElementChild!.firstElementChild!.textContent)
    expect(footer()).toBe('4 people')
    const search = container.querySelector('input[type=search]') as HTMLInputElement
    const role = container.querySelector('select') as HTMLSelectElement
    const set = (el: HTMLInputElement | HTMLSelectElement, value: string) => act(async () => {
      const proto = el instanceof HTMLSelectElement ? HTMLSelectElement.prototype : HTMLInputElement.prototype
      Object.getOwnPropertyDescriptor(proto, 'value')!.set!.call(el, value)
      el.dispatchEvent(new Event(el instanceof HTMLSelectElement ? 'change' : 'input', { bubbles: true }))
    })
    await set(role, 'r1')
    expect(names()).toEqual(['Ana', 'Cy'])
    expect(footer()).toBe('2 of 4 people')
    await set(search, 'CY@ACME')
    expect(names()).toEqual(['Cy'])
    expect(footer()).toBe('1 of 4 people')
    // Counts follow search and role, not the chip.
    expect(named(container, 'button', 'Invited 1')).toBeDefined()
    await click(named(container, 'button', 'Expired 0'))
    expect(names()).toEqual([])
    await set(search, '')
    await set(role, '')
    expect(names()).toEqual(['Di'])
    expect(footer()).toBe('1 of 4 people')
  } finally {
    await cleanup()
  }
})

it('toggles a status chip, links members, and shows progress and invites as text', async () => {
  load(fixture)
  const { container, cleanup } = await renderAt('/org/x/people', peopleLeaf)
  try {
    const chip = named(container, 'button', 'Active 1')
    expect(chip.getAttribute('aria-pressed')).toBe('false')
    await click(chip)
    expect(chip.getAttribute('aria-pressed')).toBe('true')
    await click(chip)
    expect(chip.getAttribute('aria-pressed')).toBe('false')

    const row = (name: string) => [...container.querySelectorAll('tbody tr')].find((r) => r.textContent!.includes(name))!
    expect(row('Ana').querySelector('a')!.getAttribute('href')).toBe('/org/x/people/u1')
    expect(row('Ana').textContent).toContain('42% of 85% benchmark')
    expect(row('Ana').textContent).toContain('Day 9 of 30')
    expect(row('Ben').textContent).toContain('Proficient in 21 days')
    expect(row('Cy').querySelector('a')).toBeNull()
    expect(row('Cy').textContent).toContain('Not joined')
    expect(row('Cy').textContent).toContain('Link expires Nov 9')
    expect(row('Di').textContent).toContain('Link expired Nov 9')
    expect(container.querySelectorAll('th button, [aria-sort]')).toHaveLength(0)
  } finally {
    await cleanup()
  }
})

it('shows only a card with an Invite people button when nobody is invited', async () => {
  load([])
  const { container, cleanup } = await renderAt('/org/x/people', peopleLeaf)
  try {
    expect(container.textContent).toContain('No one invited yet.')
    expect(named(container, 'button', 'Invite people')).toBeDefined()
    expect(container.querySelector('table')).toBeNull()
  } finally {
    await cleanup()
  }
})

const overviewLeaf = {
  path: '/',
  loader: indexRoute.options.loader as (ctx: { params: { slug: string } }) => ReturnType<typeof getOrgOverview>,
  component: indexRoute.options.component,
  pendingComponent: indexRoute.options.pendingComponent,
  errorComponent: indexRoute.options.errorComponent,
}
const training = { employees: 4, proficientEmployees: 1, daysToProficiency: null, criticalErrorsThisWeek: 2, documentsToReview: 6, firstProficientUserId: 'u1', openErrorUserId: null }
const noTraining = { ...training, employees: 0, proficientEmployees: 0, criticalErrorsThisWeek: 0, documentsToReview: 0, firstProficientUserId: null }
const role = { id: 'r1', name: 'Cashier', benchmark: 0.85, onboardingDays: 30, topicId: 't1', topicStatus: 'ready', people: 3, documents: 2, conceptsReady: 24, conceptsTotal: 24, preparing: false }
const building = (ready: number) => ({ ...role, id: 'r2', name: 'Barista', topicId: 't2', topicStatus: 'generating', onboardingDays: 1, documents: 1, conceptsReady: ready, conceptsTotal: 31, preparing: ready < 31 })
const overview = (o: Record<string, unknown>) => ({ name: 'Acme', slug: 'x', readOnly: false, nextStep: null, roles: [role], training, ...o }) as never
const hrefs = (c: Element) => Object.fromEntries([...c.querySelectorAll('main a')].map((a) => [a.textContent, a.getAttribute('href')]))

it('shows the figures, role table and next step on the overview', async () => {
  vi.mocked(getOrgOverview).mockResolvedValue(overview({
    roles: [role, { ...building(9), conceptsTotal: 24 }],
    nextStep: { unreviewed: 12, documentTitle: 'Opening SOP', roleId: 'r1', topicId: 't1' },
  }))
  const { container, cleanup } = await renderAt('/org/x', overviewLeaf)
  try {
    expect(container.querySelector('h1')!.textContent).toBe('Overview')
    const text = container.textContent!
    expect(text).toContain('Employees4')
    expect(text).toContain('Avg. days to proficiency—No data yet')
    expect(text).toContain('Next step: review 12 new questions from Opening SOP.')
    const links = hrefs(container)
    expect(links['Review questions']).toBe('/org/x/questions?role=r1')
    expect(links['Cashier']).toBe('/org/x/roles/r1')
    expect(links['All roles']).toBe('/org/x/roles')
    expect(links['Avg. days to proficiency—No data yet']).toBe('/org/x/people/u1')
    expect(links['Critical-step errors this week2']).toBeUndefined()
    const rows = [...container.querySelectorAll('tbody tr')].map((r) => r.textContent)
    expect(rows[0]).toContain('Ready')
    expect(rows[0]).toContain('85%')
    expect(rows[0]).toContain('30 days')
    expect(rows[1]).toContain('Preparing training')
    expect(rows[1]).toContain('9 of 24 concepts')
    expect(rows[1]).toContain('1 day')
  } finally {
    await cleanup()
  }
})

it.each([
  ['a role without documents', [{ ...role, topicStatus: 'draft', documents: 0 }], 'Cashier has no documents yet', 'Upload SOP', '/org/x/roles/r1'],
  ['no roles', [], 'Create your first job role.', 'Create your first job role.', '/org/x/roles'],
])('guides the first step on an empty overview with %s', async (_name, roles, copy, link, href) => {
  vi.mocked(getOrgOverview).mockResolvedValue(overview({ roles, training: noTraining }))
  const { container, cleanup } = await renderAt('/org/x', overviewLeaf)
  try {
    expect(container.querySelector('h2#overview-empty')!.textContent).toBe('Add your first SOP')
    expect(container.textContent).toContain(copy)
    expect(hrefs(container)[link]).toBe(href)
    expect(container.textContent).not.toContain('Employees')
  } finally {
    await cleanup()
  }
})

it('announces build progress politely in steps of five, and the end', async () => {
  let ready = 12
  vi.mocked(getOrgOverview).mockImplementation(async () => overview({ roles: [building(ready)], training: noTraining }))
  const { container, cleanup } = await renderAt('/org/x', overviewLeaf)
  try {
    const status = () => container.querySelector('p[role="status"]')!.textContent
    expect(container.querySelector('h2#overview-preparing')!.textContent).toBe('Preparing Barista training')
    expect(container.querySelector('[role="progressbar"]')!.getAttribute('aria-valuetext')).toBe('12 of 31 concepts ready')
    expect(status()).toBe('')
    const hrefsNow = hrefs(container)
    expect(hrefsNow['Invite people']).toBe('/org/x/people?invite=1')
    expect(hrefsNow['Watch the build']).toBe('/org/x/roles/r2')
    for (const [next, said] of [[14, ''], [15, '15 of 31 concepts ready'], [19, '15 of 31 concepts ready'], [31, '31 of 31 concepts ready.']] as const) {
      ready = next
      await act(async () => { await refresh() })
      expect(status()).toBe(said)
    }
  } finally {
    await cleanup()
  }
})

it.each([
  ['a figures state', { roles: [role], nextStep: { unreviewed: 1, documentTitle: 'Doc', roleId: 'r1', topicId: 't1' } }],
  ['an empty state', { roles: [{ ...role, topicStatus: 'draft', documents: 0 }], training: noTraining }],
  ['a preparing state', { roles: [building(3)], training: noTraining }],
])('hides every action staff cannot use on the read-only overview (%s)', async (_name, data) => {
  vi.mocked(getOrgOverview).mockResolvedValue(overview({ ...data, readOnly: true }))
  const { container, cleanup } = await renderAt('/org/x', overviewLeaf)
  try {
    const labels = Object.keys(hrefs(container))
    for (const gone of ['Review questions', 'Upload SOP', 'Invite people', 'Watch the build', 'All roles', 'Cashier', 'Barista']) expect(labels).not.toContain(gone)
    expect(container.textContent).not.toContain('Next step')
    expect(container.textContent).toMatch(/Cashier|Barista/)
  } finally {
    await cleanup()
  }
})

const expiresAt = new Date(Date.UTC(2026, 10, 9)).toISOString()
const dialog = () => document.querySelector<HTMLElement>('[role="dialog"]')!
const heading = () => dialog().querySelector('h2')!
const inField = (label: string, n = 0) => {
  const l = [...dialog().querySelectorAll('label')].filter((x) => x.textContent!.trim() === label)[n]
  return document.getElementById(l.getAttribute('for')!) as HTMLInputElement
}
const typeInto = (el: HTMLInputElement, value: string) => act(async () => {
  Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value')!.set!.call(el, value)
  el.dispatchEvent(new Event('input', { bubbles: true }))
})
const fillPerson = async (n: number, name: string, email: string) => { await typeInto(inField('Name', n), name); await typeInto(inField('Email', n), email) }
const submitInvites = () => act(async () => { dialog().querySelector('form')!.requestSubmit() })
const inDialog = (tag: string, text: string) => named(dialog(), tag, text)
const status = () => [...dialog().querySelectorAll('[role=status]')].map((e) => e.textContent).join('|')
const clipboard = vi.fn(async (_text: string) => {})
const inviteReply = (id: string) => ({ data: { id, expiresAt }, error: null })

async function openInvite() {
  load(fixture)
  const r = await renderAt('/org/x/people', peopleLeaf)
  await click(named(r.container, 'button', 'Invite people'))
  return r
}
// Two people filled in and created, landing on the first link dialog.
async function createTwoLinks() {
  inviteMember.mockResolvedValueOnce(inviteReply('new1')).mockResolvedValueOnce(inviteReply('new2'))
  const r = await openInvite()
  await click(inDialog('button', 'Add another person'))
  await fillPerson(0, 'Eve', 'eve@acme.test')
  await fillPerson(1, 'Fay', 'fay@acme.test')
  await submitInvites()
  await vi.waitFor(() => expect(heading().textContent).toBe('Invite link for Eve'))
  return r
}

beforeEach(() => {
  inviteMember.mockReset()
  cancelInvitation.mockReset().mockResolvedValue({ data: {}, error: null })
  clipboard.mockClear()
  Object.defineProperty(navigator, 'clipboard', { value: { writeText: clipboard }, configurable: true })
})

it('focuses the first invalid field on the invite form and ties its message to it', async () => {
  const { cleanup } = await openInvite()
  try {
    expect(heading().textContent).toBe('Invite people')
    await fillPerson(0, '   ', '')
    await submitInvites()
    const message = (el: HTMLElement) => document.getElementById(el.getAttribute('aria-describedby')!)?.textContent
    expect(inField('Name').getAttribute('aria-invalid')).toBe('true')
    expect(message(inField('Name'))).toBe('Enter a name')
    expect(message(inField('Email'))).toBe('Enter an email')
    expect(document.activeElement).toBe(inField('Name'))
    expect(inviteMember).not.toHaveBeenCalled()

    await typeInto(inField('Name'), 'Sam')
    await submitInvites()
    expect(document.activeElement).toBe(inField('Email'))
    expect(inviteMember).not.toHaveBeenCalled()
  } finally {
    await cleanup()
  }
})

it('adds a person with a numbered fieldset and focuses their Name', async () => {
  const { cleanup } = await openInvite()
  try {
    await click(inDialog('button', 'Add another person'))
    expect([...dialog().querySelectorAll('fieldset legend')].map((l) => l.textContent)).toEqual(['Person 1', 'Person 2'])
    expect(document.activeElement).toBe(inField('Name', 1))
  } finally {
    await cleanup()
  }
})

it('creates one invite per person in order and steps through their links', async () => {
  const { cleanup } = await createTwoLinks()
  try {
    expect(inviteMember.mock.calls).toEqual([
      [{ organizationId: 'org', email: 'eve@acme.test', role: 'member', inviteeName: 'Eve', jobRoleId: 'r1' }],
      [{ organizationId: 'org', email: 'fay@acme.test', role: 'member', inviteeName: 'Fay', jobRoleId: 'r1' }],
    ])
    expect(dialog().textContent).toContain('1 of 2')
    expect(inField('Invite link').value).toBe('http://localhost/join/new1')
    expect(inField('Invite link').readOnly).toBe(true)
    expect(dialog().querySelector('img')!.getAttribute('alt')).toBe('QR code for the invite link of Eve')
    await click(inDialog('button', 'Next'))
    await vi.waitFor(() => expect(document.activeElement).toBe(heading()))
    expect(heading().textContent).toBe('Invite link for Fay')
    expect(dialog().textContent).toContain('2 of 2')
    expect(inField('Invite link').value).toBe('http://localhost/join/new2')
    expect(dialog().querySelector('img')!.getAttribute('alt')).toBe('QR code for the invite link of Fay')
  } finally {
    await cleanup()
  }
})

it('keeps only the person whose email is already invited, with the error, and opens no link yet', async () => {
  inviteMember
    .mockResolvedValueOnce({ data: null, error: { code: 'USER_IS_ALREADY_INVITED_TO_THIS_ORGANIZATION', message: 'User is already invited to this organization' } })
    .mockResolvedValueOnce(inviteReply('new2'))
  const { cleanup } = await openInvite()
  try {
    await click(inDialog('button', 'Add another person'))
    await fillPerson(0, 'Eve', 'eve@acme.test')
    await fillPerson(1, 'Fay', 'fay@acme.test')
    await submitInvites()
    await vi.waitFor(() => expect(dialog().querySelectorAll('fieldset')).toHaveLength(1))
    expect(inviteMember).toHaveBeenCalledTimes(2)
    expect(inField('Email').value).toBe('eve@acme.test')
    expect(inField('Email').getAttribute('aria-invalid')).toBe('true')
    expect(dialog().textContent).toContain('User is already invited to this organization')
    expect(document.querySelectorAll('[role="dialog"]')).toHaveLength(1)
    expect(heading().textContent).toBe('Invite people')
  } finally {
    await cleanup()
  }
})

it('shows the links already created when a partly failed batch is cancelled', async () => {
  inviteMember
    .mockResolvedValueOnce(inviteReply('new1'))
    .mockResolvedValueOnce({ data: null, error: { code: 'USER_IS_ALREADY_A_MEMBER_OF_THIS_ORGANIZATION', message: 'User is already a member of this organization' } })
  const { cleanup } = await openInvite()
  try {
    await click(inDialog('button', 'Add another person'))
    await fillPerson(0, 'Eve', 'eve@acme.test')
    await fillPerson(1, 'Fay', 'fay@acme.test')
    await submitInvites()
    await vi.waitFor(() => expect(inField('Email').value).toBe('fay@acme.test'))
    const loads = vi.mocked(getPeople).mock.calls.length
    await click(inDialog('button', 'Cancel'))
    await vi.waitFor(() => expect(heading().textContent).toBe('Invite link for Eve'))
    expect(inField('Invite link').value).toBe('http://localhost/join/new1')
    expect(vi.mocked(getPeople).mock.calls.length).toBeGreaterThan(loads)
  } finally {
    await cleanup()
  }
})

it('copies the invite link and says so', async () => {
  const { cleanup } = await createTwoLinks()
  try {
    await click(inDialog('button', 'Copy link'))
    expect(clipboard).toHaveBeenCalledWith('http://localhost/join/new1')
    await vi.waitFor(() => expect(dialog().querySelector('p[role=status]')!.textContent).toContain('Link copied'))
  } finally {
    await cleanup()
  }
})

it('revokes a link, blocks copying it, and brings a fresh link back on Undo', async () => {
  const { cleanup } = await createTwoLinks()
  try {
    await click(inDialog('button', 'Revoke link'))
    expect(cancelInvitation).toHaveBeenCalledWith({ invitationId: 'new1' })
    expect(inDialog('button', 'Copy link').getAttribute('aria-disabled')).toBe('true')
    await click(inDialog('button', 'Copy link'))
    expect(clipboard).not.toHaveBeenCalled()
    expect(status()).toContain('Link revoked')

    inviteMember.mockResolvedValueOnce(inviteReply('new3'))
    await click(inDialog('button', 'Undo'))
    await vi.waitFor(() => expect(inField('Invite link').value).toBe('http://localhost/join/new3'))
    expect(inviteMember).toHaveBeenCalledTimes(3)
    expect(inviteMember.mock.calls[2][0]).toEqual({ organizationId: 'org', email: 'eve@acme.test', role: 'member', inviteeName: 'Eve', jobRoleId: 'r1' })
    expect(status()).not.toContain('Link revoked')
  } finally {
    await cleanup()
  }
})

it('replaces an expired invite from its row menu: revoke the old one, then create and show the new link', async () => {
  inviteMember.mockResolvedValueOnce(inviteReply('new1'))
  load(fixture)
  const { container, cleanup } = await renderAt('/org/x/people', peopleLeaf)
  try {
    await click(container.querySelector('button[aria-label="More actions for Di"]')!)
    await click(named(document.body, '[role=menuitem]', 'Create new link'))
    await vi.waitFor(() => expect(heading().textContent).toBe('Invite link for Di'))
    expect(cancelInvitation).toHaveBeenCalledWith({ invitationId: 'i2' })
    expect(inviteMember).toHaveBeenCalledWith({ organizationId: 'org', email: 'di@acme.test', role: 'member', inviteeName: 'Di', jobRoleId: 'r2' })
    expect(cancelInvitation.mock.invocationCallOrder[0]).toBeLessThan(inviteMember.mock.invocationCallOrder[0])
  } finally {
    await cleanup()
  }
})

it('shows an invited row\'s link, returns focus to its menu button on Done, and revokes it from the menu', async () => {
  let people = fixture
  vi.mocked(getPeople).mockImplementation(async () => ({ id: 'org', name: 'Acme', slug: 'x', baseUrl: 'http://localhost', roles, people, readOnly: false }) as never)
  cancelInvitation.mockImplementation(async () => { people = fixture.filter((p) => p.name !== 'Cy'); return { data: {}, error: null } })
  const { container, cleanup } = await renderAt('/org/x/people', peopleLeaf)
  try {
    const button = () => container.querySelector<HTMLButtonElement>('button[aria-label="More actions for Cy"]')
    await click(button()!)
    await click(named(document.body, '[role=menuitem]', 'Show invite link'))
    expect(heading().textContent).toBe('Invite link for Cy')
    expect(inField('Invite link').value).toBe('http://localhost/join/i1')
    await click(inDialog('button', 'Done'))
    // Radix hands focus back on a timer after the dialog unmounts.
    await vi.waitFor(() => expect(document.activeElement).toBe(button()))

    await click(button()!)
    await click(named(document.body, '[role=menuitem]', 'Revoke'))
    await vi.waitFor(() => expect(button()).toBeNull())
    expect(cancelInvitation).toHaveBeenCalledWith({ invitationId: 'i1' })
    expect(document.activeElement).toBe(container.querySelector('h1'))
  } finally {
    await cleanup()
  }
})

it('returns focus to the row menu button when Escape closes the menu', async () => {
  load(fixture)
  const { container, cleanup } = await renderAt('/org/x/people', peopleLeaf)
  try {
    const button = container.querySelector<HTMLButtonElement>('button[aria-label="More actions for Cy"]')!
    await click(button)
    const items = () => document.querySelectorAll('[role=menuitem]')
    expect(items().length).toBeGreaterThan(0)
    const target = (document.activeElement?.getAttribute('role') === 'menuitem' ? document.activeElement : items()[0]) as HTMLElement
    await act(async () => { target.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true })) })
    expect(items()).toHaveLength(0)
    expect(document.activeElement).toBe(button)
  } finally {
    await cleanup()
  }
})

it('opens the invite dialog from ?invite=1 and drops the param when it closes', async () => {
  load(fixture)
  const { router, cleanup } = await renderAt('/org/x/people?invite=1', peopleLeaf)
  try {
    expect(heading().textContent).toBe('Invite people')
    expect((router.state.location.search as { invite?: unknown }).invite).toBeTruthy()
    await click(inDialog('button', 'Cancel'))
    await vi.waitFor(() => expect(document.querySelector('[role="dialog"]')).toBeNull())
    expect((router.state.location.search as { invite?: unknown }).invite).toBeUndefined()
  } finally {
    await cleanup()
  }
})
