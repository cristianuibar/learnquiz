import { createRouter as createTanStackRouter } from '@tanstack/react-router'
import { routeTree } from './routeTree.gen'

export function getRouter() {
  const router = createTanStackRouter({
    routeTree,
    scrollRestoration: true,
    defaultPreload: 'intent',
    defaultPreloadStaleTime: 0,
  })

  return router
}

declare module '@tanstack/react-router' {
  interface Register {
    router: ReturnType<typeof getRouter>
  }
  interface HistoryState {
    // Set when a session ends on a reported question, so the summary announces the report.
    reportSent?: boolean
    // Set by a Back link so the destination focuses the control that opened the screen (`data-focus` value) instead of its heading.
    focus?: string
  }
}
