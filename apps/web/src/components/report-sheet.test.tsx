// @vitest-environment happy-dom
import { act } from 'react'
import { createRoot } from 'react-dom/client'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { ReportSheet } from '@/components/report-sheet'
import { reportItem } from '@/server/play'

vi.mock('motion/react', async (original) => ({ ...(await original<typeof import('motion/react')>()), useReducedMotion: () => true }))
vi.mock('@tanstack/react-start', () => ({ useServerFn: (fn: unknown) => fn }))
vi.mock('@/server/play', () => ({ reportItem: vi.fn() }))

const report = vi.mocked(reportItem) as unknown as ReturnType<typeof vi.fn>

let cleanup: (() => void) | null = null
afterEach(() => { cleanup?.(); cleanup = null; report.mockReset() })

async function mount(onSent = vi.fn()) {
  Object.assign(globalThis, { IS_REACT_ACT_ENVIRONMENT: true })
  const container = document.createElement('div')
  document.body.appendChild(container)
  const root = createRoot(container)
  await act(async () => root.render(<ReportSheet itemId="i1" attemptId="a1" company="Acme" onBack={vi.fn()} onSent={onSent} headingId="report-heading" />))
  cleanup = () => { act(() => root.unmount()); container.remove() }
  return { c: container, onSent }
}

const button = (c: HTMLElement, name: string) =>
  [...c.querySelectorAll('button')].find((b) => b.textContent?.includes(name))!

async function pick(c: HTMLElement, label: string) {
  await act(async () => button(c, label).click())
}

describe('ReportSheet', () => {
  it('keeps Send report disabled until a reason is picked', async () => {
    const { c } = await mount()
    expect(button(c, 'Send report').disabled).toBe(true)
    await pick(c, 'The question is unclear')
    expect(button(c, 'Send report').disabled).toBe(false)
    expect(button(c, 'The question is unclear').getAttribute('aria-checked')).toBe('true')
  })

  it('sends the reason and trimmed note, then reports sent', async () => {
    report.mockResolvedValue({ ok: true })
    const { c, onSent } = await mount()
    await pick(c, 'The question is unclear')
    const textarea = c.querySelector('textarea')!
    await act(async () => {
      Object.getOwnPropertyDescriptor(HTMLTextAreaElement.prototype, 'value')!.set!.call(textarea, '  Which carton? ')
      textarea.dispatchEvent(new Event('input', { bubbles: true }))
    })
    await act(async () => button(c, 'Send report').click())
    expect(report).toHaveBeenCalledWith({ data: { itemId: 'i1', reason: 'unclear', note: 'Which carton?', attemptId: 'a1' } })
    expect(onSent).toHaveBeenCalledTimes(1)
  })

  it('shows an alert when sending fails and lets the learner retry', async () => {
    report.mockRejectedValue(new Error('offline'))
    const { c, onSent } = await mount()
    await pick(c, 'Something else')
    await act(async () => button(c, 'Send report').click())
    expect(c.querySelector('[role="alert"]')!.textContent).toBe('Couldn’t send your report. Try again.')
    expect(onSent).not.toHaveBeenCalled()
    expect(button(c, 'Send report').disabled).toBe(false)
  })
})
