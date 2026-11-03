// @vitest-environment happy-dom
import { act } from 'react'
import { createRoot } from 'react-dom/client'
import { type RouteComponent, createMemoryHistory, createRootRoute, createRoute, createRouter, RouterProvider } from '@tanstack/react-router'
import { afterEach, expect, it, vi } from 'vitest'
import { Route as newRoute } from '@/routes/org.new'
import { Route as rolesRoute } from '@/routes/org.$slug.roles'
import { createCompany, createRole } from '@/server/org'

vi.mock('@/server/org', () => ({ createCompany: vi.fn(), createRole: vi.fn() }))
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

async function mount(path: string, component: RouteComponent, init: string, loader?: () => unknown) {
  Object.assign(globalThis, { IS_REACT_ACT_ENVIRONMENT: true })
  const rootRoute = createRootRoute()
  const route = createRoute({ getParentRoute: () => rootRoute, path, component, loader })
  const router = createRouter({ routeTree: rootRoute.addChildren([route]), history: createMemoryHistory({ initialEntries: [init] }) })
  const container = document.createElement('div')
  document.body.appendChild(container)
  const root = createRoot(container)
  roots.push({ unmount: () => root.unmount(), container })
  await act(async () => { await router.load(); root.render(<RouterProvider router={router} />) })
  return container
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

it('shows a plain role-name message on /org/new for whitespace-only input', async () => {
  const container = await mount('/org/new', newRoute.options.component!, '/org/new')
  await type(container.querySelector<HTMLInputElement>('#name')!, 'Acme')
  await type(container.querySelector<HTMLInputElement>('#role')!, '   ')
  await submit(container)
  const { input, text } = described(container, 'role')
  expect(text).toBe('Enter a role name')
  expect(input.getAttribute('aria-invalid')).toBe('true')
  expect(document.activeElement).toBe(input)
  expect(createCompany).not.toHaveBeenCalled()
  expect(container.textContent).not.toContain('"code"')
})

it('shows a plain role-name message on the roles screen for whitespace-only input', async () => {
  const container = await mount('/org/$slug/roles', rolesRoute.options.component!, '/org/x/roles', () => ({ slug: 'x', name: 'Acme', roles: [] }))
  await type(container.querySelector<HTMLInputElement>('#name')!, '   ')
  await submit(container)
  const { input, text } = described(container, 'name')
  expect(text).toBe('Enter a role name')
  expect(input.getAttribute('aria-invalid')).toBe('true')
  expect(document.activeElement).toBe(input)
  expect(createRole).not.toHaveBeenCalled()
  expect(container.textContent).not.toContain('"code"')
})

it('sends the entered whole percentage and shows the stored benchmark on the role card', async () => {
  vi.mocked(createRole).mockResolvedValue({ id: 'r' } as never)
  const container = await mount('/org/$slug/roles', rolesRoute.options.component!, '/org/x/roles', () => ({ slug: 'x', name: 'Acme', roles: [{ id: 'r', name: 'Cashier', benchmark: 0.85, onboardingDays: 30, topicId: 't', topicStatus: 'ready' }] }))
  expect(container.textContent).toContain('Benchmark: 85%')
  await type(container.querySelector<HTMLInputElement>('#name')!, 'Cashier')
  await type(container.querySelector<HTMLInputElement>('#benchmark')!, '85')
  await submit(container)
  expect(createRole).toHaveBeenCalledWith({ data: expect.objectContaining({ benchmark: 85 }) })
})

it('words the training state on the role card instead of the raw status', async () => {
  const container = await mount('/org/$slug/roles', rolesRoute.options.component!, '/org/x/roles', () => ({ slug: 'x', name: 'Acme', roles: [{ id: 'r', name: 'Cashier', benchmark: 0.85, onboardingDays: 30, topicId: 't', topicStatus: 'draft' }] }))
  expect(container.textContent).toContain('No documents yet')
  expect(container.textContent).not.toContain(' · draft')
})

it('links a server benchmark error to its field without showing JSON', async () => {
  vi.mocked(createRole).mockRejectedValue(new Error(JSON.stringify([{ origin: 'number', code: 'too_big', path: ['benchmark'], message: 'Enter a whole percentage from 50 to 100' }])))
  const container = await mount('/org/$slug/roles', rolesRoute.options.component!, '/org/x/roles', () => ({ slug: 'x', name: 'Acme', roles: [] }))
  await type(container.querySelector<HTMLInputElement>('#name')!, 'Cashier')
  await submit(container)
  const { input, text } = described(container, 'benchmark')
  expect(text).toBe('Enter a whole percentage from 50 to 100')
  expect(input.getAttribute('aria-invalid')).toBe('true')
  expect(document.activeElement).toBe(input)
  expect(container.textContent).not.toContain('"code"')
})
