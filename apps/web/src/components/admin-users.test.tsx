// @vitest-environment happy-dom
import { act } from 'react'
import { createRoot } from 'react-dom/client'
import { createMemoryHistory, createRootRoute, createRoute, createRouter, Outlet, RouterProvider } from '@tanstack/react-router'
import { afterEach, beforeEach, expect, it, vi } from 'vitest'
import { Route as adminRoute } from '@/routes/admin'
import { Route as usersRoute } from '@/routes/admin.users'
import { listUsers, setUserBan } from '@/server/admin-users'

vi.mock('@/server/admin-users', () => ({ listUsers: vi.fn(), setUserBan: vi.fn() }))
vi.mock('@/server/admin', () => ({ getStaffSession: vi.fn() }))

const staff = { id: 'staff', name: 'Ana Popescu', email: 'ana@learnquiz.test', failedJobs: 0 }
const user = (id: string, name: string, extra = {}) => ({
  id, name, email: `${id}@acme.test`, admin: false, banned: false, banReason: null, createdAt: Date.UTC(2026, 10, 3, 12), company: { name: 'Acme', role: 'owner' }, ...extra,
})
const ana = user('staff', 'Ana Popescu', { admin: true, company: null })
const bo = user('bo', 'Bo Lee')

const cleanups: (() => Promise<void>)[] = []
beforeEach(() => {
  Object.assign(globalThis, { IS_REACT_ACT_ENVIRONMENT: true })
  vi.mocked(setUserBan).mockResolvedValue(undefined)
})
afterEach(async () => {
  for (const c of cleanups.splice(0)) await c()
  vi.clearAllMocks()
  delete (globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT
})

async function render(entry: string, inAdmin = false) {
  const rootRoute = createRootRoute({ component: Outlet, beforeLoad: inAdmin ? undefined : () => ({ staff }) })
  const options = { validateSearch: usersRoute.options.validateSearch, loaderDeps: usersRoute.options.loaderDeps, loader: usersRoute.options.loader as never, component: usersRoute.options.component }
  let tree
  if (inAdmin) {
    const admin = createRoute({ getParentRoute: () => rootRoute, path: '/admin', beforeLoad: () => ({ staff }), component: adminRoute.options.component })
    tree = rootRoute.addChildren([admin.addChildren([createRoute({ getParentRoute: (() => admin) as never, path: '/users' as never, ...options }) as never])])
  } else {
    tree = rootRoute.addChildren([createRoute({ getParentRoute: (() => rootRoute) as never, path: '/admin/users' as never, ...options }) as never])
  }
  const router = createRouter({ routeTree: tree, history: createMemoryHistory({ initialEntries: [entry] }) })
  const container = document.createElement('div')
  document.body.appendChild(container)
  const root = createRoot(container)
  await act(async () => { await router.load(); root.render(<RouterProvider router={router} />) })
  cleanups.push(async () => { await act(async () => root.unmount()); container.remove() })
  return container
}

const settle = () => act(async () => { await new Promise((r) => setTimeout(r, 10)) })
const button = (name: string) => [...document.querySelectorAll('button')].find((b) => b.textContent === name)!
const click = (el: HTMLElement) => act(async () => { el.click() })
const setValue = (el: HTMLInputElement | HTMLTextAreaElement | HTMLSelectElement, value: string, event: string) =>
  act(async () => {
    const proto = el instanceof HTMLSelectElement ? HTMLSelectElement : el instanceof HTMLTextAreaElement ? HTMLTextAreaElement : HTMLInputElement
    Object.getOwnPropertyDescriptor(proto.prototype, 'value')!.set!.call(el, value)
    el.dispatchEvent(new Event(event, { bubbles: true }))
  })
const lastData = () => vi.mocked(listUsers).mock.lastCall![0].data
const rowButton = (attr: string, id: string) => document.querySelector<HTMLElement>(`[${attr}="${id}"]`)!
const status = () => document.querySelector('[role="status"]')!.textContent

it('keeps the Users nav link current while searching or paging', async () => {
  vi.mocked(listUsers).mockResolvedValue({ users: [], total: 0 })
  for (const entry of ['/admin/users', '/admin/users?search=ann', '/admin/users?offset=25', '/admin/users?role=admin&status=banned']) {
    const container = await render(entry, true)
    const link = [...container.querySelectorAll('nav[aria-label="Staff admin"] a')].find((a) => a.textContent === 'Users')!
    expect(link.getAttribute('aria-current'), entry).toBe('page')
    await cleanups.pop()!()
  }
})

it('offers a way back to page 1 when the offset is past the last user', async () => {
  vi.mocked(listUsers).mockResolvedValue({ users: [], total: 10 })
  const container = await render('/admin/users?search=ann&offset=25')
  const link = [...container.querySelectorAll('a')].find((a) => a.textContent === 'Go to page 1')!
  expect(link.getAttribute('href')).toContain('offset=0')
  expect(link.getAttribute('href')).toContain('search=ann')
})

it('resets to the first page when a filter or the search changes', async () => {
  vi.mocked(listUsers).mockResolvedValue({ users: [ana, bo], total: 60 })
  const container = await render('/admin/users?offset=25')
  expect(lastData().offset).toBe(25)
  const select = (label: string) => [...container.querySelectorAll('label')].find((l) => l.textContent!.startsWith(label))!.querySelector('select')!
  await setValue(select('Status'), 'banned', 'change')
  expect(lastData()).toEqual({ search: '', role: 'all', status: 'banned', offset: 0 })
  await setValue(select('Global role'), 'admin', 'change')
  expect(lastData()).toEqual({ search: '', role: 'admin', status: 'banned', offset: 0 })
  await click(button('Next'))
  expect(lastData().offset).toBe(25)
  await setValue(container.querySelector('input[type="search"]')!, ' lee ', 'input')
  await act(async () => { container.querySelector('form[role="search"]')!.dispatchEvent(new Event('submit', { bubbles: true, cancelable: true })) })
  expect(lastData()).toEqual({ search: 'lee', role: 'admin', status: 'banned', offset: 0 })
})

it("does not let staff ban themselves", async () => {
  vi.mocked(listUsers).mockResolvedValue({ users: [ana, bo], total: 2 })
  await render('/admin/users')
  const own = rowButton('data-ban-user', 'staff')
  expect(own.getAttribute('aria-disabled')).toBe('true')
  expect(document.getElementById(own.getAttribute('aria-describedby')!)!.textContent).toBe("You can't ban yourself")
  await click(own)
  expect(document.querySelector('[role="dialog"]')).toBeNull()
  expect(setUserBan).not.toHaveBeenCalled()
})

it('bans with a reason, announces it, moves focus to Unban and undoes', async () => {
  vi.mocked(listUsers).mockResolvedValue({ users: [ana, bo], total: 2 })
  await render('/admin/users')
  const ban = rowButton('data-ban-user', 'bo')
  ban.focus()
  await click(ban)
  const dialog = document.querySelector('[role="dialog"]')!
  const area = dialog.querySelector('textarea')!
  expect(document.activeElement).toBe(area)
  expect(dialog.textContent).toContain('bo@acme.test · Acme · Owner')

  await click(button('Ban user'))
  expect(area.getAttribute('aria-invalid')).toBe('true')
  expect(setUserBan).not.toHaveBeenCalled()

  await act(async () => { dialog.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true, cancelable: true })) })
  await settle()
  expect(document.querySelector('[role="dialog"]')).toBeNull()
  expect(document.activeElement).toBe(rowButton('data-ban-user', 'bo'))

  await click(rowButton('data-ban-user', 'bo'))
  await setValue(document.querySelector('textarea')!, 'Spam', 'input')
  vi.mocked(listUsers).mockResolvedValue({ users: [ana, { ...bo, banned: true, banReason: 'Spam' }], total: 2 })
  await click(button('Ban user'))
  await settle()
  expect(setUserBan).toHaveBeenCalledWith({ data: { userId: 'bo', banned: true, reason: 'Spam' } })
  expect(status()).toContain('Bo Lee is banned.')
  expect(document.activeElement).toBe(rowButton('data-unban-user', 'bo'))

  vi.mocked(listUsers).mockResolvedValue({ users: [ana, bo], total: 2 })
  await click(button('Undo'))
  expect(setUserBan).toHaveBeenLastCalledWith({ data: { userId: 'bo', banned: false } })
  expect(status()).toContain('Bo Lee is unbanned.')
  expect(button('Undo')).toBeUndefined()
})

it('keeps the dialog open with an alert when banning fails', async () => {
  vi.mocked(listUsers).mockResolvedValue({ users: [ana, bo], total: 2 })
  vi.mocked(setUserBan).mockRejectedValue(new Error('Server said no'))
  await render('/admin/users')
  await click(rowButton('data-ban-user', 'bo'))
  await setValue(document.querySelector('textarea')!, 'Spam', 'input')
  await click(button('Ban user'))
  const dialog = document.querySelector('[role="dialog"]')!
  expect([...dialog.querySelectorAll('[role="alert"]')].map((a) => a.textContent).join(' ')).toContain('Server said no')
})
