// @vitest-environment happy-dom
import { act } from 'react'
import { createRoot } from 'react-dom/client'
import { createMemoryHistory, createRootRoute, createRouter, RouterProvider } from '@tanstack/react-router'
import { afterEach, expect, it, vi } from 'vitest'
import { StartButton } from '@/components/start-button'
import { startSession } from '@/server/play'

vi.mock('@tanstack/react-start', () => ({ useServerFn: (fn: unknown) => fn }))
vi.mock('@/server/play', () => ({ startPlacement: vi.fn(), startSession: vi.fn() }))

afterEach(() => vi.useRealTimers())

it('shows the estimate, then says it is taking longer than usual while it keeps working', async () => {
  vi.useFakeTimers()
  Object.assign(globalThis, { IS_REACT_ACT_ENVIRONMENT: true })
  vi.mocked(startSession).mockReturnValue(new Promise(() => {}))
  const rootRoute = createRootRoute({ component: () => <StartButton topicId="t1">Start</StartButton> })
  const router = createRouter({ routeTree: rootRoute, history: createMemoryHistory({ initialEntries: ['/'] }) })
  const container = document.createElement('div')
  document.body.appendChild(container)
  const root = createRoot(container)
  await act(async () => { await router.load(); root.render(<RouterProvider router={router} />) })

  await act(async () => container.querySelector('button')!.click())
  const status = () => container.querySelector('[role=status]')!
  await act(async () => { await vi.advanceTimersByTimeAsync(12_000) })
  expect(status().textContent).toContain('Usually under 15 s')
  expect(status().textContent).toContain('0:12 elapsed')

  await act(async () => { await vi.advanceTimersByTimeAsync(4_000) })
  expect(status().textContent).toContain('Taking longer than usual')
  expect(status().textContent).toContain('Picking your questions')

  await act(async () => root.unmount())
  container.remove()
})
