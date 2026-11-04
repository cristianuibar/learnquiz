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
vi.mock('@/server/diagrams', () => ({ generateConceptDiagram: vi.fn() }))
vi.mock('@/server/model-trace', () => ({ getModelTrace: vi.fn() }))
vi.mock('@/lib/auth-client', () => ({ authClient: {} }))
vi.mock('@/server/org-settings', () => ({ getCompanyBranding: async () => null }))
vi.mock('@/server/latest-topic', () => ({ getLatestTopicIdFn: async () => 't1' }))
vi.mock('@/server/session-fn', () => ({ getSessionFn: async () => ({ user: { id: 'u1', name: 'Learner', isAnonymous: false }, facebookEnabled: false, needsDisclosure: false, companyMember: false, adminCompanies: [] }) }))

beforeEach(() => {
  vi.spyOn(window, 'matchMedia').mockImplementation((query) => ({
    matches: query.includes('prefers-reduced-motion'), media: query, onchange: null,
    addListener() {}, removeListener() {}, addEventListener() {}, removeEventListener() {}, dispatchEvent: () => true,
  }))
})
afterEach(() => { vi.restoreAllMocks(); sessionStorage.clear() })

async function renderPlay() {
  Object.assign(globalThis, { IS_REACT_ACT_ENVIRONMENT: true })
  const initial: SessionView = {
    id: 's1', kind: 'session', topicId: 't1', topicTitle: 'Receiving', progress: { position: 1, total: 1 }, ended: false, voiceEnabled: false,
    item: {
      id: 'i1', conceptId: 'c1', conceptName: 'Sign-off', format: 'multi', difficulty: 1, generatedBy: 'gpt-test', image: null,
      stem: 'Which cartons need sign-off?', blank: null,
      options: [{ id: 'a', text: 'Chilled' }, { id: 'b', text: 'Dry goods' }, { id: 'c', text: 'Packaging' }, { id: 'd', text: 'Frozen' }],
    },
  }
  vi.mocked(getSession).mockResolvedValue(initial)
  vi.mocked(answerItem).mockReset().mockResolvedValue({ correct: true, correctAnswer: 'a,d', state: 'A', mixUps: [], explanation: 'Cold chain.', xp: 10, critical: false, correctOptionIds: ['a', 'd'], sourceVersion: null, detail: null } as unknown as Reveal)
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
const option = (c: HTMLElement, text: string) => [...c.querySelectorAll<HTMLElement>('[role="checkbox"]')].find((b) => b.textContent === text)!
const check = (c: HTMLElement) => [...c.querySelectorAll('button')].find((b) => b.textContent?.trim() === 'Check')!

it('enables Check once something is selected and answers with the selected ids in option order', async () => {
  const { container, cleanup } = await renderPlay()
  try {
    await act(async () => { container.querySelector<HTMLInputElement>('input[value="sure"]')!.click() })
    expect(check(container).disabled).toBe(true)
    await act(async () => { option(container, 'Frozen').click() })
    await act(async () => { option(container, 'Chilled').click() })
    await act(async () => { option(container, 'Dry goods').click() })
    await act(async () => { option(container, 'Dry goods').click() })
    expect(option(container, 'Dry goods').getAttribute('aria-checked')).toBe('false')
    expect(check(container).disabled).toBe(false)
    await act(async () => { check(container).click() })
    expect(answerItem).toHaveBeenCalledWith({ data: expect.objectContaining({ itemId: 'i1', answer: { optionIds: ['a', 'd'] }, confidence: 'sure' }) })
  } finally { await cleanup() }
})

it('keeps the selection in the session draft and restores it on remount', async () => {
  const first = await renderPlay()
  await act(async () => { option(first.container, 'Frozen').click() })
  await act(async () => { option(first.container, 'Chilled').click() })
  expect(JSON.parse(sessionStorage.getItem('learnquiz:draft:s1:i1')!).choice).toBe('a,d')
  await first.cleanup()
  const again = await renderPlay()
  try {
    expect(option(again.container, 'Chilled').getAttribute('aria-checked')).toBe('true')
    expect(option(again.container, 'Frozen').getAttribute('aria-checked')).toBe('true')
    expect(option(again.container, 'Packaging').getAttribute('aria-checked')).toBe('false')
  } finally { await again.cleanup() }
})
