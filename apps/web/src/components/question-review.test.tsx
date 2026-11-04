// @vitest-environment happy-dom
import { act } from 'react'
import { createRoot } from 'react-dom/client'
import { createMemoryHistory, createRootRoute, createRoute, createRouter, RouterProvider, Outlet, useParams } from '@tanstack/react-router'
import { PortalProvider } from '@/components/portal/portal-context'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { Route as questionsRoute } from '@/routes/org.$slug.questions'
import { getQuestionReview } from '@/server/question-review'

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

// The portal layout provides the link context; screens are rendered under it here.
function PortalRoot() {
  const { slug } = useParams({ strict: false })
  return <PortalProvider slug={slug ?? ''} base="org" readOnly={false}><Outlet /></PortalProvider>
}


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
  return { c: container, router }
}

const flag = { id: 'f1', reporterId: 'u9', reporterName: 'Jordan Reyes', createdAt: Date.UTC(2026, 10, 2, 10, 14), reason: 'wrong', label: 'Wrong answer', note: 'Looks off', attempt: null }
const REVIEWED = Date.UTC(2026, 9, 30)
type Q = { id: string; stem: string; status: string; reviewedAt: number | null; flags?: unknown[] }
const concept = (id: string, name: string, critical: boolean, qs: Q[]) => ({
  id, name, critical,
  counts: { total: qs.length, unreviewed: 0, flagged: 0, rejected: 0 },
  questions: qs.map(({ stem, ...q }) => ({
    difficulty: 2, reviewerName: null, createdAt: Date.UTC(2026, 10, 2, 12), check: null, source: null, flags: [],
    payload: { format: 'mcq', stem, explanation: 'Because', model_answer: '', difficulty: 2, source_quote: 'Quote', grounded: true, accepted_answers: [], options: [{ id: 'a', text: 'A', feedback: 'a', is_correct: true }, { id: 'b', text: 'B', feedback: 'b', is_correct: false }] },
    ...q,
  })),
})
const STEMS = {
  q1: 'Alpha Photosynthesis stem', q2: 'Beta Respiration stem', q3: 'Gamma Flagged stem', q4: 'Delta Retired stem',
  q5: 'Epsilon Rejected stem', q6: 'Zeta Mitosis stem', q7: 'Eta Meiosis stem', q8: 'Theta Flagged elsewhere stem',
}
const fixture = () => ({
  name: 'Acme', roles: [{ id: 'r', name: 'Role' }], role: { id: 'r', name: 'Role' }, unreviewed: 2,
  units: [
    { id: 'u1', name: 'Basics', concepts: [
      concept('c1', 'Cells', true, [
        { id: 'q1', stem: STEMS.q1, status: 'active', reviewedAt: null },
        { id: 'q2', stem: STEMS.q2, status: 'active', reviewedAt: REVIEWED },
        { id: 'q3', stem: STEMS.q3, status: 'reported', reviewedAt: REVIEWED, flags: [flag] },
      ]),
      concept('c2', 'Energy', false, [
        { id: 'q4', stem: STEMS.q4, status: 'retired', reviewedAt: REVIEWED },
        { id: 'q5', stem: STEMS.q5, status: 'rejected', reviewedAt: REVIEWED },
      ]),
    ] },
    { id: 'u2', name: 'Advanced', concepts: [
      concept('c3', 'Division', false, [
        { id: 'q6', stem: STEMS.q6, status: 'active', reviewedAt: null },
        { id: 'q7', stem: STEMS.q7, status: 'active', reviewedAt: REVIEWED },
        { id: 'q8', stem: STEMS.q8, status: 'reported', reviewedAt: REVIEWED, flags: [flag] },
      ]),
    ] },
  ],
}) as never

const mountReview = (url: string) => mountAt(fixture(), url)
const stems = (c: HTMLElement) => [...c.querySelectorAll('h4')].map((h) => h.textContent)
const sorted = (...ids: (keyof typeof STEMS)[]) => ids.map((i) => STEMS[i]).sort()
const chip = (c: HTMLElement, name: string) => [...c.querySelectorAll<HTMLButtonElement>('[role=group][aria-label=Filters] button')].find((b) => b.textContent!.startsWith(name))!
const results = (c: HTMLElement) => [...c.querySelectorAll('[role=status]')].find((s) => /question/.test(s.textContent ?? '') && !s.classList.contains('sr-only'))!.textContent
const linkButton = (c: HTMLElement, name: string) => [...c.querySelectorAll('button')].find((b) => b.textContent === name)!
const search = (c: HTMLElement) => c.querySelector<HTMLInputElement>('input[placeholder="Search questions"]')!
const chipCounts = (c: HTMLElement) => ['Unreviewed', 'Flagged by learners', 'Critical'].map((n) => chip(c, n).textContent)

function setValue(el: HTMLInputElement | HTMLSelectElement, value: string, event: 'input' | 'change') {
  const proto = el instanceof HTMLSelectElement ? HTMLSelectElement.prototype : HTMLInputElement.prototype
  Object.getOwnPropertyDescriptor(proto, 'value')!.set!.call(el, value)
  el.dispatchEvent(new Event(event, { bubbles: true }))
}
const waitSearch = (router: { state: { location: { search: unknown } } }, expected: Record<string, unknown>) =>
  vi.waitFor(() => expect(router.state.location.search).toMatchObject(expected), { timeout: 2000 })

describe('question review filters', () => {
  it('combines filters with AND, survives a URL reload and keeps chip counts stable', async () => {
    const { c, router } = await mountReview('/org/x/questions?flagged=1&critical=1')
    expect(chip(c, 'Flagged by learners').getAttribute('aria-pressed')).toBe('true')
    expect(chip(c, 'Critical').getAttribute('aria-pressed')).toBe('true')
    expect(chip(c, 'Unreviewed').getAttribute('aria-pressed')).toBe('false')
    expect(stems(c)).toEqual([STEMS.q3])
    expect(results(c)).toBe('1 question')
    const counts = chipCounts(c)
    expect(counts.map((t) => t.replace(/\D+/g, ''))).toEqual(['2', '2', '3'])

    await act(async () => chip(c, 'Unreviewed').click())
    await waitSearch(router, { unreviewed: true, flagged: true, critical: true })
    expect(c.textContent).toContain('No questions match these filters. Flagged questions have already been reviewed.')
    expect(stems(c)).toEqual([])
    expect(results(c)).toBe('0 questions')
    expect(chipCounts(c)).toEqual(counts)

    // The no-match card has its own Clear filters button.
    const card = [...c.querySelectorAll('button')].filter((b) => b.textContent === 'Clear filters')
    expect(card).toHaveLength(2)
    await act(async () => card[1]!.click())
    await vi.waitFor(() => expect(stems(c).sort()).toEqual(sorted('q1', 'q2', 'q3', 'q4', 'q5', 'q6', 'q7', 'q8')))
    expect(router.state.location.search).toEqual({})
  })

  it('Clear filters resets the URL and the search box and focuses it', async () => {
    const { c, router } = await mountReview('/org/x/questions?q=alpha&unreviewed=1&status=live')
    expect(search(c).value).toBe('alpha')
    expect(stems(c)).toEqual([STEMS.q1])
    await act(async () => linkButton(c, 'Clear filters').click())
    await vi.waitFor(() => expect(stems(c)).toHaveLength(8))
    const s = router.state.location.search as Record<string, unknown>
    for (const k of ['q', 'unreviewed', 'flagged', 'critical', 'status']) expect(s[k]).toBeUndefined()
    expect(document.activeElement).toBe(search(c))
    expect(search(c).value).toBe('')
    expect(c.textContent).not.toContain('Clear filters')
  })

  it.each([
    ['live', ['q1', 'q2', 'q3', 'q6', 'q7', 'q8']],
    ['retired', ['q4']],
    ['rejected', ['q5']],
  ] as const)('status %s shows only matching questions', async (status, ids) => {
    const { c, router } = await mountReview('/org/x/questions')
    await act(async () => setValue(c.querySelector('select#qs-status')!, status, 'change'))
    await waitSearch(router, { status })
    expect(stems(c).sort()).toEqual(sorted(...ids))
    expect(results(c)).toBe(ids.length === 1 ? '1 question' : `${ids.length} questions`)
  })

  it('search is case-insensitive, debounced and written to the URL', async () => {
    const { c, router } = await mountReview('/org/x/questions')
    await act(async () => setValue(search(c), 'mitosis', 'input'))
    await waitSearch(router, { q: 'mitosis' })
    await vi.waitFor(() => expect(stems(c)).toEqual([STEMS.q6]))
    expect(results(c)).toBe('1 question')
  })

  // The search debounce is 300ms; step fake timers past it to prove a pending search was dropped.
  const fakeTimers = () => vi.useFakeTimers({ toFake: ['setTimeout', 'clearTimeout'] })
  const advance = (ms: number) => act(() => vi.advanceTimersByTimeAsync(ms))
  const pastDebounce = () => advance(400)
  afterEach(() => vi.useRealTimers())

  it('the no-match card Clear filters drops a search still being typed', async () => {
    const { c, router } = await mountReview('/org/x/questions?unreviewed=1&flagged=1')
    fakeTimers()
    await act(async () => setValue(search(c), 'warehouse', 'input'))
    const card = [...c.querySelectorAll('button')].filter((b) => b.textContent === 'Clear filters')
    await act(async () => card[1]!.click())
    await pastDebounce()
    expect(router.state.location.search).toEqual({})
    expect(search(c).value).toBe('')
    expect(document.activeElement).toBe(search(c))
    expect(stems(c)).toHaveLength(8)
  })

  it('changing role drops a search still being typed', async () => {
    const two = () => ({ ...(fixture() as object), roles: [{ id: 'r', name: 'Role' }, { id: 'r2', name: 'Other' }] })
    const { c, router } = await mountAt(two(), '/org/x/questions', { ...two(), role: { id: 'r2', name: 'Other' } })
    fakeTimers()
    await act(async () => setValue(search(c), 'warehouse', 'input'))
    await act(async () => setValue(c.querySelector('select#qs-role')!, 'r2', 'change'))
    await pastDebounce()
    expect(router.state.location.search).toEqual({ role: 'r2' })
    expect(search(c).value).toBe('')
  })

  it('changing role drops a search still being typed while the new role loads', async () => {
    const two = () => ({ ...(fixture() as object), roles: [{ id: 'r', name: 'Role' }, { id: 'r2', name: 'Other' }] })
    const { c, router } = await mountAt(two())
    fakeTimers()
    vi.mocked(getQuestionReview).mockImplementationOnce(() => new Promise((r) => setTimeout(() => r({ ...two(), role: { id: 'r2', name: 'Other' } } as never), 500)))
    await act(async () => setValue(search(c), 'warehouse', 'input'))
    await act(async () => setValue(c.querySelector('select#qs-role')!, 'r2', 'change'))
    await advance(700)
    expect(router.state.location.search).toEqual({ role: 'r2' })
    expect(search(c).value).toBe('')
  })
})

describe('question review outline', () => {
  const entries = (c: HTMLElement) => [...c.querySelectorAll('nav[aria-label="Question outline"] a')].map((a) => [a.firstElementChild!.textContent, a.lastElementChild!.textContent])
  const units = (c: HTMLElement) => [...c.querySelectorAll('nav[aria-label="Question outline"] p')].map((p) => [p.firstChild!.textContent, p.lastElementChild!.textContent])

  it.each([
    ['', [['Basics', '5'], ['Advanced', '3']], [['Cells', '3'], ['Energy', '2'], ['Division', '3']]],
    ['?unreviewed=1', [['Basics', '1 unreviewed'], ['Advanced', '1 unreviewed']], [['Cells', '1 unreviewed'], ['Division', '1 unreviewed']]],
  ] as const)('lists units and concepts with counts (%s)', async (query, unitRows, conceptRows) => {
    const { c } = await mountReview(`/org/x/questions${query}`)
    expect(units(c)).toEqual(unitRows)
    expect(entries(c)).toEqual(conceptRows)
  })

  it('marks one concept current, focuses the heading on click and hides below xl', async () => {
    const { c } = await mountReview('/org/x/questions')
    const nav = c.querySelector('nav[aria-label="Question outline"]')!
    expect(nav.classList.contains('max-xl:hidden')).toBe(true)
    expect(nav.querySelectorAll('[aria-current=location]')).toHaveLength(1)
    const link = [...nav.querySelectorAll('a')].find((a) => a.textContent!.startsWith('Division'))!
    await act(async () => link.click())
    expect(document.activeElement).toBe([...c.querySelectorAll('h3')].find((h) => h.textContent === 'Division'))
    expect(nav.querySelectorAll('[aria-current=location]')).toHaveLength(1)
    expect(link.getAttribute('aria-current')).toBe('location')
  })

  afterEach(() => vi.restoreAllMocks())

  // 1440x800 desktop. `tops` places the Cells, Energy and Division headings in the viewport.
  function place(y: number, height: number, tops: number[]) {
    Object.defineProperty(window, 'innerHeight', { configurable: true, value: 800 })
    Object.defineProperty(window, 'scrollY', { configurable: true, value: y })
    Object.defineProperty(document.documentElement, 'scrollHeight', { configurable: true, value: height })
    vi.spyOn(HTMLElement.prototype, 'getBoundingClientRect').mockImplementation(function (this: HTMLElement) {
      const at = ['Cells', 'Energy', 'Division'].indexOf(this.textContent!)
      return ({ top: this.tagName === 'H3' && at >= 0 ? tops[at] : 0 }) as DOMRect
    })
  }
  async function scrollTo(y: number, height: number, tops: number[]) {
    place(y, height, tops)
    await act(async () => window.dispatchEvent(new Event('scroll')))
  }
  const current = (c: HTMLElement) => c.querySelector('nav[aria-label="Question outline"] [aria-current=location] span')!.textContent

  it('follows the scroll position, including concepts that cannot reach the top of a short page', async () => {
    place(0, 4000, [100, 900, 1700])
    const { c } = await mountReview('/org/x/questions')
    expect(current(c)).toBe('Cells')
    await scrollTo(600, 4000, [-400, 200, 900])
    expect(current(c)).toBe('Energy')
    await scrollTo(183, 983, [117, 267, 417])
    expect(current(c)).toBe('Division')
    const link = [...c.querySelectorAll('nav[aria-label="Question outline"] a')].find((a) => a.textContent!.startsWith('Energy')) as HTMLElement
    await act(async () => link.click())
    await scrollTo(183, 983, [117, 267, 417])
    expect(current(c)).toBe('Energy')
  })

  it('releases a clicked concept when the reader drags the scrollbar with its heading still in view', async () => {
    place(0, 983, [300, 450, 600])
    const { c } = await mountReview('/org/x/questions')
    const link = [...c.querySelectorAll('nav[aria-label="Question outline"] a')].find((a) => a.textContent!.startsWith('Energy')) as HTMLElement
    await act(async () => link.click())
    expect(current(c)).toBe('Energy')
    await scrollTo(183, 983, [117, 267, 417])
    expect(current(c)).toBe('Division')
  })

  it('measures a restored scroll position on load, before any scroll event', async () => {
    place(600, 4000, [-400, 200, 900])
    const { c } = await mountReview('/org/x/questions#concept-c2')
    expect(current(c)).toBe('Energy')
  })

  it('re-measures when a filter with the same concepts moves the next heading above the line', async () => {
    place(0, 4000, [100, 900, 1700])
    const { c, router } = await mountReview('/org/x/questions')
    expect(current(c)).toBe('Cells')
    place(0, 4000, [100, 250, 400])
    await act(async () => setValue(search(c), 'stem', 'input'))
    await waitSearch(router, { q: 'stem' })
    await vi.waitFor(() => expect(current(c)).toBe('Energy'))
    expect(entries(c).map(([name]) => name)).toEqual(['Cells', 'Energy', 'Division'])
  })
})
