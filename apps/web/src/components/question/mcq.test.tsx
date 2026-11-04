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
vi.mock('@/server/session-fn', () => ({ getSessionFn: async () => ({ user: { id: 'u1', name: 'Learner', isAnonymous: false }, facebookEnabled: false, needsDisclosure: false, adminCompanies: [] }) }))

beforeEach(() => {
  vi.spyOn(window, 'matchMedia').mockImplementation((query) => ({
    matches: query.includes('prefers-reduced-motion'), media: query, onchange: null,
    addListener() {}, removeListener() {}, addEventListener() {}, removeEventListener() {}, dispatchEvent: () => true,
  }))
})
afterEach(() => { vi.restoreAllMocks(); sessionStorage.clear() })

async function renderPlay(image = { src: '/media/items/i1', alt: 'Pick-face location label A12-04-C-2', width: 328, height: 148 }) {
  Object.assign(globalThis, { IS_REACT_ACT_ENVIRONMENT: true })
  const initial: SessionView = {
    id: 's1', kind: 'session', topicId: 't1', topicTitle: 'Receiving', progress: { position: 1, total: 1 }, ended: false, voiceEnabled: false,
    item: {
      id: 'i1', conceptId: 'c1', conceptName: 'Sign-off', format: 'mcq', difficulty: 1, generatedBy: 'gpt-test', image,
      stem: 'Which cartons need sign-off?', blank: null,
      options: [{ id: 'a', text: 'Chilled' }, { id: 'b', text: 'Dry goods' }, { id: 'c', text: 'Packaging' }, { id: 'd', text: 'Frozen' }],
    },
  }
  vi.mocked(getSession).mockResolvedValue(initial)
  vi.mocked(answerItem).mockReset().mockResolvedValue({ correct: true, correctAnswer: 'a', state: 'A', mixUps: [], explanation: 'Cold chain.', xp: 10, critical: false, correctOptionIds: ['a'], sourceVersion: null, detail: null } as unknown as Reveal)
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
const option = (c: HTMLElement, text: string) => [...c.querySelectorAll<HTMLInputElement>('input[type="radio"]')].find((b) => b.closest('label')?.textContent === text)!
const check = (c: HTMLElement) => [...c.querySelectorAll('button')].find((b) => b.textContent?.trim() === 'Check')!

const img = (c: HTMLElement) => c.querySelector<HTMLImageElement>('img[alt="Pick-face location label A12-04-C-2"]')

it('shows the diagram above the options at its aspect ratio', async () => {
  const { container, cleanup } = await renderPlay()
  try {
    const el = img(container)!
    expect(el.getAttribute('src')).toBe('/media/items/i1')
    expect(el.style.aspectRatio).toBe('328 / 148')
    expect(el.compareDocumentPosition(container.querySelector('input[name="answer"]')!) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy()
  } finally { await cleanup() }
})

it('frames a tall diagram at its own aspect ratio within the 280px cap', async () => {
  const { container, cleanup } = await renderPlay({ src: '/media/items/i1', alt: 'Pick-face location label A12-04-C-2', width: 200, height: 400 })
  try {
    const el = img(container)!
    expect(el.style.aspectRatio).toBe('200 / 400')
    expect(el.style.maxWidth).toBe('min(100%, 140px)')
  } finally { await cleanup() }
})

it('keeps Check enabled when the diagram fails and restores it on retry', async () => {
  const { container, cleanup } = await renderPlay()
  try {
    await act(async () => { img(container)!.dispatchEvent(new Event('error')) })
    expect(container.querySelector('[role="alert"]')!.textContent).toBe('The diagram could not be loaded.')
    await act(async () => { container.querySelector<HTMLInputElement>('input[value="sure"]')!.click() })
    await act(async () => { option(container, 'Chilled').click() })
    expect(check(container).disabled).toBe(false)
    const retry = [...container.querySelectorAll('button')].find((b) => b.textContent?.trim() === 'Retry diagram')!
    await act(async () => { retry.click() })
    expect(container.querySelector('[role="alert"]')).toBeNull()
    expect(img(container)).not.toBeNull()
  } finally { await cleanup() }
})
