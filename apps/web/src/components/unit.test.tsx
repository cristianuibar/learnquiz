// @vitest-environment happy-dom
import { act } from 'react'
import { createRoot } from 'react-dom/client'
import { createMemoryHistory, createRootRoute, createRoute, createRouter, RouterProvider } from '@tanstack/react-router'
import type { TopicPath } from '@learnquiz/api/progress'
import { afterEach, beforeEach, expect, it, vi } from 'vitest'
import { Route as pathRoute } from '@/routes/t.$topicId.path'
import { Route as unitRoute } from '@/routes/t.$topicId.u.$unitId'
import { Route as appRootRoute } from '@/routes/__root'
import { getConceptItems, getTopicPath } from '@/server/curriculum'

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
const concept = (id: string, order: number, over: Partial<Unit['concepts'][number]> = {}): Unit['concepts'][number] => ({
  id, order, name: `Concept ${id}`, summary: '', visual: false, grounded: false, critical: false, answeredCount: 0, pKnown: 0.5, measured: true, status: 'learning', ...over,
})
const unit = (id: string, order: number, state: Unit['state'], mastery: number, over: Partial<Unit> = {}): Unit => ({
  id, order, name: `Unit ${id}`, summary: '', mastery, measured: state !== 'estimate', unlocked: state !== 'locked', state, criticalCount: 0, canPractice: true, source: null, concepts: [], ...over,
})
const units = [
  unit('u1', 0, 'mastered', 0.92),
  unit('u2', 1, 'learning', 0.68, {
    source: { title: 'Receiving SOP', version: 3 },
    concepts: [concept('c2', 1), concept('c1', 0, { pKnown: 0.72, critical: true, answeredCount: 2 })],
  }),
  unit('u3', 2, 'estimate', 0.4),
  unit('u4', 3, 'locked', 0),
]
const topic = (over: Partial<TopicPath> = {}): TopicPath => ({
  topic: { id: 't1', title: 'Algebra', goal: null, status: 'ready', generatedBy: null },
  preparing: false, placeable: true, company: null, benchmark: 0.85, onboarding: { day: 16, days: 30 }, mastery: 0.66, nextUnitId: 'u2',
  learner: { level: 2, levelLine: null, levelLineModel: null, placed: true, xp: 0, streak: 0 }, units, edges: [], ...over,
})

beforeEach(() => { Object.assign(globalThis, { IS_REACT_ACT_ENVIRONMENT: true }) })
afterEach(() => { delete (globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT })

async function render(data: TopicPath, entry: string) {
  vi.mocked(getTopicPath).mockResolvedValue(data)
  const rootRoute = createRootRoute({ beforeLoad: appRootRoute.options.beforeLoad, loader: appRootRoute.options.loader, component: appRootRoute.options.component })
  const path = createRoute({ getParentRoute: () => rootRoute, path: '/t/$topicId/path', loader: pathRoute.options.loader, component: pathRoute.options.component })
  const detail = createRoute({ getParentRoute: () => rootRoute, path: '/t/$topicId/u/$unitId', loader: unitRoute.options.loader, component: unitRoute.options.component })
  const loading = createRoute({ getParentRoute: () => rootRoute, path: '/play/loading', component: () => <h1>Loading</h1> })
  const router = createRouter({ routeTree: rootRoute.addChildren([path, detail, loading]), history: createMemoryHistory({ initialEntries: [entry] }), defaultPendingMinMs: 0 })
  const container = document.createElement('div')
  document.body.appendChild(container)
  const root = createRoot(container)
  await act(async () => { await router.load(); root.render(<RouterProvider router={router} />) })
  await settle()
  return { container, router, cleanup: async () => { await act(async () => root.unmount()); container.remove() } }
}
const settle = () => act(async () => { await new Promise((resolve) => setTimeout(resolve, 10)) })
const click = async (el: Element | null) => { await act(async () => (el as HTMLElement).click()); await settle() }
const button = (container: HTMLElement, text: string) => [...container.querySelectorAll('button')].find((b) => b.textContent === text) ?? null

it('links open rows on the Path to their unit page and leaves locked rows plain', async () => {
  const { container, router, cleanup } = await render(topic(), '/t/t1/path')
  try {
    const link = container.querySelector<HTMLAnchorElement>('a#unit-u1')
    expect(link?.getAttribute('href')).toBe('/t/t1/u/u1')
    expect(container.querySelector('#unit-u4')?.querySelector('a')).toBeNull()
    await click(link)
    expect(router.state.location.pathname).toBe('/t/t1/u/u1')
    expect(container.querySelector('h1')?.textContent).toBe('Unit u1')
  } finally {
    await cleanup()
  }
})

it('lists concepts in curriculum order with their status in the bar and starts practice for the unit', async () => {
  const { container, router, cleanup } = await render(topic(), '/t/t1/u/u2')
  try {
    expect(container.querySelector('h1')?.textContent).toBe('Unit u2')
    expect(container.textContent).toContain('68%')
    expect(container.textContent).toContain('Receiving SOP · v3')
    expect([...container.querySelectorAll('h3')].map((h) => h.textContent)).toEqual(['Concept c1', 'Concept c2'])
    expect(container.querySelector('[aria-label="Concept c1 mastery"]')?.getAttribute('aria-valuetext')).toBe('72%, Still learning, critical, benchmark 85%')
    expect(container.querySelector<HTMLAnchorElement>('a')?.getAttribute('href')).toBe('/t/t1/path#unit-u2')
    await click(button(container, 'Practice Unit u2 · 5 min'))
    expect(router.state.location.pathname).toBe('/play/loading')
    expect(router.state.location.search).toEqual({ topicId: 't1', start: 'session', unitId: 'u2' })
  } finally {
    await cleanup()
  }
})

it('disables Practice when the unit cannot be practiced', async () => {
  const data = topic({ units: [unit('u2', 0, 'learning', 0.5, { canPractice: false })] })
  const { container, cleanup } = await render(data, '/t/t1/u/u2')
  try {
    expect(button(container, 'Practice Unit u2 · 5 min')?.disabled).toBe(true)
  } finally {
    await cleanup()
  }
})

it('shows Not found with a way back for an unknown unit', async () => {
  const { container, cleanup } = await render(topic(), '/t/t1/u/nope')
  try {
    expect(container.querySelector('h1')?.textContent).toBe('Not found')
    expect(container.querySelector('a')?.textContent).toContain('Back to Path')
    expect(container.querySelector('a')?.getAttribute('href')).toBe('/t/t1/path#unit-nope')
    expect(container.textContent).not.toContain('Practice')
  } finally {
    await cleanup()
  }
})

it('loads a concept\'s answered questions on demand', async () => {
  vi.mocked(getConceptItems).mockResolvedValue({
    items: [{ id: 'i1', format: 'cloze', generatedBy: null, payload: { stem: 'What is 2 + 2?', accepted_answers: ['4'], explanation: 'Sum.' } }],
  } as never)
  const { container, cleanup } = await render(topic(), '/t/t1/u/u2')
  try {
    await click(button(container, 'Show answered questions'))
    expect(getConceptItems).toHaveBeenCalledWith({ data: { conceptId: 'c1' } })
    expect(container.textContent).toContain('What is 2 + 2?')
    expect(button(container, 'Hide answered questions')?.getAttribute('aria-expanded')).toBe('true')
  } finally {
    await cleanup()
  }
})
