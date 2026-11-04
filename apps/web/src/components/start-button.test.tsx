// @vitest-environment happy-dom
import { act } from 'react'
import { createRoot } from 'react-dom/client'
import { createMemoryHistory, createRoute, createRootRoute, createRouter, RouterProvider } from '@tanstack/react-router'
import { expect, it } from 'vitest'
import { StartButton } from '@/components/start-button'

it.each([
  { placement: false, start: 'session', unitId: undefined },
  { placement: false, start: 'session', unitId: 'u2' },
  { placement: true, start: 'placement', unitId: undefined },
] as const)('opens the Loading screen to start a $start', async ({ placement, start, unitId }) => {
  Object.assign(globalThis, { IS_REACT_ACT_ENVIRONMENT: true })
  const rootRoute = createRootRoute({ component: () => <StartButton topicId="t1" placement={placement} unitId={unitId}>Start</StartButton> })
  const loading = createRoute({ getParentRoute: () => rootRoute, path: '/play/loading', component: () => <h1>Loading</h1> })
  const router = createRouter({ routeTree: rootRoute.addChildren([loading]), history: createMemoryHistory({ initialEntries: ['/'] }) })
  const container = document.createElement('div')
  document.body.appendChild(container)
  const root = createRoot(container)
  await act(async () => { await router.load(); root.render(<RouterProvider router={router} />) })

  await act(async () => container.querySelector('button')!.click())
  await act(async () => { await router.load() })
  expect(router.state.location.pathname).toBe('/play/loading')
  expect(router.state.location.search).toEqual({ topicId: 't1', start, unitId })

  await act(async () => root.unmount())
  container.remove()
})
