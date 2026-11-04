// @vitest-environment happy-dom
import { act } from 'react'
import { createRoot } from 'react-dom/client'
import { createMemoryHistory, createRootRoute, createRoute, createRouter, Outlet, RouterProvider, useParams } from '@tanstack/react-router'
import { PortalProvider } from '@/components/portal/portal-context'
import { afterEach, expect, it, vi } from 'vitest'
import { Route as roleDetailRoute } from '@/routes/org.$slug.roles_.$roleId'
import { retireRoleDocument, uploadRoleDocument } from '@/server/role-documents'
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
const concepts = [
  { id: 'c1', name: 'Cash float', summary: 'Count the float', critical: false, genStatus: 'ready', genError: null },
  { id: 'c2', name: 'Card reader', summary: 'Pair the reader', critical: false, genStatus: 'generating', genError: null },
]

function makeDetail(over: { status?: string; documents?: Doc[]; units?: unknown[]; readOnly?: boolean } = {}) {
  return {
    org: { slug: 'x', name: 'Acme' },
    readOnly: over.readOnly ?? false,
    role: { id: 'r1', name: 'Cashier', benchmark: 0.85, onboardingDays: 30, topicId: 't1', topicStatus: over.status ?? 'draft', people: 3 },
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
  const cleanup = async () => {
    await act(async () => root.unmount())
    container.remove()
  }
  return { container, button, cleanup }
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

it('shows a role with its documents and concepts and saves the Critical toggle', async () => {
  vi.mocked(updateRoleConcept).mockResolvedValue({ ok: true })
  const { container } = await mount(makeDetail({ status: 'generating', documents: [pdf], units: [{ id: 'u1', name: 'Opening', summary: 'Start of day', concepts }] }))
  expect(container.textContent).toContain('v2')
  expect(container.textContent).toContain('Cash float')
  expect(container.textContent).toContain('Card reader')
  expect(container.textContent).toContain('1 of 2 concepts done')
  expect(container.textContent).toContain('Benchmark 85% · Onboarding 30 days · 3 people')
  expect(getRoleDetail).toHaveBeenCalledWith({ data: { slug: 'x', roleId: 'r1' } })
  const before = vi.mocked(getRoleDetail).mock.calls.length
  const box = container.querySelector<HTMLInputElement>('input[type="checkbox"]')!
  await act(async () => { box.click() })
  expect(updateRoleConcept).toHaveBeenCalledWith({ data: { slug: 'x', conceptId: 'c1', critical: true } })
  await vi.waitFor(() => expect(vi.mocked(getRoleDetail).mock.calls.length).toBeGreaterThan(before))
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

it('uploads the chosen PDF with the slug, role id and file', async () => {
  vi.mocked(uploadRoleDocument).mockResolvedValue({ ok: true } as never)
  const { container, button } = await mount(makeDetail())
  const input = container.querySelector<HTMLInputElement>('input[type="file"]')!
  const clickSpy = vi.spyOn(input, 'click')
  await act(async () => { button('Upload PDF')!.click() })
  expect(clickSpy).toHaveBeenCalled()
  const file = new File(['%PDF'], 'sop.pdf', { type: 'application/pdf' })
  Object.defineProperty(input, 'files', { value: [file], configurable: true })
  await act(async () => { input.dispatchEvent(new Event('change', { bubbles: true })) })
  expect(uploadRoleDocument).toHaveBeenCalledTimes(1)
  const sent = vi.mocked(uploadRoleDocument).mock.calls[0]![0] as unknown as { data: FormData }
  expect(sent.data.get('slug')).toBe('x')
  expect(sent.data.get('roleId')).toBe('r1')
  expect((sent.data.get('file') as File).name).toBe('sop.pdf')
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
