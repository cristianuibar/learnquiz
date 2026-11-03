// @vitest-environment happy-dom
import { act } from 'react'
import { createRoot } from 'react-dom/client'
import { createMemoryHistory, createRootRoute, createRoute, createRouter, Outlet, RouterProvider } from '@tanstack/react-router'
import { expect, it, vi } from 'vitest'
import { Route as pathRoute } from '@/routes/t.$topicId.path'
import { Route as doneRoute } from '@/routes/play.$sessionId_.done'
import { Route as appRootRoute } from '@/routes/__root'
import { getTopicPath } from '@/server/curriculum'
import { endSession } from '@/server/play'
import { getModelTrace } from '@/server/model-trace'

vi.mock('@tanstack/react-start', () => ({ useServerFn: (fn: unknown) => fn }))
vi.mock('@/server/curriculum', () => ({ getTopicPath: vi.fn(), getConceptItems: vi.fn() }))
vi.mock('@/server/play', () => ({ prepareNextSession: vi.fn(async () => ({ ok: true })), endSession: vi.fn(), startSession: vi.fn(), startPlacement: vi.fn() }))
vi.mock('@/server/model-trace', () => ({ getModelTrace: vi.fn() }))
vi.mock('@/server/push', () => ({ getPushSettings: async () => ({ canPrompt: false, endpoints: [] }), subscribe: vi.fn(), unsubscribe: vi.fn(), sendTestPush: vi.fn(), savePushPreferences: vi.fn() }))
vi.mock('@/server/diagrams', () => ({ generateConceptDiagram: vi.fn() }))
vi.mock('@/lib/auth-client', () => ({ authClient: {} }))
vi.mock('@/server/org-settings', () => ({ getCompanyBranding: async () => null }))
vi.mock('@/server/latest-topic', () => ({ getLatestTopicIdFn: async () => 't1' }))
vi.mock('@/server/session-fn', () => ({ getSessionFn: async () => ({ user: { id: 'u1', name: 'Learner', isAnonymous: false }, facebookEnabled: false, needsDisclosure: false, adminCompanies: [] }) }))

it.each(['topic', 'session'] as const)('opens the %s trace from its page and retries a failed load', async (scope) => {
  Object.assign(globalThis, { IS_REACT_ACT_ENVIRONMENT: true })
  vi.mocked(getTopicPath).mockResolvedValue({
    topic: { id: 't1', title: 'Algebra', goal: null, status: 'ready', generatedBy: 'muse-spark-1.3' },
    preparing: false,
    placeable: true,
    company: null,
    learner: { level: 3, levelLine: null, levelLineModel: null, placed: false, xp: 0, streak: 0 }, units: [], edges: [],
  })
  vi.mocked(endSession).mockResolvedValue({
    sessionId: 's1', kind: 'session', topicId: 't1', durationMs: 60000, correct: 1, total: 1, ungraded: 0, xp: 10, streak: 1,
    level: 3, levelLine: null, levelLineModel: null, masteryMoved: [], mistakes: [], benchmark: null, reviewsLeft: 0, nextLine: 'Practise equations.', endedEarly: false,
  })
  vi.mocked(getModelTrace).mockReset().mockRejectedValueOnce(new Error('Trace unavailable')).mockResolvedValue({
    calls: [
      { id: 'call', purpose: 'items', model: 'muse-spark-1.3', latencyMs: 123, promptTokens: 100, completionTokens: 20, reasoningTokens: 5, costUsd: 0.00021, ok: true, createdAt: 1 },
      { id: 'unpriced', purpose: 'self_check', model: 'muse-wonder-1.0', latencyMs: 123, promptTokens: 100, completionTokens: 20, reasoningTokens: 5, costUsd: null, ok: true, createdAt: 2 },
    ], totalCostUsd: 0.00021,
  })
  const rootRoute = createRootRoute({ beforeLoad: appRootRoute.options.beforeLoad, loader: appRootRoute.options.loader, component: Outlet })
  const path = createRoute({ getParentRoute: () => rootRoute, path: '/t/$topicId/path', loader: pathRoute.options.loader, component: pathRoute.options.component })
  const done = createRoute({ getParentRoute: () => rootRoute, path: '/play/$sessionId/done', loader: doneRoute.options.loader, component: doneRoute.options.component })
  const router = createRouter({ routeTree: rootRoute.addChildren([path, done]), history: createMemoryHistory({ initialEntries: [scope === 'topic' ? '/t/t1/path' : '/play/s1/done'] }) })
  const container = document.createElement('div')
  document.body.appendChild(container)
  const root = createRoot(container)
  try {
    await act(async () => { await router.load(); root.render(<RouterProvider router={router} />) })
    expect(container.querySelector('h1')?.textContent).toContain(scope === 'topic' ? 'Algebra' : 'Session done')
    const trigger = [...container.querySelectorAll('button')].find((b) => b.textContent === 'Model trace')!
    expect(getModelTrace).not.toHaveBeenCalled()
    await act(async () => trigger.click())
    const dialog = document.querySelector('[role="dialog"]')!
    expect(dialog.querySelector('[role="alert"]')?.textContent).toContain('Trace unavailable')
    await act(async () => dialog.querySelector<HTMLButtonElement>('[role="alert"] button')!.click())
    expect(getModelTrace).toHaveBeenLastCalledWith({ data: scope === 'topic' ? { scope, topicId: 't1' } : { scope, sessionId: 's1' } })
    expect(dialog.textContent).toContain('muse-spark-1.3')
    expect(dialog.textContent).toContain('Unknown')
    expect(dialog.textContent).toContain(`${scope === 'topic' ? 'Generation' : 'Session'} total: $0.00021`)
    await act(async () => dialog.querySelector<HTMLButtonElement>('[data-slot="dialog-close"]')!.click())
    expect(document.querySelector('[role="dialog"]')).toBeNull()
  } finally {
    await act(async () => root.unmount())
    container.remove()
    delete (globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT
  }
})
