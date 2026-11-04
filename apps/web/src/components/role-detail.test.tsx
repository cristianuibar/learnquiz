// @vitest-environment happy-dom
import { act } from 'react'
import { createRoot } from 'react-dom/client'
import { createMemoryHistory, createRootRoute, createRoute, createRouter, Outlet, RouterProvider, useParams } from '@tanstack/react-router'
import { PortalProvider } from '@/components/portal/portal-context'
import { afterEach, expect, it, vi } from 'vitest'
import { Route as roleDetailRoute } from '@/routes/org.$slug.roles_.$roleId'
import { retireRoleDocument, uploadRoleDocument } from '@/server/role-documents'
import { retryConceptGeneration } from '@/server/curriculum'
import { getRoleDetail, updateRoleConcept } from '@/server/role-detail'

vi.mock('@/server/role-detail', () => ({ getRoleDetail: vi.fn(), updateRoleConcept: vi.fn() }))
vi.mock('@/server/curriculum', () => ({ generateRoleCurriculum: vi.fn(), retryConceptGeneration: vi.fn() }))
vi.mock('@/server/role-documents', () => ({ uploadRoleDocument: vi.fn(), retireRoleDocument: vi.fn() }))
vi.mock('@tanstack/react-start', () => ({ useServerFn: (fn: unknown) => fn }))

// The portal layout provides the link context; screens are rendered under it here.
function PortalRoot() {
  const { slug } = useParams({ strict: false })
  return <PortalProvider slug={slug ?? ''} base="org" readOnly={false}><Outlet /></PortalProvider>
}

type Doc = { id: string; title: string; kind: string; version: number; createdAt: number; status: string; error: null; sizeBytes: number | null; pageCount: number | null; chars: number; uploaderName: string | null }
const pdf: Doc = { id: 'd1', title: 'Till handbook', kind: 'pdf', version: 2, createdAt: Date.UTC(2026, 9, 28), status: 'ready', error: null, sizeBytes: 1000, pageCount: 18, chars: 9000, uploaderName: 'Dana Whitaker' }
const pasted: Doc = { ...pdf, id: 'd2', title: 'Closing notes', kind: 'text', version: 1, createdAt: Date.UTC(2026, 10, 2), pageCount: null, chars: 6240 }
const concept = (id: string, name: string, genStatus: string, over: Record<string, unknown> = {}) => ({ id, name, summary: `About ${name}`, critical: false, genStatus, genError: null, questionCount: genStatus === 'ready' ? 4 : 0, ...over })
const concepts = [concept('c1', 'Cash float', 'ready'), concept('c2', 'Card reader', 'generating')]

function makeDetail(over: { status?: string; documents?: Doc[]; units?: unknown[]; readOnly?: boolean } = {}) {
  return {
    org: { slug: 'x', name: 'Acme' },
    readOnly: over.readOnly ?? false,
    role: { id: 'r1', name: 'Cashier', benchmark: 0.85, onboardingDays: 30, topicId: 't1', topicStatus: over.status ?? 'draft', people: 3, liveQuestions: 12, criticalQuestions: 5 },
    documents: over.documents ?? [],
    units: over.units ?? [],
  }
}

async function renderDetail(detail: ReturnType<typeof makeDetail>) {
  vi.mocked(getRoleDetail).mockResolvedValue(detail as never)
  Object.assign(globalThis, { IS_REACT_ACT_ENVIRONMENT: true })
  const rootRoute = createRootRoute({ component: PortalRoot })
  const page = createRoute({ getParentRoute: () => rootRoute, path: '/org/$slug/roles/$roleId', loader: roleDetailRoute.options.loader as (ctx: { params: { slug: string; roleId: string } }) => ReturnType<typeof getRoleDetail>, component: roleDetailRoute.options.component })
  const router = createRouter({ routeTree: rootRoute.addChildren([page]), history: createMemoryHistory({ initialEntries: ['/org/x/roles/r1'] }) })
  const container = document.createElement('div')
  document.body.appendChild(container)
  const root = createRoot(container)
  await act(async () => { await router.load(); root.render(<RouterProvider router={router} />) })
  const button = (name: string) => [...container.querySelectorAll('button')].find((b) => b.textContent === name || b.getAttribute('aria-label') === name)
  const status = () => container.querySelector('[role="status"]')!.textContent
  const cleanup = async () => {
    await act(async () => root.unmount())
    container.remove()
  }
  return { container, button, cleanup, router, status }
}

let cleanups: Array<() => Promise<void>> = []
async function mount(detail: ReturnType<typeof makeDetail>) {
  const view = await renderDetail(detail)
  cleanups.push(view.cleanup)
  return view
}
afterEach(async () => {
  for (const c of cleanups) await c()
  cleanups = []
  vi.unstubAllGlobals()
  vi.clearAllMocks()
  delete (globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT
})

const nameOf = (el: Element, root: Element) => el.getAttribute('aria-labelledby')!.split(' ').map((id) => root.querySelector(`[id="${id}"]`)!.textContent).join(' ')
const unit = (list: unknown[]) => [{ id: 'u1', name: 'Opening', summary: 'Start of day', concepts: list }]

it('shows a role with its documents and concepts', async () => {
  const { container } = await mount(makeDetail({ status: 'generating', documents: [pdf], units: unit(concepts) }))
  expect(container.textContent).toContain('v2')
  expect(container.textContent).toContain('Cash float')
  expect(container.textContent).toContain('Card reader')
  expect(container.textContent).toContain('1 of 2 concepts ready')
  expect(container.textContent).toContain('Benchmark 85% · Onboarding 30 days · 3 people')
  expect(getRoleDetail).toHaveBeenCalledWith({ data: { slug: 'x', roleId: 'r1' } })
})

it('saves the Critical switch, named by its column header and concept', async () => {
  vi.mocked(updateRoleConcept).mockResolvedValue({ ok: true })
  const { container } = await mount(makeDetail({ status: 'ready', documents: [pdf], units: unit([concept('c1', 'Cash float', 'ready')]) }))
  const sw = container.querySelector('[role="switch"]')!
  expect(nameOf(sw, container)).toBe('Critical Cash float')
  const before = vi.mocked(getRoleDetail).mock.calls.length
  await act(async () => { (sw as HTMLElement).click() })
  expect(updateRoleConcept).toHaveBeenCalledWith({ data: { slug: 'x', conceptId: 'c1', critical: true } })
  await vi.waitFor(() => expect(vi.mocked(getRoleDetail).mock.calls.length).toBeGreaterThan(before))
})

// happy-dom applies no container queries, so this compares the narrow-list rules the header shares with the rows.
it('stacks the Questions and Critical headers with the concept rows below a 560px list', async () => {
  const { container } = await mount(makeDetail({ status: 'ready', documents: [pdf], units: unit([concept('c1', 'Cash float', 'ready')]) }))
  const narrow = (el: Element) => el.className.split(' ').filter((c) => c.startsWith('@max-[560px]:')).sort()
  const header = container.querySelector('[id$="-crit"]')!.parentElement!.parentElement!
  const row = container.querySelector('li li')!
  expect(narrow(header)).toEqual(narrow(row))
  expect(narrow(header)).toContain('@max-[560px]:grid-cols-1')
  expect(narrow(header.firstElementChild!)).toEqual(['@max-[560px]:hidden'])
  const questionsHeader = [...header.querySelectorAll('span')].find((s) => s.textContent === 'Questions')!
  expect(narrow(questionsHeader)).toEqual(narrow(row.children[1].firstElementChild!))
})

it('saves the edit form with a Critical value toggled before the page reloaded', async () => {
  vi.mocked(updateRoleConcept).mockResolvedValue({ ok: true })
  const { container, button } = await mount(makeDetail({ status: 'ready', documents: [pdf], units: unit([concept('c1', 'Cash float', 'ready')]) }))
  await act(async () => { (container.querySelector('[role="switch"]') as HTMLElement).click() })
  await act(async () => { button('Edit concept: Cash float')!.click() })
  const form = container.querySelector<HTMLFormElement>('form[aria-label="Edit concept: Cash float"]')!
  expect(form.querySelector('[role="switch"]')!.getAttribute('aria-checked')).toBe('true')
  await act(async () => { form.requestSubmit() })
  expect(updateRoleConcept).toHaveBeenLastCalledWith({ data: { slug: 'x', conceptId: 'c1', name: 'Cash float', summary: 'About Cash float', critical: true } })
})

it('disables Edit while a concept is queued, and moves focus into and out of the edit form', async () => {
  const { container, button } = await mount(makeDetail({ status: 'generating', documents: [pdf], units: unit([concept('c1', 'Cash float', 'ready'), concept('c2', 'Card reader', 'pending')]) }))
  expect(button('Edit concept: Card reader')!.hasAttribute('disabled')).toBe(true)
  await act(async () => { button('Edit concept: Cash float')!.click() })
  const form = container.querySelector('form[aria-label="Edit concept: Cash float"]')!
  expect(document.activeElement).toBe(form.querySelector('input'))
  expect((document.activeElement as HTMLInputElement).value).toBe('Cash float')
  await act(async () => { [...form.querySelectorAll('button')].find((b) => b.textContent === 'Cancel')!.click() })
  expect(document.activeElement).toBe(button('Edit concept: Cash float'))
})

it('announces build progress every five concepts and when the curriculum is ready', async () => {
  const build = (readyN: number, done = false) => {
    const list = Array.from({ length: 31 }, (_, i) => concept(`c${i}`, `Concept ${i}`, i < readyN ? 'ready' : 'pending'))
    return makeDetail({ status: done ? 'ready' : 'generating', documents: [pdf], units: unit(list) })
  }
  const { container, router, status } = await mount(build(10))
  expect(status()).toBe('10 of 31 concepts ready')
  const refresh = async (d: ReturnType<typeof makeDetail>) => {
    vi.mocked(getRoleDetail).mockResolvedValue(d as never)
    await act(() => router.invalidate())
  }
  for (const n of [11, 12, 13, 14]) {
    await refresh(build(n))
    expect(status()).toBe('10 of 31 concepts ready')
  }
  await refresh(build(15))
  expect(status()).toBe('15 of 31 concepts ready')
  expect(container.textContent).not.toContain('Curriculum ready ·')
  await refresh(build(31, true))
  expect(status()).toBe('31 of 31 concepts ready. Curriculum ready.')
  expect(container.textContent).toContain('Curriculum ready · 31 concepts')
  expect(container.textContent).toContain('31 concepts · 12 live questions · 5 critical questions')
})

it('announces finding concepts while a build has none yet, then the first count', async () => {
  const { router, status } = await mount(makeDetail({ status: 'generating', documents: [pdf] }))
  expect(status()).toBe('Finding concepts…')
  vi.mocked(getRoleDetail).mockResolvedValue(makeDetail({ status: 'generating', documents: [pdf], units: unit([concept('c1', 'Cash float', 'pending'), concept('c2', 'Card reader', 'pending')]) }) as never)
  await act(() => router.invalidate())
  expect(status()).toBe('0 of 2 concepts ready')
})

it('counts only ready concepts when a build ends with a failed concept', async () => {
  const build = (readyN: number, status: string, failedN = 0) => {
    const list = Array.from({ length: 31 }, (_, i) => concept(`c${i}`, `Concept ${i}`, i < readyN ? 'ready' : i < readyN + failedN ? 'failed' : 'pending'))
    return makeDetail({ status, documents: [pdf], units: unit(list) })
  }
  const { container, router, status } = await mount(build(29, 'generating'))
  vi.mocked(getRoleDetail).mockResolvedValue(build(29, 'ready', 2) as never)
  await act(() => router.invalidate())
  expect(status()).toBe('29 of 31 concepts ready. 2 concepts failed.')
  expect(container.textContent).toContain('Curriculum built · 29 of 31 concepts ready · 2 failed')
  expect(container.textContent).not.toContain('Curriculum ready')
})

it('retries a failed concept', async () => {
  vi.mocked(retryConceptGeneration).mockResolvedValue({ ok: true } as never)
  const { button } = await mount(makeDetail({ status: 'ready', documents: [pdf], units: unit([concept('c9', 'Safe drop', 'failed', { genError: 'No draft passed' })]) }))
  await act(async () => { button('Retry questions for Safe drop')!.click() })
  expect(retryConceptGeneration).toHaveBeenCalledWith({ data: { slug: 'x', conceptId: 'c9' } })
})

it('shows only the Critical chip when read-only', async () => {
  const { container, button } = await mount(makeDetail({ status: 'ready', readOnly: true, documents: [pdf], units: unit([concept('c1', 'Cash float', 'ready', { critical: true }), concept('c2', 'Card reader', 'failed')]) }))
  expect(container.querySelector('[role="switch"]')).toBeNull()
  expect(button('Edit concept: Cash float')).toBeUndefined()
  expect(button('Retry questions for Card reader')).toBeUndefined()
  expect(container.querySelector('li li')!.textContent).toContain('Critical')
})

it('retires a document from its row menu after confirmation', async () => {
  vi.mocked(retireRoleDocument).mockResolvedValue({ ok: true })
  const confirm = vi.fn(() => true)
  vi.stubGlobal('confirm', confirm)
  const { button } = await mount(makeDetail({ status: 'ready', documents: [pdf] }))
  const before = vi.mocked(getRoleDetail).mock.calls.length
  await act(async () => { button('More actions for Till handbook')!.click() })
  const item = [...document.querySelectorAll<HTMLElement>('[role="menuitem"]')].find((b) => b.textContent === 'Retire document')!
  await act(async () => { item.click() })
  expect(confirm).toHaveBeenCalledWith('Retire this document? Its questions stop appearing in practice.')
  expect(retireRoleDocument).toHaveBeenCalledWith({ data: { slug: 'x', roleId: 'r1', sourceId: 'd1' } })
  await vi.waitFor(() => expect(vi.mocked(getRoleDetail).mock.calls.length).toBeGreaterThan(before))
})

it('shows the drop zone and no file list for an empty role', async () => {
  const { container, button } = await mount(makeDetail())
  expect(container.textContent).toContain('Drop a PDF here')
  expect(button('Upload PDF')).toBeTruthy()
  expect(container.querySelector('ul[aria-label^="Documents for"]')).toBeNull()
  expect(container.textContent).toContain('Add a document to build the curriculum.')
})

it('shows the page and pasted-text meta on file rows', async () => {
  const { container } = await mount(makeDetail({ documents: [pasted, pdf] }))
  expect(container.textContent).toContain('PDF · 18 pages · Oct 28, 2026 · Dana Whitaker')
  expect(container.textContent).toContain('Pasted text · 6,240 characters · Nov 2, 2026 · Dana Whitaker')
})

class FakeXhr {
  static instances: FakeXhr[] = []
  upload: { onprogress: ((e: { loaded: number; total: number }) => void) | null } = { onprogress: null }
  onload: (() => void | Promise<void>) | null = null
  onerror: (() => void) | null = null
  status = 0
  responseText = ''
  withCredentials = false
  open = vi.fn()
  send = vi.fn()
  abort = vi.fn()
  constructor() { FakeXhr.instances.push(this) }
}

async function pickFile(container: HTMLElement, file: File) {
  const input = container.querySelector<HTMLInputElement>('input[type="file"]')!
  Object.defineProperty(input, 'files', { value: [file], configurable: true })
  await act(async () => { input.dispatchEvent(new Event('change', { bubbles: true })) })
}
const statusText = (container: HTMLElement) => container.querySelector('[role="status"]')!.textContent
const MB = 1048576

it('rejects a PDF over 10 MB before sending anything and keeps focus where it was', async () => {
  vi.stubGlobal('XMLHttpRequest', FakeXhr)
  FakeXhr.instances = []
  const { container, button } = await mount(makeDetail())
  button('Upload PDF')!.focus()
  const focused = document.activeElement
  const file = new File(['x'], 'Forklift manual.pdf', { type: 'application/pdf' })
  Object.defineProperty(file, 'size', { value: 11 * MB })
  await pickFile(container, file)
  expect(FakeXhr.instances).toHaveLength(0)
  expect(container.querySelector('[role="alert"]')!.textContent).toBe("Forklift manual.pdf wasn't uploaded. It's 11.0 MB; the limit is 10 MB. Split it or export a smaller PDF.")
  expect(document.activeElement).toBe(focused)
  await act(async () => { button('Dismiss')!.click() })
  expect(container.querySelector('[role="alert"]')).toBeNull()
})

it('posts the PDF with progress, announcing only at quarter steps', async () => {
  vi.stubGlobal('XMLHttpRequest', FakeXhr)
  FakeXhr.instances = []
  const { container, button } = await mount(makeDetail({ documents: [pdf] }))
  const file = new File(['%PDF'], 'sop.pdf', { type: 'application/pdf' })
  Object.defineProperty(file, 'size', { value: 2.4 * MB })
  await pickFile(container, file)
  const xhr = FakeXhr.instances[0]!
  expect(xhr.open).toHaveBeenCalledWith('POST', '/api/org/x/roles/r1/documents')
  expect(xhr.withCredentials).toBe(true)
  expect((xhr.send.mock.calls[0]![0] as FormData).get('file')).toBe(file)
  const progress = async (pct: number) => act(async () => { xhr.upload.onprogress!({ loaded: (pct / 100) * 2.4 * MB, total: 2.4 * MB }) })
  await progress(10)
  expect(statusText(container)).toBe('')
  await progress(30)
  expect(statusText(container)).toBe('Uploading sop.pdf, 25%')
  await progress(40)
  expect(statusText(container)).toBe('Uploading sop.pdf, 25%')
  await progress(55)
  expect(statusText(container)).toBe('Uploading sop.pdf, 50%')
  const bar = container.querySelector('[role="progressbar"]')!
  expect(bar.getAttribute('aria-valuetext')).toBe('1.3 of 2.4 MB')
  const build = button('Build curriculum')!
  expect(build.hasAttribute('disabled')).toBe(true)
  expect(build.getAttribute('data-variant')).not.toBe('accent')
})

it('cancels an upload in flight and removes its row', async () => {
  vi.stubGlobal('XMLHttpRequest', FakeXhr)
  FakeXhr.instances = []
  const { container, button } = await mount(makeDetail())
  await pickFile(container, new File(['%PDF'], 'sop.pdf', { type: 'application/pdf' }))
  expect(container.querySelector('[role="progressbar"]')).not.toBeNull()
  await act(async () => { button('Cancel upload')!.click() })
  expect(FakeXhr.instances[0]!.abort).toHaveBeenCalled()
  expect(container.querySelector('[role="progressbar"]')).toBeNull()
  expect(container.querySelector('[role="alert"]')).toBeNull()
})

it('swaps the uploading row for the new document, announces it and moves focus to Replace', async () => {
  vi.stubGlobal('XMLHttpRequest', FakeXhr)
  FakeXhr.instances = []
  const { container, button } = await mount(makeDetail())
  await pickFile(container, new File(['%PDF'], 'sop.pdf', { type: 'application/pdf' }))
  button('Cancel upload')!.focus()
  const added: Doc = { ...pdf, id: 'new1', title: 'sop' }
  vi.mocked(getRoleDetail).mockResolvedValue(makeDetail({ documents: [added] }) as never)
  const before = vi.mocked(getRoleDetail).mock.calls.length
  const xhr = FakeXhr.instances[0]!
  xhr.status = 200
  xhr.responseText = JSON.stringify({ sourceId: 'new1', topicId: 't1', r2Key: 'k', chars: 10, version: 1 })
  await act(async () => { await xhr.onload!() })
  await vi.waitFor(() => expect(vi.mocked(getRoleDetail).mock.calls.length).toBeGreaterThan(before))
  await vi.waitFor(() => expect(container.querySelector('[role="progressbar"]')).toBeNull())
  expect(container.textContent).toContain('sop')
  expect(statusText(container)).toBe('sop.pdf uploaded. 1 document ready.')
  expect(document.activeElement).toBe(button('Replace sop'))
})

it('flags pasted text over the limit without trimming it', async () => {
  const { container, button } = await mount(makeDetail({ documents: [pdf] }))
  await act(async () => { button('Paste text')!.click() })
  const area = container.querySelector<HTMLTextAreaElement>('#rd-paste textarea')!
  const setter = Object.getOwnPropertyDescriptor(HTMLTextAreaElement.prototype, 'value')!.set!
  await act(async () => {
    setter.call(area, 'a'.repeat(60001))
    area.dispatchEvent(new Event('input', { bubbles: true }))
  })
  expect(container.textContent).toContain('60,001 / 60,000 characters. Remove 1 or upload a PDF instead.')
  expect(button('Add text')!.hasAttribute('disabled')).toBe(true)
  expect(area.value.length).toBe(60001)
})

it('keeps a reopened paste panel and its draft when an earlier cancelled add finishes', async () => {
  let finish!: (v: unknown) => void
  vi.mocked(uploadRoleDocument).mockReturnValue(new Promise((r) => { finish = r }) as never)
  const { container, button } = await mount(makeDetail({ documents: [pdf] }))
  const setter = Object.getOwnPropertyDescriptor(HTMLTextAreaElement.prototype, 'value')!.set!
  const type = async (value: string) => {
    const area = container.querySelector<HTMLTextAreaElement>('#rd-paste textarea')!
    await act(async () => {
      setter.call(area, value)
      area.dispatchEvent(new Event('input', { bubbles: true }))
    })
  }
  await act(async () => { button('Paste text')!.click() })
  await type('First notes')
  await act(async () => { button('Add text')!.click() })
  await act(async () => { button('Cancel')!.click() })
  await act(async () => { button('Paste text')!.click() })
  await type('Second draft')
  const before = vi.mocked(getRoleDetail).mock.calls.length
  await act(async () => { finish({}) })
  await vi.waitFor(() => expect(vi.mocked(getRoleDetail).mock.calls.length).toBeGreaterThan(before))
  expect(container.querySelector<HTMLTextAreaElement>('#rd-paste textarea')?.value).toBe('Second draft')
})

it.each([
  ['empty', makeDetail(), 'Upload PDF'],
  ['ready to build', makeDetail({ documents: [pdf] }), 'Build curriculum'],
  ['ready', makeDetail({ status: 'ready', documents: [pdf] }), 'Review questions'],
])('has exactly one accent button in the %s state', async (_name, detail, label) => {
  const { container } = await mount(detail)
  const accents = container.querySelectorAll('[data-variant="accent"]')
  expect(accents).toHaveLength(1)
  expect(accents[0]!.textContent).toBe(label)
})

it('shows no editing controls when read-only', async () => {
  const { container, button } = await mount(makeDetail({ status: 'ready', readOnly: true, documents: [pdf] }))
  expect(container.textContent).toContain('Till handbook')
  expect(button('Replace Till handbook')).toBeUndefined()
  expect(button('More actions for Till handbook')).toBeUndefined()
  expect(container.querySelector('[data-variant="accent"]')).toBeNull()
})

it('links Review questions to the questions of this role', async () => {
  const { container } = await mount(makeDetail({ status: 'ready', documents: [pdf] }))
  const link = [...container.querySelectorAll('a')].find((a) => a.textContent === 'Review questions')!
  expect(link.getAttribute('href')).toBe('/org/x/questions?role=r1')
})
