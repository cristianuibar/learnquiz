// @vitest-environment happy-dom
import { act } from 'react'
import { createRoot } from 'react-dom/client'
import { createMemoryHistory, createRootRoute, createRoute, createRouter, RouterProvider } from '@tanstack/react-router'
import { unitAriaLabel, type TopicPath } from '@learnquiz/api/progress'
import { afterEach, beforeEach, expect, it, vi } from 'vitest'
import { Route as pathRoute } from '@/routes/t.$topicId.path'
import { Route as appRootRoute } from '@/routes/__root'
import { getTopicPath } from '@/server/curriculum'

vi.mock('@tanstack/react-start', () => ({ useServerFn: (fn: unknown) => fn }))
vi.mock('@/server/curriculum', () => ({ getTopicPath: vi.fn(), getConceptItems: vi.fn() }))
vi.mock('@/server/model-trace', () => ({ getModelTrace: vi.fn() }))
vi.mock('@/server/play', () => ({ prepareNextSession: vi.fn(async () => ({ ok: true })), endSession: vi.fn(), startSession: vi.fn(), startPlacement: vi.fn() }))
vi.mock('@/server/push', () => ({ getPushSettings: async () => ({ canPrompt: false, endpoints: [] }), subscribe: vi.fn(), unsubscribe: vi.fn(), sendTestPush: vi.fn(), savePushPreferences: vi.fn() }))
vi.mock('@/server/diagrams', () => ({ generateConceptDiagram: vi.fn() }))
vi.mock('@/lib/auth-client', () => ({ authClient: {} }))
vi.mock('@/server/org-settings', () => ({ getCompanyBranding: async () => null }))
vi.mock('@/server/latest-topic', () => ({ getLatestTopicIdFn: async () => 't1' }))
vi.mock('@/server/session-fn', () => ({ getSessionFn: async () => ({ user: { id: 'u1', name: 'Learner', isAnonymous: false }, facebookEnabled: false, needsDisclosure: false, adminCompanies: [] }) }))

type Unit = TopicPath['units'][number]
const unit = (id: string, order: number, state: Unit['state'], mastery: number, criticalCount = 0): Unit => ({
  id, order, name: `Unit ${id}`, summary: '', mastery, measured: state !== 'estimate', unlocked: state !== 'locked', state, criticalCount, canPractice: true, source: null, concepts: [],
})
const units = [unit('u1', 0, 'mastered', 0.92), unit('u2', 1, 'learning', 0.68, 3), unit('u3', 2, 'estimate', 0.4), unit('u4', 3, 'locked', 0)]
const topic = (over: Partial<TopicPath> = {}): TopicPath => ({
  topic: { id: 't1', title: 'Algebra', goal: null, status: 'ready', generatedBy: null },
  preparing: false, placeable: true, company: null, benchmark: 0.85, onboarding: { day: 16, days: 30 }, mastery: 0.66, nextUnitId: 'u2',
  learner: { level: 2, levelLine: null, levelLineModel: null, placed: true, xp: 0, streak: 0 }, units, edges: [], ...over,
})

beforeEach(() => { Object.assign(globalThis, { IS_REACT_ACT_ENVIRONMENT: true }) })
afterEach(() => { delete (globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT })

async function renderPath(data: TopicPath, entry = '/t/t1/path') {
  vi.mocked(getTopicPath).mockResolvedValue(data)
  const rootRoute = createRootRoute({ beforeLoad: appRootRoute.options.beforeLoad, loader: appRootRoute.options.loader, component: appRootRoute.options.component })
  const path = createRoute({ getParentRoute: () => rootRoute, path: '/t/$topicId/path', loader: pathRoute.options.loader, component: pathRoute.options.component })
  const router = createRouter({ routeTree: rootRoute.addChildren([path]), history: createMemoryHistory({ initialEntries: [entry] }), defaultPendingMinMs: 0 })
  const container = document.createElement('div')
  document.body.appendChild(container)
  const root = createRoot(container)
  await act(async () => { await router.load(); root.render(<RouterProvider router={router} />) })
  await act(async () => { await new Promise((resolve) => setTimeout(resolve, 10)) })
  return { container, cleanup: async () => { await act(async () => root.unmount()); container.remove() } }
}

it('lists the units in order with state labels, the Next marker and the benchmark subline', async () => {
  const { container, cleanup } = await renderPath(topic())
  try {
    expect(container.querySelector('h1')?.textContent).toBe('Algebra')
    expect(container.querySelector('header')?.textContent).toContain('66% of 85% benchmark · Day 16 of 30')
    // The Path brings its own header, so the root top bar is not rendered.
    expect(container.querySelectorAll('header')).toHaveLength(1)
    const rows = [...container.querySelectorAll<HTMLElement>('[id^="unit-"]')]
    expect(rows.map((row) => row.id)).toEqual(['unit-u1', 'unit-u2', 'unit-u3', 'unit-u4'])
    expect(rows.map((row) => row.getAttribute('aria-label'))).toEqual(units.map((u, i) => unitAriaLabel(u, i, u.id === 'u2')))
    expect(rows[1].getAttribute('aria-label')).toBe('Unit 2, Unit u2, Next up: 68%, Still learning, 3 critical concepts')
    expect(rows[2].getAttribute('aria-label')).toContain('about 40%')
    expect(rows.filter((row) => row.getAttribute('aria-label')!.includes('Next up'))).toEqual([rows[1]])
    expect(rows.filter((row) => row.textContent!.includes('Next'))).toEqual([rows[1]])
  } finally {
    await cleanup()
  }
})

it('shows only the preparing status while the training is being prepared', async () => {
  const { container, cleanup } = await renderPath(topic({ preparing: true, company: 'Acme', nextUnitId: null }))
  try {
    expect(container.querySelector('[role="status"]')?.textContent).toBe('Your training at Acme is being prepared')
    expect(container.querySelectorAll('[id^="unit-"]')).toHaveLength(0)
  } finally {
    await cleanup()
  }
})

it('focuses the unit named by the URL hash', async () => {
  const { container, cleanup } = await renderPath(topic(), '/t/t1/path#unit-u3')
  try {
    expect(document.activeElement).toBe(container.querySelector('#unit-u3'))
  } finally {
    await cleanup()
  }
})
