// @vitest-environment happy-dom
import { act } from 'react'
import { createRoot } from 'react-dom/client'
import { afterEach, expect, it, vi } from 'vitest'
import { RoleDocumentForm } from '@/components/role-document-form'
import { uploadRoleDocument } from '@/server/role-documents'

vi.mock('@/server/role-documents', () => ({ uploadRoleDocument: vi.fn() }))
vi.mock('@tanstack/react-start', () => ({ useServerFn: (fn: unknown) => fn }))

const roots: { unmount: () => void; container: HTMLElement }[] = []

afterEach(async () => {
  for (const { unmount, container } of roots.splice(0)) {
    await act(async () => unmount())
    container.remove()
  }
  vi.clearAllMocks()
})

async function mount(onUploaded: () => unknown, replaces?: { id: string; title: string }) {
  Object.assign(globalThis, { IS_REACT_ACT_ENVIRONMENT: true })
  const container = document.createElement('div')
  document.body.appendChild(container)
  const root = createRoot(container)
  roots.push({ unmount: () => root.unmount(), container })
  await act(async () => root.render(<RoleDocumentForm slug="acme" roleId="r1" roleName="Cashier" onUploaded={onUploaded} replaces={replaces} />))
  return container
}

async function choosePdf(container: HTMLElement) {
  const input = container.querySelector<HTMLInputElement>('input[type="file"]')!
  const file = new File(['%PDF-1.4'], 'handbook.pdf', { type: 'application/pdf' })
  await act(async () => {
    const transfer = new DataTransfer()
    transfer.items.add(file)
    input.files = transfer.files
    input.dispatchEvent(new Event('change', { bubbles: true }))
  })
  return file
}

async function submit(container: HTMLElement) {
  await act(async () => { container.querySelector('form')!.requestSubmit() })
}

it('uploads the chosen PDF and confirms it', async () => {
  vi.mocked(uploadRoleDocument).mockResolvedValue(undefined as never)
  const onUploaded = vi.fn()
  const container = await mount(onUploaded)
  await choosePdf(container)
  await submit(container)
  expect(uploadRoleDocument).toHaveBeenCalledTimes(1)
  const { data } = vi.mocked(uploadRoleDocument).mock.calls[0][0] as unknown as { data: FormData }
  expect(data.get('slug')).toBe('acme')
  expect(data.get('roleId')).toBe('r1')
  expect((data.get('file') as File).name).toBe('handbook.pdf')
  expect(container.querySelector('[role="status"]')?.textContent).toBe('Document added.')
  expect(onUploaded).toHaveBeenCalledTimes(1)
})

it('shows a server error and does not report an upload', async () => {
  vi.mocked(uploadRoleDocument).mockRejectedValue(Object.assign(new Error('Only company admins can do this'), { status: 403 }))
  const onUploaded = vi.fn()
  const container = await mount(onUploaded)
  await choosePdf(container)
  await submit(container)
  expect(container.querySelector('[role="alert"]')?.textContent).toBe('Only company admins can do this')
  expect(container.textContent).not.toContain('Document added.')
  expect(onUploaded).not.toHaveBeenCalled()
})

it('sends the id of the document being replaced', async () => {
  vi.mocked(uploadRoleDocument).mockResolvedValue(undefined as never)
  const container = await mount(vi.fn(), { id: 'd1', title: 'Till handbook' })
  expect(container.querySelector('summary')?.textContent).toBe('Replace Till handbook')
  await choosePdf(container)
  await submit(container)
  const { data } = vi.mocked(uploadRoleDocument).mock.calls[0][0] as unknown as { data: FormData }
  expect(data.get('replacesId')).toBe('d1')
  expect((data.get('file') as File).name).toBe('handbook.pdf')
})
