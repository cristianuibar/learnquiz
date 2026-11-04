// @vitest-environment happy-dom
import { act } from 'react'
import { createRoot } from 'react-dom/client'
import { createMemoryHistory, createRootRoute, createRoute, createRouter, RouterProvider, Outlet, useParams } from '@tanstack/react-router'
import { PortalProvider } from '@/components/portal/portal-context'
import { afterEach, expect, it, vi } from 'vitest'
import { Route as questionsRoute } from '@/routes/org.$slug.questions'
import { reviewQuestion } from '@/server/question-review'

vi.mock('@/server/question-review', () => ({ getQuestionReview: vi.fn(), reviewQuestion: vi.fn() }))
vi.mock('@tanstack/react-start', () => ({ useServerFn: (fn: unknown) => fn }))

const roots: { unmount: () => void; container: HTMLElement }[] = []

afterEach(async () => {
  for (const { unmount, container } of roots.splice(0)) {
    await act(async () => unmount())
    container.remove()
  }
  vi.clearAllMocks()
})

const opt = (id: string, is_correct: boolean) => ({ id, text: `Text ${id}`, feedback: `Why ${id}`, is_correct })
const payload = (format: string, correct: boolean[]) => ({
  format, stem: 'Stem', explanation: 'Because', model_answer: '', difficulty: 2, source_quote: 'Quote', grounded: true, accepted_answers: [],
  options: correct.map((c, i) => opt('abcde'[i]!, c)),
})

// The portal layout provides the link context; screens are rendered under it here.
function PortalRoot() {
  const { slug } = useParams({ strict: false })
  return <PortalProvider slug={slug ?? ''} base="org" readOnly={false}><Outlet /></PortalProvider>
}

async function mount(p: unknown) {
  Object.assign(globalThis, { IS_REACT_ACT_ENVIRONMENT: true })
  const review = { name: 'Acme', topics: [], topic: { id: 't', title: 'Topic' }, concepts: [{ id: 'c', name: 'Concept', sourceQuote: null, questions: [{ id: 'q1', status: 'active', reviewedAt: null, flags: [], payload: p }] }] }
  const rootRoute = createRootRoute({ component: PortalRoot })
  const route = createRoute({ getParentRoute: () => rootRoute, path: '/org/$slug/questions', component: questionsRoute.options.component, loader: () => review })
  const router = createRouter({ routeTree: rootRoute.addChildren([route]), history: createMemoryHistory({ initialEntries: ['/org/x/questions'] }) })
  const container = document.createElement('div')
  document.body.appendChild(container)
  const root = createRoot(container)
  roots.push({ unmount: () => root.unmount(), container })
  await act(async () => { await router.load(); root.render(<RouterProvider router={router} />) })
  await act(async () => button(container, 'Edit').click())
  return container
}

const button = (c: HTMLElement, name: string) => [...c.querySelectorAll('button')].find((b) => (b.getAttribute('aria-label') ?? b.textContent) === name)!
const submit = (c: HTMLElement) => act(async () => { c.querySelector('form')!.requestSubmit() })
const sent = () => vi.mocked(reviewQuestion).mock.calls[0]![0].data.payload as ReturnType<typeof payload>

it('saves every multi checkbox as is_correct and sends no accepted answers', async () => {
  const c = await mount(payload('multi', [true, true, false, false]))
  expect(c.textContent).not.toContain('Accepted answers')
  expect(c.querySelectorAll('input[type=radio]')).toHaveLength(0)
  await act(async () => c.querySelector<HTMLInputElement>('input[name="correct-2"]')!.click())
  await submit(c)
  expect(sent().options.map((o) => o.is_correct)).toEqual([true, true, true, false])
  expect(sent().accepted_answers).toEqual([])
})

it('rejects a multi set with fewer than 2 correct answers', async () => {
  const c = await mount(payload('multi', [true, true, false, false]))
  await act(async () => c.querySelector<HTMLInputElement>('input[name="correct-1"]')!.click())
  await submit(c)
  expect(c.querySelector('[role=alert]')!.textContent).toBe('Mark at least 2 correct answers and leave at least 1 incorrect.')
  expect(reviewQuestion).not.toHaveBeenCalled()
})

it('saves reordered order steps with ids a, b, c and is_correct true', async () => {
  const c = await mount(payload('order', [true, true, true]))
  expect(c.textContent).not.toContain('Accepted answers')
  expect(c.textContent).not.toContain('Correct answer')
  expect(button(c, 'Move step 1 up').hasAttribute('disabled')).toBe(true)
  expect(button(c, 'Move step 3 down').hasAttribute('disabled')).toBe(true)
  await act(async () => button(c, 'Move step 1 down').click())
  await submit(c)
  expect(sent().options).toEqual([{ id: 'a', text: 'Text b', feedback: 'Why b', is_correct: true }, { id: 'b', text: 'Text a', feedback: 'Why a', is_correct: true }, { id: 'c', text: 'Text c', feedback: 'Why c', is_correct: true }])
  expect(sent().accepted_answers).toEqual([])
})
