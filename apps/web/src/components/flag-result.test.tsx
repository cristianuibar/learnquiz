// @vitest-environment happy-dom
import { act } from 'react'
import { createRoot } from 'react-dom/client'
import { createMemoryHistory, createRootRoute, createRoute, createRouter, RouterProvider } from '@tanstack/react-router'
import { afterEach, expect, it, vi } from 'vitest'
import { Route as flagRoute } from '@/routes/me.flag'
import { flagResult } from '@/server/flags'

vi.mock('@/server/flags', () => ({ flagResult: vi.fn() }))
vi.mock('@tanstack/react-start', () => ({ useServerFn: (fn: unknown) => fn }))

const roots: { unmount: () => void; container: HTMLElement }[] = []

afterEach(async () => {
  for (const { unmount, container } of roots.splice(0)) {
    await act(async () => unmount())
    container.remove()
  }
  vi.clearAllMocks()
})

async function mount() {
  Object.assign(globalThis, { IS_REACT_ACT_ENVIRONMENT: true })
  const rootRoute: any = createRootRoute()
  const flag = createRoute({
    getParentRoute: () => rootRoute, path: '/me/flag',
    validateSearch: flagRoute.options.validateSearch, beforeLoad: flagRoute.options.beforeLoad, component: flagRoute.options.component,
  })
  const profile = createRoute({
    getParentRoute: () => rootRoute, path: '/me/profile',
    validateSearch: (s: Record<string, unknown>) => ({ status: s.status === 'flag-sent' ? 'flag-sent' : undefined }),
    component: () => <h1>Profile</h1>,
  })
  const router = createRouter({
    routeTree: rootRoute.addChildren([flag, profile]),
    history: createMemoryHistory({ initialEntries: ['/me/flag?conceptId=c-1'] }),
    context: { user: { id: 'u' } },
  })
  const container = document.createElement('div')
  document.body.appendChild(container)
  const root = createRoot(container)
  roots.push({ unmount: () => root.unmount(), container })
  await act(async () => { await router.load(); root.render(<RouterProvider router={router} />) })
  return { container, router }
}

async function type(el: HTMLTextAreaElement, value: string) {
  await act(async () => {
    Object.getOwnPropertyDescriptor(HTMLTextAreaElement.prototype, 'value')!.set!.call(el, value)
    el.dispatchEvent(new Event('input', { bubbles: true }))
  })
}

const send = (c: HTMLElement) => [...c.querySelectorAll('button')].find((b) => b.textContent === 'Send')!

it('keeps Send disabled until there is a note, then sends it and returns to Training progress', async () => {
  vi.mocked(flagResult).mockResolvedValue({ ok: true })
  const { container, router } = await mount()
  const area = container.querySelector('textarea')!
  expect(send(container).disabled).toBe(true)
  await type(area, '   ')
  expect(send(container).disabled).toBe(true)
  await type(area, ' Marked wrong but I was right ')
  expect(send(container).disabled).toBe(false)
  await act(async () => { container.querySelector('form')!.requestSubmit() })
  expect(flagResult).toHaveBeenCalledWith({ data: { conceptId: 'c-1', note: 'Marked wrong but I was right' } })
  await vi.waitFor(() => expect(router.state.location.pathname).toBe('/me/profile'))
  expect(router.state.location.search).toEqual({ status: 'flag-sent' })
})

it('shows a neutral alert and stays put when sending fails', async () => {
  vi.mocked(flagResult).mockRejectedValue(new Error('offline'))
  const { container, router } = await mount()
  await type(container.querySelector('textarea')!, 'Wrong')
  await act(async () => { container.querySelector('form')!.requestSubmit() })
  expect(container.querySelector('[role=alert]')?.textContent).toBe("Couldn't send. Check your connection and try again.")
  expect(router.state.location.pathname).toBe('/me/flag')
  expect(send(container).disabled).toBe(false)
})

it('ignores a late send success after the learner went Back and started a new note', async () => {
  let finishA!: (v: { ok: true }) => void
  vi.mocked(flagResult).mockReturnValueOnce(new Promise((r) => { finishA = r }))
  const { container, router } = await mount()
  await type(container.querySelector('textarea')!, 'Note A')
  await act(async () => { container.querySelector('form')!.requestSubmit() })
  await act(async () => { await router.navigate({ to: '/me/profile' }) })
  await act(async () => { await router.navigate({ to: '/me/flag', search: { conceptId: 'c-1' } }) })
  await type(container.querySelector('textarea')!, 'Note B')
  await act(async () => { finishA({ ok: true }) })
  expect(router.state.location.pathname).toBe('/me/flag')
  expect(container.querySelector('textarea')!.value).toBe('Note B')
})
