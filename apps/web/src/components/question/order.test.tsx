// @vitest-environment happy-dom
import { act } from 'react'
import { createRoot } from 'react-dom/client'
import { createMemoryHistory, createRootRoute, createRoute, createRouter, Outlet, RouterProvider } from '@tanstack/react-router'
import { afterEach, beforeEach, expect, it, vi } from 'vitest'
import { Route as playRoute } from '@/routes/play.$sessionId'
import { Route as appRootRoute } from '@/routes/__root'
import { answerItem, getSession } from '@/server/play'
import type { Reveal, SessionView } from '@learnquiz/api'

vi.mock('@tanstack/react-start', () => ({ useServerFn: (fn: unknown) => fn }))
vi.mock('@/server/play', () => ({ prepareNextSession: vi.fn(async () => ({ ok: true })), answerItem: vi.fn(), getSession: vi.fn(), transcribeAnswer: vi.fn(), nextItem: vi.fn(), endSession: vi.fn(), reportItem: vi.fn() }))
vi.mock('@/server/model-trace', () => ({ getModelTrace: vi.fn() }))
vi.mock('@/server/diagrams', () => ({ generateConceptDiagram: vi.fn() }))
vi.mock('@/lib/auth-client', () => ({ authClient: {} }))
vi.mock('@/server/org-settings', () => ({ getCompanyBranding: async () => null }))
vi.mock('@/server/latest-topic', () => ({ getLatestTopicIdFn: async () => 't1' }))
vi.mock('@/server/session-fn', () => ({ getSessionFn: async () => ({ user: { id: 'u1', name: 'Learner', isAnonymous: false }, facebookEnabled: false, needsDisclosure: false, adminCompanies: [] }) }))


beforeEach(() => {
  vi.spyOn(window, 'matchMedia').mockImplementation((query) => ({
    matches: query.includes('prefers-reduced-motion'), media: query, onchange: null,
    addListener() {}, removeListener() {}, addEventListener() {}, removeEventListener() {}, dispatchEvent: () => true,
  }))
})
afterEach(() => { vi.restoreAllMocks(); sessionStorage.clear() })

const options = [
  { id: 'c', text: 'Scan the return label' }, { id: 'a', text: 'Inspect the item' },
  { id: 'd', text: 'Restock it' }, { id: 'b', text: 'Close the return' },
]

async function renderOrder() {
  Object.assign(globalThis, { IS_REACT_ACT_ENVIRONMENT: true })
  const initial: SessionView = {
    id: 's1', kind: 'session', topicId: 't1', topicTitle: 'Returns', progress: { position: 1, total: 1 }, ended: false, voiceEnabled: false,
    item: { id: 'i1', conceptId: 'c1', conceptName: 'Returns', format: 'order', difficulty: 1, generatedBy: 'gpt-test', image: null, stem: 'Put the return steps in order.', options, blank: null },
  }
  vi.mocked(getSession).mockResolvedValue(initial)
  vi.mocked(answerItem).mockReset().mockResolvedValue({ correct: true, correctAnswer: '', state: 'A', mixUps: [], explanation: 'ok', xp: 10, critical: false, correctOptionIds: null, sourceVersion: null, detail: null } as unknown as Reveal)
  const rootRoute = createRootRoute({ beforeLoad: appRootRoute.options.beforeLoad, loader: appRootRoute.options.loader, component: Outlet })
  const play = createRoute({ getParentRoute: () => rootRoute, path: '/play/$sessionId', loader: playRoute.options.loader, gcTime: playRoute.options.gcTime, component: playRoute.options.component })
  const router = createRouter({ routeTree: rootRoute.addChildren([play]), history: createMemoryHistory({ initialEntries: ['/play/s1'] }) })
  const container = document.createElement('div')
  document.body.appendChild(container)
  const root = createRoot(container)
  await act(async () => { await router.load(); root.render(<RouterProvider router={router} />) })
  return { container, async cleanup() {
    await act(async () => root.unmount())
    container.remove()
    delete (globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT
  } }
}

const step = (c: HTMLElement, text: string) => [...c.querySelectorAll('li button')].find((b) => b.getAttribute('aria-label')?.startsWith(`${text},`))! as HTMLButtonElement
const named = (c: HTMLElement, label: string) => [...c.querySelectorAll('button')].find((b) => b.textContent?.trim() === label)
const tap = async (c: HTMLElement, text: string) => act(async () => { step(c, text).click() })

it('enables Check only once every step is placed and submits the tap order', async () => {
  const { container, cleanup } = await renderOrder()
  try {
    await act(async () => { container.querySelector<HTMLInputElement>('input[value="sure"]')!.click() })
    for (const text of ['Inspect the item', 'Scan the return label', 'Close the return']) await tap(container, text)
    expect(named(container, 'Check')!.disabled).toBe(true)
    await tap(container, 'Restock it')
    expect(named(container, 'Check')!.disabled).toBe(false)
    await act(async () => { named(container, 'Check')!.click() })
    expect(answerItem).toHaveBeenCalledWith({ data: expect.objectContaining({ itemId: 'i1', answer: { order: ['a', 'c', 'b', 'd'] }, confidence: 'sure' }) })
  } finally { await cleanup() }
})

it('renumbers when a step is removed, announces placements and Clear resets with focus on the first step', async () => {
  const { container, cleanup } = await renderOrder()
  try {
    await tap(container, 'Inspect the item')
    await tap(container, 'Scan the return label')
    expect(container.querySelector('[role="status"]')!.textContent).toBe('Scan the return label, 2 of 4')
    await tap(container, 'Restock it')
    await tap(container, 'Inspect the item')
    expect(step(container, 'Inspect the item').getAttribute('aria-label')).toBe('Inspect the item, not placed yet')
    expect(step(container, 'Scan the return label').getAttribute('aria-label')).toBe('Scan the return label, position 1')
    expect(step(container, 'Restock it').getAttribute('aria-label')).toBe('Restock it, position 2')
    await act(async () => { named(container, 'Clear')!.click() })
    for (const o of options) expect(step(container, o.text).getAttribute('aria-label')).toBe(`${o.text}, not placed yet`)
    expect(named(container, 'Clear')).toBeUndefined()
    expect(document.activeElement).toBe(container.querySelector('li button'))
  } finally { await cleanup() }
})
