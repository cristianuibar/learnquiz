// @vitest-environment happy-dom
import { act } from 'react'
import { createRoot } from 'react-dom/client'
import { createMemoryHistory, createRootRoute, createRoute, createRouter, RouterProvider, Outlet, useParams } from '@tanstack/react-router'
import { PortalProvider } from '@/components/portal/portal-context'
import { afterEach, expect, it, vi } from 'vitest'
import { Route as questionsRoute } from '@/routes/org.$slug.questions'
import { getQuestionReview, reviewQuestion } from '@/server/question-review'

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

type Q = { id: string; status: string; reviewedAt: number | null; payload: unknown; flags?: unknown[] }
const question = (q: Q) => ({
  difficulty: 2, sourceId: 'doc1', reviewerName: null, createdAt: Date.UTC(2026, 10, 2, 12), check: null, source: null, flags: [], ...q,
})
const concept = (id: string, questions: Q[]) => ({
  id, name: `Concept ${id}`, critical: false,
  counts: { total: questions.length, unreviewed: questions.filter((q) => q.reviewedAt === null).length, flagged: 0, rejected: 0 },
  questions: questions.map(question),
})
const review = (concepts: ReturnType<typeof concept>[], unreviewed: number) => ({
  name: 'Acme', roles: [{ id: 'r', name: 'Role' }], role: { id: 'r', name: 'Role' }, unreviewed,
  sources: [{ id: 'doc1', title: 'Algebra', version: 1 }, { id: 'doc2', title: 'Geometry', version: 2 }],
  units: [{ id: 'u', name: 'Unit', concepts }],
}) as never
const stemOf = (id: string) => ({ ...payload('mcq', [true, false]), stem: `Stem ${id}` })

async function mountAt(first: unknown, url = '/org/x/questions', ...later: unknown[]) {
  Object.assign(globalThis, { IS_REACT_ACT_ENVIRONMENT: true })
  vi.mocked(getQuestionReview).mockResolvedValueOnce(first as never)
  for (const l of later) vi.mocked(getQuestionReview).mockResolvedValueOnce(l as never)
  const rootRoute = createRootRoute({ component: PortalRoot })
  const o = questionsRoute.options
  const route = createRoute({ getParentRoute: () => rootRoute as never, path: '/org/$slug/questions', validateSearch: o.validateSearch, loaderDeps: o.loaderDeps, loader: o.loader, component: o.component })
  const people = createRoute({ getParentRoute: () => rootRoute, path: '/org/$slug/people/$id', component: () => null })
  const router = createRouter({ routeTree: rootRoute.addChildren([route, people]), history: createMemoryHistory({ initialEntries: [url] }) })
  const container = document.createElement('div')
  document.body.appendChild(container)
  const root = createRoot(container)
  roots.push({ unmount: () => root.unmount(), container })
  await act(async () => { await router.load(); root.render(<RouterProvider router={router} />) })
  return container
}

async function mount(p: unknown) {
  const c = await mountAt(review([concept('c', [{ id: 'q1', status: 'active', reviewedAt: null, payload: p }])], 1))
  await act(async () => button(c, 'Edit').click())
  return c
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

it('approves, moves focus to the next unreviewed question and announces the count', async () => {
  const q1 = { id: 'q1', status: 'active', payload: stemOf('1') }
  const q2 = { id: 'q2', status: 'active', reviewedAt: null, payload: stemOf('2') }
  const c = await mountAt(
    review([concept('a', [{ ...q1, reviewedAt: null }]), concept('b', [q2])], 2), '/org/x/questions',
    review([concept('a', [{ ...q1, reviewedAt: Date.UTC(2026, 9, 30) }]), concept('b', [q2])], 1),
  )
  await act(async () => button(c, 'Approve and next').click())
  expect(vi.mocked(reviewQuestion).mock.calls[0]![0].data).toMatchObject({ itemId: 'q1', action: 'approve' })
  await vi.waitFor(() => expect(document.activeElement?.textContent).toBe('Stem 2'))
  expect(document.activeElement?.tagName).toBe('H4')
  expect([...c.querySelectorAll('[role=status]')].map((s) => s.textContent)).toContain('Approved. 1 unreviewed.')
})

it('approving moves to the next open question in the same concept even after the list re-sorts', async () => {
  const a1 = { id: 'a1', status: 'active', payload: stemOf('A1') }
  const a2 = { id: 'a2', status: 'active', reviewedAt: null, payload: stemOf('A2') }
  const b1 = { id: 'b1', status: 'active', reviewedAt: null, payload: stemOf('B1') }
  const c = await mountAt(
    review([concept('a', [{ ...a1, reviewedAt: null }, a2]), concept('b', [b1])], 3), '/org/x/questions',
    // The server lists open questions first, so the approved one moves below A2.
    review([concept('a', [a2, { ...a1, reviewedAt: Date.UTC(2026, 9, 30) }]), concept('b', [b1])], 2),
  )
  await act(async () => button(c, 'Approve and next').click())
  await vi.waitFor(() => expect(document.activeElement?.textContent).toBe('Stem A2'))
  expect(document.activeElement!.closest('li')!.querySelector('button[aria-label="Hide details"]')!.getAttribute('aria-expanded')).toBe('true')
  expect([...c.querySelectorAll('[role=status]')].map((s) => s.textContent)).toContain('Approved. 2 unreviewed.')
})

it('expands and focuses the question named by ?item=', async () => {
  const qs = Array.from({ length: 6 }, (_, i) => ({ id: `r${i}`, status: 'active', reviewedAt: Date.UTC(2026, 9, 30), payload: stemOf(String(i)) }))
  const c = await mountAt(review([concept('c', qs)], 0), '/org/x/questions?item=r5')
  const h4 = [...c.querySelectorAll('h4')].find((h) => h.textContent === 'Stem 5')!
  expect(h4.closest('li')!.querySelector('button[aria-label="Hide details"]')!.getAttribute('aria-expanded')).toBe('true')
  expect(document.activeElement).toBe(h4)
  expect(c.querySelectorAll('button[aria-expanded=true]')).toHaveLength(1)
})

it('retires a question in place', async () => {
  const q = { id: 'q1', status: 'active', reviewedAt: null, payload: stemOf('1') }
  const c = await mountAt(review([concept('c', [q])], 1), '/org/x/questions', review([concept('c', [{ ...q, status: 'retired' }])], 0))
  await act(async () => button(c, 'Retire').click())
  expect(vi.mocked(reviewQuestion).mock.calls[0]![0].data).toMatchObject({ itemId: 'q1', action: 'retire' })
  await vi.waitFor(() => expect(c.textContent).toContain('Retired'))
  expect(button(c, 'Retire')).toBeUndefined()
})

it('shows who reported a flagged question and resolves the flag on approval', async () => {
  const flag = { id: 'f1', reporterId: 'u9', reporterName: 'Jordan Reyes', createdAt: Date.UTC(2026, 10, 2, 10, 14), reason: 'wrong', label: 'Wrong answer', note: 'Looks off', attempt: null }
  const c = await mountAt(review([concept('c', [{ id: 'q1', status: 'reported', reviewedAt: null, flags: [flag], payload: stemOf('1') }])], 0))
  expect(c.textContent).toContain('Reported by Jordan Reyes · ')
  expect(c.querySelector('a[href="/org/x/people/u9"]')!.textContent).toBe('Jordan Reyes')
  expect(button(c, 'Approve, resolve flag and next')).toBeDefined()
})

const labelled = (c: HTMLElement, name: string) => c.querySelector<HTMLInputElement>(`[aria-label="${name}"]`)!
const typeIn = (el: HTMLInputElement, v: string) => act(async () => {
  Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value')!.set!.call(el, v)
  el.dispatchEvent(new Event('input', { bubbles: true }))
})
const sentData = () => vi.mocked(reviewQuestion).mock.calls[0]![0].data as { payload: ReturnType<typeof payload>; sourceId?: string }

it('edits a multiple choice question: focuses the heading, saves correct option, difficulty and source, then refocuses Edit', async () => {
  const q = { id: 'q1', status: 'active', reviewedAt: null, payload: payload('mcq', [true, false, false, false]) }
  const c = await mountAt(review([concept('c', [q])], 1), '/org/x/questions', review([concept('c', [q])], 1))
  await act(async () => button(c, 'Edit').click())
  expect(document.activeElement).toBe([...c.querySelectorAll('h4')].find((h) => h.textContent === 'Edit question'))
  await act(async () => [...c.querySelectorAll('label')].find((l) => l.textContent === 'Correct answer: option 3')!.querySelector('input')!.click())
  await act(async () => button(c, '4').click())
  await submit(c)
  await vi.waitFor(() => expect(document.activeElement).toBe(button(c, 'Edit')))
  expect(sentData().payload.options.map((o) => o.is_correct)).toEqual([false, false, true, false])
  expect(sentData().payload.difficulty).toBe(4)
  expect(sentData().sourceId).toBe('doc1')
})

it('edits short answer chips and saves accepted answers with no options', async () => {
  const c = await mount({ ...payload('short', []), accepted_answers: ['Cat', 'Dog'] })
  const input = labelled(c, 'New accepted answer')
  await typeIn(input, 'Bird')
  await act(async () => { input.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter', bubbles: true, cancelable: true })) })
  await typeIn(input, 'Cat')
  await act(async () => button(c, 'Add answer').click())
  await typeIn(input, '  ')
  await act(async () => button(c, 'Add answer').click())
  await typeIn(input, 'Fish')
  await act(async () => button(c, 'Add answer').click())
  await act(async () => button(c, 'Remove Dog').click())
  await submit(c)
  expect(sent().accepted_answers).toEqual(['Cat', 'Bird', 'Fish'])
  expect(sent().options).toEqual([])
})

it('shows a quote miss on the Source quote field and focuses it', async () => {
  const c = await mount(payload('mcq', [true, false]))
  vi.mocked(reviewQuestion).mockRejectedValueOnce(new Error("This quote isn't in Algebra v1. Copy it exactly from the document."))
  await submit(c)
  const area = c.querySelector<HTMLTextAreaElement>('textarea[id^="quote-"]')!
  await vi.waitFor(() => expect(c.querySelector('[role=alert]')!.textContent).toContain("This quote isn't in Algebra v1."))
  expect(area.getAttribute('aria-invalid')).toBe('true')
  expect(c.querySelector('[role=alert]')!.id).toBe(area.getAttribute('aria-describedby'))
  expect(document.activeElement).toBe(area)
})
