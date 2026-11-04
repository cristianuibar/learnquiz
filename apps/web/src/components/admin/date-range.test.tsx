// @vitest-environment happy-dom
import { act } from 'react'
import { createRoot } from 'react-dom/client'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { DateRange } from './date-range'

Object.assign(globalThis, { IS_REACT_ACT_ENVIRONMENT: true })

const cleanups: (() => Promise<void>)[] = []
afterEach(async () => {
  for (const c of cleanups.splice(0)) await c()
})

async function setup() {
  const onApply = vi.fn()
  const container = document.createElement('div')
  document.body.appendChild(container)
  const root = createRoot(container)
  await act(async () => {
    root.render(<DateRange from="2026-10-05" to="2026-11-03" max="2026-11-03" onApply={onApply} />)
  })
  cleanups.push(async () => { await act(async () => root.unmount()); container.remove() })
  return onApply
}

const trigger = () => document.querySelector<HTMLButtonElement>('[aria-haspopup="dialog"]')!
const day = (label: string) => document.querySelector<HTMLButtonElement>(`button[aria-label^="${label}"]`)!
const named = (name: string) => [...document.querySelectorAll('button')].find((b) => b.textContent === name)!
const click = (el: HTMLElement) => act(async () => { el.click() })
const keydown = (el: Element, key: string) =>
  act(async () => { el.dispatchEvent(new KeyboardEvent('keydown', { key, bubbles: true, cancelable: true })) })
const active = () => document.activeElement?.getAttribute('aria-label')
const status = () => document.querySelector('[role="status"]')?.textContent

describe('DateRange', () => {
  it('opens with one tab stop on the start day and moves focus by keyboard', async () => {
    await setup()
    expect(trigger().textContent).toContain('Oct 5 – Nov 3, 2026')
    await click(trigger())
    const stops = [...document.querySelectorAll<HTMLButtonElement>('[role="grid"] button')].filter((b) => b.tabIndex === 0)
    expect(stops).toHaveLength(1)
    expect(stops[0]).toBe(document.activeElement)
    expect(active()).toBe('October 5, 2026, start')

    await keydown(document.activeElement!, 'ArrowRight')
    expect(active()).toBe('October 6, 2026, in range')
    await keydown(document.activeElement!, 'ArrowDown')
    expect(active()).toBe('October 13, 2026, in range')
    await keydown(document.activeElement!, 'Home')
    expect(active()).toBe('October 11, 2026, in range')
    await keydown(document.activeElement!, 'End')
    expect(active()).toBe('October 17, 2026, in range')

    // Page beyond the visible months: the view shifts so the day is shown.
    await keydown(document.activeElement!, 'PageUp')
    await keydown(document.activeElement!, 'PageUp')
    expect(active()).toBe('August 17, 2026')
    expect(document.body.textContent).toContain('August 2026')
    expect(document.body.textContent).not.toContain('November 2026')
    await keydown(document.activeElement!, 'PageDown')
    await keydown(document.activeElement!, 'PageDown')
    expect(active()).toBe('October 17, 2026, in range')
  })

  it('picks a new range, applies it and returns focus to the trigger', async () => {
    const onApply = await setup()
    await click(trigger())
    await click(day('October 20, 2026'))
    expect(status()).toBe('Oct 20 – choose an end date')
    expect(named('Apply').disabled).toBe(true)
    await click(day('November 2, 2026'))
    expect(status()).toBe('Oct 20 – Nov 2 · 14 days')
    await click(named('Apply'))
    expect(onApply).toHaveBeenCalledWith({ from: '2026-10-20', to: '2026-11-02' })
    expect(document.querySelector('[role="dialog"]')).toBeNull()
    expect(document.activeElement).toBe(trigger())
  })

  it('refuses a span over the limit', async () => {
    const onApply = await setup()
    await click(trigger())
    for (let i = 0; i < 13; i++) await keydown(document.activeElement!, 'PageUp')
    expect(active()).toBe('September 5, 2025')
    await click(document.activeElement as HTMLElement)
    for (let i = 0; i < 14; i++) await keydown(document.activeElement!, 'PageDown')
    expect(active()).toBe('November 3, 2026')
    await click(document.activeElement as HTMLElement)
    expect(document.body.textContent).toContain('Choose at most 365 days.')
    expect(named('Apply').disabled).toBe(true)
    expect(onApply).not.toHaveBeenCalled()
  })

  it('Escape cancels without applying and future days are unavailable', async () => {
    const onApply = await setup()
    await click(trigger())
    expect(day('November 4, 2026').disabled).toBe(true)
    expect(day('November 4, 2026').getAttribute('aria-label')).toBe('November 4, 2026, unavailable')
    await click(day('October 20, 2026'))
    await keydown(document.activeElement!, 'Escape')
    expect(onApply).not.toHaveBeenCalled()
    expect(document.querySelector('[role="dialog"]')).toBeNull()
    expect(document.activeElement).toBe(trigger())
  })
})
