// @vitest-environment happy-dom
import { act, useState } from 'react'
import type { ReactNode } from 'react'
import { createRoot } from 'react-dom/client'
import { Ban } from 'lucide-react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { Segmented } from '@/components/ui/segmented'
import { Switch } from '@/components/ui/switch'
import { Textarea } from '@/components/ui/textarea'
import { ConfirmDialog } from './confirm-dialog'
import { TextCount } from './text-count'

Object.assign(globalThis, { IS_REACT_ACT_ENVIRONMENT: true })

const cleanups: (() => Promise<void>)[] = []
afterEach(async () => {
  for (const c of cleanups.splice(0)) await c()
})

async function render(node: ReactNode) {
  const container = document.createElement('div')
  document.body.appendChild(container)
  const root = createRoot(container)
  await act(async () => { root.render(node) })
  cleanups.push(async () => { await act(async () => root.unmount()); container.remove() })
  return container
}

const button = (name: string) => [...document.querySelectorAll('button')].find((b) => b.textContent === name)!
const click = (el: HTMLElement) => act(async () => { el.click() })
const keydown = (el: Element, key: string) =>
  act(async () => { el.dispatchEvent(new KeyboardEvent('keydown', { key, bubbles: true, cancelable: true })) })

function Harness({ onConfirm, reason, description, consequences = [{ icon: Ban, text: 'Ana is signed out.' }] }: {
  onConfirm: (r?: string) => void | Promise<void>
  reason?: boolean
  description?: ReactNode
  consequences?: { icon: typeof Ban; text: string }[]
}) {
  const [open, setOpen] = useState(false)
  return (
    <>
      <button onClick={() => setOpen(true)}>Retire</button>
      <ConfirmDialog
        open={open}
        onOpenChange={setOpen}
        title="Ban Ana?"
        consequences={consequences}
        verb="Ban"
        object="user"
        reason={reason}
        description={description}
        onConfirm={onConfirm}
      />
    </>
  )
}

describe('dialogs and form controls', () => {
  it.each([false, true])('describes the consequences and optional target, preserves initial focus, and restores it on Cancel/Escape (description: %s)', async (withDescription) => {
    const identity = 'ana@acme.test · Acme · Member'
    const consequences = [
      { icon: Ban, text: "They're signed out on every device and can't sign in." },
      { icon: Ban, text: 'Their training records stay. Unban restores access.' },
    ]
    await render(<Harness onConfirm={vi.fn()} reason={withDescription} description={withDescription ? identity : undefined} consequences={consequences} />)
    const opener = button('Retire')
    for (const close of [() => click(button('Cancel')), () => keydown(document.activeElement!, 'Escape')]) {
      opener.focus() // el.click() doesn't move focus; a real click does
      await click(opener)
      const dialog = document.querySelector('[role="dialog"]')!
      const list = dialog.querySelector('ul')!
      const identityParagraph = dialog.querySelector('[data-slot="dialog-header"] p')
      expect(dialog.getAttribute('aria-describedby')).toBe(withDescription ? `${identityParagraph!.id} ${list.id}` : list.id)
      const described = dialog.getAttribute('aria-describedby')!.split(' ').map((id) => document.getElementById(id)!.textContent)
      expect(described).toEqual(withDescription ? [identity, consequences.map((c) => c.text).join('')] : [consequences.map((c) => c.text).join('')])
      expect(document.activeElement).toBe(withDescription ? dialog.querySelector('textarea') : button('Cancel'))
      expect(opener.closest('[aria-hidden="true"]')).not.toBeNull()
      await close()
      await act(async () => { await new Promise((r) => setTimeout(r, 10)) }) // Radix restores focus on a timeout
      expect(document.querySelector('[role="dialog"]')).toBeNull()
      expect(document.activeElement).toBe(opener)
    }
  })

  it('requires a reason, then confirms with it', async () => {
    const onConfirm = vi.fn()
    await render(<Harness onConfirm={onConfirm} reason />)
    await click(button('Retire'))
    await click(button('Ban user'))
    const area = document.querySelector('textarea')!
    expect(onConfirm).not.toHaveBeenCalled()
    expect(document.activeElement).toBe(area)
    expect(area.getAttribute('aria-invalid')).toBe('true')
    const ids = area.getAttribute('aria-describedby')!.split(' ')
    const err = ids.map((i) => document.getElementById(i)!).find((e) => e.getAttribute('role') === 'alert')!
    expect(err.getAttribute('role')).toBe('alert')
    expect(err.textContent).toContain('Enter a reason. Other staff see it in the user list.')
    await act(async () => {
      Object.getOwnPropertyDescriptor(HTMLTextAreaElement.prototype, 'value')!.set!.call(area, 'Spam')
      area.dispatchEvent(new Event('input', { bubbles: true }))
    })
    await click(button('Ban user'))
    expect(onConfirm).toHaveBeenCalledWith('Spam')
  })

  it('keeps a long consequence list in a keyboard-scrollable region apart from the confirm controls', async () => {
    const many = Array.from({ length: 20 }, (_, i) => ({ icon: Ban, text: `Concept ${i + 1} is also in Site guide v2.` }))
    await render(<Harness onConfirm={vi.fn()} consequences={many} />)
    await click(button('Retire'))
    const dialog = document.querySelector('[role="dialog"]')!
    const region = dialog.querySelector<HTMLElement>('[role="region"][aria-label="Consequences"]')!
    // The dialog is described by the consequences themselves, not by the region's label.
    const description = document.getElementById(dialog.getAttribute('aria-describedby')!)!
    expect(description.hasAttribute('aria-label')).toBe(false)
    expect(description.querySelectorAll('li')).toHaveLength(20)
    expect(description.textContent).toContain('Concept 20 is also in Site guide v2.')
    expect(region.contains(description)).toBe(true)
    expect(region.tabIndex).toBe(0)
    await act(async () => { region.focus() })
    expect(document.activeElement).toBe(region)
    for (const name of ['Cancel', 'Ban user']) expect(region.contains(button(name))).toBe(false)
  })

  it('stays open and shows an alert when confirming fails', async () => {
    await render(<Harness onConfirm={() => Promise.reject(new Error('Server said no'))} />)
    await click(button('Retire'))
    await click(button('Ban user'))
    const dialog = document.querySelector('[role="dialog"]')!
    expect(dialog.querySelector('[role="alert"]')?.textContent).toContain('Server said no')
  })

  it('switch toggles aria-checked', async () => {
    function S() {
      const [on, setOn] = useState(false)
      return <Switch checked={on} onCheckedChange={setOn} aria-label="Push" />
    }
    const el = await render(<S />)
    const sw = el.querySelector('[role="switch"]')!
    expect(sw.getAttribute('aria-checked')).toBe('false')
    await click(sw as HTMLElement)
    expect(sw.getAttribute('aria-checked')).toBe('true')
  })

  it('segmented radiogroup moves selection and focus with ArrowRight', async () => {
    function S() {
      const [v, setV] = useState('a')
      return <Segmented mode="radiogroup" value={v} onValueChange={setV} aria-label="Pick" options={[{ value: 'a', label: 'A' }, { value: 'b', label: 'B' }]} />
    }
    const el = await render(<S />)
    const [a, b] = [...el.querySelectorAll('[role="radio"]')] as HTMLElement[]
    a.focus()
    await keydown(a, 'ArrowRight')
    expect(b.getAttribute('aria-checked')).toBe('true')
    expect(a.getAttribute('aria-checked')).toBe('false')
    expect(document.activeElement).toBe(b)
  })

  it('text count alerts over the limit without trimming the value', async () => {
    const long = 'x'.repeat(25)
    function F() {
      const [v, setV] = useState(long)
      return <><Textarea value={v} onChange={(e) => setV(e.target.value)} /><TextCount id="c" value={v} max={20} /></>
    }
    const el = await render(<F />)
    const count = el.querySelector('#c')!
    expect(count.getAttribute('role')).toBe('alert')
    expect(count.textContent).toContain('25')
    expect(el.querySelector('textarea')!.value).toHaveLength(25)
  })
})
