// @vitest-environment happy-dom
import { act } from 'react'
import type { ReactNode } from 'react'
import { createRoot } from 'react-dom/client'
import { describe, expect, it } from 'vitest'
import { Input } from '@/components/ui/input'
import { Banner } from './banner'
import { FieldError, fieldProps } from './field-error'
import { Meter } from './meter'
import { PageHeader } from './page'
import { Stat } from './stat-figure'
import { Status, STATUS } from './status-chip'

Object.assign(globalThis, { IS_REACT_ACT_ENVIRONMENT: true })

async function render(node: ReactNode) {
  const container = document.createElement('div')
  document.body.appendChild(container)
  const root = createRoot(container)
  await act(async () => { root.render(node) })
  return container
}

describe('admin foundation', () => {
  it.each(Object.keys(STATUS) as (keyof typeof STATUS)[])('status chip "%s" shows its word and a hidden icon', async (word) => {
    const el = await render(<Status word={word} />)
    expect(el.textContent).toBe(word)
    expect(el.querySelector('svg')?.getAttribute('aria-hidden')).toBe('true')
  })

  it('banner alert has role alert; info does not', async () => {
    const alert = await render(<Banner kind="alert"><strong>Failed.</strong> Retry.</Banner>)
    expect(alert.querySelector('[role="alert"]')).not.toBeNull()
    const info = await render(<Banner>Heads up</Banner>)
    expect(info.querySelector('[role="alert"]')).toBeNull()
  })

  it('stat with null value shows a dash and "No data yet", never 0', async () => {
    const el = await render(<Stat label="Pass rate" value={null} />)
    expect(el.textContent).toContain('—')
    expect(el.textContent).toContain('No data yet')
    expect(el.textContent).not.toContain('0')
  })

  it('page header h1 keeps the brand focus ring when focused after navigation', async () => {
    const el = await render(<PageHeader title="Units" />)
    const h1 = el.querySelector('h1')!
    h1.focus()
    expect(document.activeElement).toBe(h1)
    expect(h1.classList).not.toContain('outline-none')
    expect([...h1.classList]).toEqual(expect.arrayContaining(['focus-visible:outline-2', 'focus-visible:outline-offset-2', 'focus-visible:outline-brand']))
  })

  it('meter exposes progress semantics', async () => {
    const el = await render(<Meter value={12} max={31} valueText="12 of 31 concepts ready" />)
    const bar = el.querySelector('[role="progressbar"]')!
    expect(bar.getAttribute('aria-valuetext')).toBe('12 of 31 concepts ready')
    expect(bar.getAttribute('aria-valuenow')).toBe('12')
    expect(bar.getAttribute('aria-valuemax')).toBe('31')
  })

  it('invalid input is described by an alert with an icon and uses no feedback color', async () => {
    const msg = 'Enter a number from 50 to 100.'
    const el = await render(<><Input id="x" {...fieldProps('x', msg)} /><FieldError id="x">{msg}</FieldError></>)
    const input = el.querySelector('input')!
    const err = el.querySelector(`#${input.getAttribute('aria-describedby')}`)!
    expect(err.getAttribute('role')).toBe('alert')
    expect(err.textContent).toContain(msg)
    expect(err.querySelector('svg')?.getAttribute('aria-hidden')).toBe('true')
    expect(input.getAttribute('aria-invalid')).toBe('true')
    expect(input.className).not.toContain('feedback')
  })
})
