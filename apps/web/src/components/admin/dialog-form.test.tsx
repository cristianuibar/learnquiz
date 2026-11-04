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

function Harness({ onConfirm, reason }: { onConfirm: (r?: string) => void | Promise<void>; reason?: boolean }) {
  const [open, setOpen] = useState(false)
  return (
    <>
      <button onClick={() => setOpen(true)}>Retire</button>
      <ConfirmDialog
        open={open}
        onOpenChange={setOpen}
        title="Ban Ana?"
        consequences={[{ icon: Ban, text: 'Ana is signed out.' }]}
        verb="Ban"
        object="user"
        reason={reason}
        onConfirm={onConfirm}
      />
    </>
  )
}

describe('dialogs and form controls', () => {
  it('focuses Cancel, hides the page behind, and restores focus on Cancel and Escape', async () => {
    await render(<Harness onConfirm={vi.fn()} />)
    const opener = button('Retire')
    for (const close of [() => click(button('Cancel')), () => keydown(document.activeElement!, 'Escape')]) {
      opener.focus() // el.click() doesn't move focus; a real click does
      await click(opener)
      expect(document.activeElement).toBe(button('Cancel'))
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
    const err = document.getElementById(area.getAttribute('aria-describedby')!)!
    expect(err.getAttribute('role')).toBe('alert')
    expect(err.textContent).toContain('Enter a reason. Other staff see it in the user list.')
    await act(async () => {
      Object.getOwnPropertyDescriptor(HTMLTextAreaElement.prototype, 'value')!.set!.call(area, 'Spam')
      area.dispatchEvent(new Event('input', { bubbles: true }))
    })
    await click(button('Ban user'))
    expect(onConfirm).toHaveBeenCalledWith('Spam')
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
