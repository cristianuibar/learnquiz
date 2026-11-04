// @vitest-environment happy-dom
import { act } from 'react'
import { createRoot } from 'react-dom/client'
import { type RouteComponent, createMemoryHistory, createRootRoute, createRoute, createRouter, RouterProvider, Outlet, useParams } from '@tanstack/react-router'
import { PortalProvider } from '@/components/portal/portal-context'
import { afterEach, expect, it, vi } from 'vitest'
import { Route as newRoute } from '@/routes/org.new'
import { Route as rolesRoute } from '@/routes/org.$slug.roles'
import { createCompany, createRole } from '@/server/org'

vi.mock('@/server/org', () => ({ createCompany: vi.fn(), createRole: vi.fn(), updateRole: vi.fn() }))
vi.mock('@/server/role-documents', () => ({ uploadRoleDocument: vi.fn() }))
vi.mock('@tanstack/react-start', () => ({ useServerFn: (fn: unknown) => fn }))

const roots: { unmount: () => void; container: HTMLElement }[] = []

afterEach(async () => {
  for (const { unmount, container } of roots.splice(0)) {
    await act(async () => unmount())
    container.remove()
  }
  vi.clearAllMocks()
})

// The portal layout provides the link context; screens are rendered under it here.
function PortalRoot() {
  const { slug } = useParams({ strict: false })
  return <PortalProvider slug={slug ?? ''} base="org" readOnly={false}><Outlet /></PortalProvider>
}

async function mount(path: string, component: RouteComponent, init: string, loader?: () => unknown, context?: object) {
  Object.assign(globalThis, { IS_REACT_ACT_ENVIRONMENT: true })
  const rootRoute = createRootRoute({ component: PortalRoot })
  const route = createRoute({ getParentRoute: () => rootRoute, path, component, loader })
  const slugRoute = createRoute({ getParentRoute: () => rootRoute, path: '/org/$slug', component: () => <p>Company page</p> })
  const roleRoute = createRoute({ getParentRoute: () => rootRoute, path: '/org/$slug/roles/$roleId', component: () => <p>Role page</p> })
  const router = createRouter({ routeTree: rootRoute.addChildren([route, slugRoute, roleRoute]), history: createMemoryHistory({ initialEntries: [init] }), context } as never)
  const container = document.createElement('div')
  document.body.appendChild(container)
  const root = createRoot(container)
  roots.push({ unmount: () => root.unmount(), container })
  await act(async () => { await router.load(); root.render(<RouterProvider router={router} />) })
  return Object.assign(container, { router })
}

async function type(input: HTMLInputElement, value: string) {
  await act(async () => {
    const set = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value')!.set!
    set.call(input, value)
    input.dispatchEvent(new Event('input', { bubbles: true }))
  })
}

async function submit(container: HTMLElement) {
  await act(async () => { container.querySelector('form')!.requestSubmit() })
}

function described(container: HTMLElement, id: string) {
  const input = container.querySelector<HTMLInputElement>(`#${id}`)!
  const target = container.querySelector(`#${input.getAttribute('aria-describedby')}`)
  return { input, text: target?.textContent }
}

const label = (c: HTMLElement, text: string) =>
  [...c.querySelectorAll('label')].find((l) => l.textContent?.includes(text))!.control as HTMLInputElement

it.each(['   ', ' '])('shows a plain role-name message on /org/new for whitespace-only input %j', async (role) => {
  const container = await mount('/org/new', newRoute.options.component!, '/org/new', undefined, { user: { email: 'dana@northwind.test' } })
  expect(container.textContent).toContain('Signed in as dana@northwind.test')
  await type(label(container, 'Company name'), 'Acme')
  await type(label(container, 'First job role'), role)
  await submit(container)
  const { input, text } = described(container, 'role')
  expect(text).toBe('Enter a role name')
  expect(input.getAttribute('aria-invalid')).toBe('true')
  expect(document.activeElement).toBe(input)
  expect(createCompany).not.toHaveBeenCalled()
  expect(container.textContent).not.toContain('"code"')
})

it('keeps the entries and focuses the submit button when creating the company fails', async () => {
  vi.mocked(createCompany).mockRejectedValueOnce(new Error('Server said no'))
  const container = await mount('/org/new', newRoute.options.component!, '/org/new')
  await type(label(container, 'Company name'), 'Acme')
  await type(label(container, 'First job role'), 'Cashier')
  const button = container.querySelector<HTMLButtonElement>('button[type="submit"]')!
  await act(async () => { button.focus(); container.querySelector('form')!.requestSubmit(button) })
  const alert = container.querySelector('[role="alert"]')!
  expect(alert.textContent).toContain("Couldn't create the company.")
  expect(alert.textContent).toContain('Server said no')
  expect(alert.textContent).toContain('Your entries are still here.')
  expect(label(container, 'Company name').value).toBe('Acme')
  expect(label(container, 'First job role').value).toBe('Cashier')
  expect(document.activeElement).toBe(button)
})

it('opens the new company once it is created', async () => {
  vi.mocked(createCompany).mockResolvedValueOnce({ slug: 'acme' } as never)
  const container = await mount('/org/new', newRoute.options.component!, '/org/new')
  await type(label(container, 'Company name'), 'Acme')
  await type(label(container, 'First job role'), 'Cashier')
  await submit(container)
  expect(container.router.state.location.pathname).toBe('/org/acme')
})

const role = (over: object = {}) => ({
  id: 'r1', name: 'Cashier', benchmark: 0.85, onboardingDays: 30, topicId: 't', topicStatus: 'draft', failedDocuments: 0,
  peopleCount: 0, documentCount: 0, conceptsReady: 0, conceptsTotal: 0, preparing: false, ...over,
})
const mountRoles = (roles: object[] = []) =>
  mount('/org/$slug/roles', rolesRoute.options.component!, '/org/x/roles', () => ({ slug: 'x', name: 'Acme', roles }))

async function openDialog() {
  const button = [...document.querySelectorAll('button')].find((b) => b.textContent?.includes('Create role'))!
  await act(async () => { button.click() })
}
const dialogForm = () => document.querySelector<HTMLFormElement>('[role="dialog"] form')!
const field = (text: string) =>
  [...dialogForm().querySelectorAll('label')].find((l) => l.textContent?.startsWith(text))!.control as HTMLInputElement
const describedBy = (input: HTMLInputElement) => document.getElementById(input.getAttribute('aria-describedby')!.split(' ')[0])?.textContent

it.each(['   ', ' '])('shows a plain role-name message when creating a role with whitespace-only name %j', async (name) => {
  const container = await mountRoles()
  await openDialog()
  await type(field('Name'), name)
  await act(async () => { dialogForm().requestSubmit() })
  const input = field('Name')
  expect(describedBy(input)).toBe('Enter a role name')
  expect(input.getAttribute('aria-invalid')).toBe('true')
  expect(document.activeElement).toBe(input)
  expect(createRole).not.toHaveBeenCalled()
  expect(container.textContent).not.toContain('"code"')
})

it('opens the create dialog on Name and returns focus to its button on Cancel', async () => {
  await mountRoles([role()])
  const button = [...document.querySelectorAll('button')].find((b) => b.textContent?.includes('Create role'))!
  await act(async () => { button.focus(); button.click() })
  expect(document.activeElement).toBe(field('Name'))
  const cancel = [...dialogForm().querySelectorAll('button')].find((b) => b.textContent === 'Cancel')!
  await act(async () => { cancel.click() })
  await vi.waitFor(() => {
    expect(document.querySelector('[role="dialog"]')).toBeNull()
    expect(document.activeElement).toBe(button)
  })
})

it('sends the entered whole percentage and opens the new role', async () => {
  vi.mocked(createRole).mockResolvedValue({ id: 'new1' } as never)
  const container = await mountRoles([role()])
  await openDialog()
  await type(field('Name'), 'Barista')
  await type(field('Benchmark'), '85')
  await act(async () => { dialogForm().requestSubmit() })
  expect(createRole).toHaveBeenCalledWith({ data: expect.objectContaining({ slug: 'x', name: 'Barista', benchmark: 85 }) })
  expect(container.router.state.location.pathname).toBe('/org/x/roles/new1')
})

it('links a server benchmark error to its field without showing JSON', async () => {
  vi.mocked(createRole).mockRejectedValue(new Error(JSON.stringify([{ origin: 'number', code: 'too_big', path: ['benchmark'], message: 'Enter a whole percentage from 50 to 100' }])))
  await mountRoles()
  await openDialog()
  await type(field('Name'), 'Cashier')
  await act(async () => { dialogForm().requestSubmit() })
  const input = field('Benchmark')
  expect(describedBy(input)).toBe('Enter a whole percentage from 50 to 100')
  expect(input.getAttribute('aria-invalid')).toBe('true')
  expect(document.activeElement).toBe(input)
  expect(document.body.textContent).not.toContain('"code"')
})

it('shows a duplicate role name under the Name field', async () => {
  vi.mocked(createRole).mockRejectedValue(new Error(JSON.stringify([{ code: 'custom', path: ['name'], message: 'A role with this name already exists' }])))
  await mountRoles([role()])
  await openDialog()
  await type(field('Name'), 'Cashier')
  await act(async () => { dialogForm().requestSubmit() })
  expect(describedBy(field('Name'))).toBe('A role with this name already exists')
  expect(document.body.textContent).not.toContain('"code"')
})

it.each([
  ['no documents', role(), ['No documents yet', 'Upload SOP']],
  ['preparing', role({ topicStatus: 'generating', preparing: true, documentCount: 1, conceptsReady: 9, conceptsTotal: 24 }), ['Preparing training', '9 of 24 concepts']],
  ['ready', role({ topicStatus: 'ready', documentCount: 1 }), ['Ready']],
  ['failed topic', role({ topicStatus: 'failed', documentCount: 1 }), ['Training failed']],
  ['failed documents', role({ failedDocuments: 2, documentCount: 2 }), ['Training failed']],
  ['ready topic with only failed documents left', role({ topicStatus: 'ready', failedDocuments: 1, documentCount: 1 }), ['Training failed']],
  ['documents added', role({ documentCount: 1 }), ['Documents added']],
])('words the training state: %s', async (_name, r, words) => {
  const container = await mountRoles([r])
  for (const w of words) expect(container.textContent).toContain(w)
  expect(container.textContent).not.toContain(' · draft')
})

it.each([
  ['draft', role({ failedDocuments: 2, documentCount: 2 })],
  ['ready', role({ topicStatus: 'ready', failedDocuments: 2, documentCount: 2 })],
])('links the failed banner to the role detail for a %s topic', async (_status, r) => {
  const container = await mountRoles([r])
  const alert = container.querySelector('[role="alert"]')!
  expect(alert.textContent).toContain('2 documents have no selectable text')
  expect(alert.querySelector('a')!.textContent).toBe('Fix documents')
  expect(alert.querySelector('a')!.getAttribute('href')).toBe('/org/x/roles/r1')
})

it.each([
  ['readable documents', role({ topicStatus: 'failed', documentCount: 1 }), 'The curriculum build did not finish. Build the curriculum again.', 'Open role'],
  ['no documents', role({ topicStatus: 'failed' }), 'Add a document to build the curriculum.', 'Upload SOP'],
])('does not ask to fix documents when a build failed with %s', async (_name, r, text, link) => {
  const container = await mountRoles([r])
  const alert = container.querySelector('[role="alert"]')!
  expect(alert.textContent).toContain(text)
  expect(alert.querySelector('a')!.textContent).toBe(link)
  expect(alert.querySelector('a')!.getAttribute('href')).toBe('/org/x/roles/r1')
})
