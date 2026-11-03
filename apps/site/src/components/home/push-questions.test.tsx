import { act } from 'react'
import { createRoot } from 'react-dom/client'
import type { Root } from 'react-dom/client'
import { renderToStaticMarkup } from 'react-dom/server'
import { afterEach, beforeEach, expect, it, vi } from 'vitest'
import { PushQuestions } from './push-questions'

let container: HTMLDivElement
let root: Root | null = null

beforeEach(() => {
  Object.assign(globalThis, { IS_REACT_ACT_ENVIRONMENT: true })
  container = document.createElement('div')
  document.body.appendChild(container)
})

afterEach(async () => {
  if (root) {
    await act(async () => root!.unmount())
    root = null
  }
  container.remove()
  vi.unstubAllGlobals()
})

async function mount() {
  root = createRoot(container)
  await act(async () => {
    root!.render(<PushQuestions />)
  })
  return container
}

function headings() {
  return [...container.querySelectorAll('h3')].map((h) => h.textContent?.trim())
}

it('names the section "Between tasks, one question at a time." with a three-screen list', async () => {
  await mount()
  const section = container.querySelector('section')!
  expect(section).not.toBeNull()
  const labelledBy = section.getAttribute('aria-labelledby')
  expect(labelledBy).toBeTruthy()
  const heading = container.querySelector('h2')!
  expect(heading.id).toBe(labelledBy)
  expect(heading.textContent?.trim()).toBe('Between tasks, one question at a time.')
  const list = container.querySelector('ol')!
  expect(list.getAttribute('aria-label')).toBe('From push to done, three screens')
  expect(list.querySelectorAll(':scope > li')).toHaveLength(3)
})

it('presents each phone as one labelled image with an h3 caption and h3 facts', async () => {
  await mount()
  const phones = [...container.querySelectorAll('[role="img"]')]
  expect(phones).toHaveLength(3)
  expect(phones.map((phone) => phone.getAttribute('aria-label'))).toEqual([
    'Lock screen at 9:41 with a Learn Quiz notification: Your pick slot is empty. What do you do first?',
    'A one-question session: Your pick slot is empty. What do you do first? Report a short pick on the scanner is selected, and Sure.',
    'Done screen: Report a short pick on the scanner, with the quote from Warehouse picker SOPs, section 2.4. One review cleared, three left today.',
  ])
  for (const phone of phones) {
    expect(phone.querySelector('[aria-hidden="true"]')).not.toBeNull()
  }
  expect(phones[0].textContent).toContain('9:41')
  expect(phones[0].textContent).toContain('Tuesday, November 3')
  expect(phones[0].textContent).toContain('Learn Quiz · now')
  for (const option of [
    'Report a short pick on the scanner',
    'Take one from the next slot',
    'Skip it and come back',
    'Wait for a restock',
  ]) {
    expect(phones[1].textContent).toContain(option)
  }
  expect(phones[2].textContent).toContain('1 review cleared')
  expect(phones[2].textContent).toContain('Warehouse picker SOPs v3 · §2.4')
  expect(phones[2].textContent).toContain('3 left today')
  expect(phones[2].textContent).toContain('Back to Today')
  const titles = headings()
  for (const caption of ['The push is the question', 'One question', 'The answer, with its source']) {
    expect(titles).toContain(caption)
  }
  for (const fact of ['Working hours only', 'Ignoring one is fine']) {
    expect(titles).toContain(fact)
  }
  expect(titles).toHaveLength(5)
  expect(container.textContent).toContain('Under 60 characters, nothing else.')
  expect(container.textContent).toContain('Answer it and say how sure you are.')
  expect(container.textContent).toContain('Then back to work.')
  expect(container.textContent).toContain('Pushes arrive during working hours. Nothing at night or on days off.')
  expect(container.textContent).toContain(
    'A push left unanswered is never penalized. The question waits for the next session.',
  )
})

it('keeps no focusable descendants inside the phones', async () => {
  await mount()
  const phones = [...container.querySelectorAll('[role="img"]')]
  expect(phones).toHaveLength(3)
  for (const phone of phones) {
    expect(phone.querySelectorAll('a[href], button, input, select, textarea, [tabindex]')).toHaveLength(0)
  }
})

it('makes the list a tab stop only while it actually overflows', async () => {
  let clientWidth = 0
  let scrollWidth = 0
  const clientWidthDescriptor = Object.getOwnPropertyDescriptor(HTMLElement.prototype, 'clientWidth')
  const scrollWidthDescriptor = Object.getOwnPropertyDescriptor(HTMLElement.prototype, 'scrollWidth')
  Object.defineProperties(HTMLElement.prototype, {
    clientWidth: { get() { return clientWidth }, configurable: true },
    scrollWidth: { get() { return scrollWidth }, configurable: true },
  })
  try {
    const server = document.createElement('div')
    server.innerHTML = renderToStaticMarkup(<PushQuestions />)
    expect(server.querySelector('ol')).not.toBeNull()
    expect(server.querySelector('ol')!.hasAttribute('tabindex')).toBe(false)

    async function resize() {
      await act(async () => {
        window.dispatchEvent(new Event('resize'))
      })
    }

    clientWidth = 296
    scrollWidth = 920
    await mount()
    const list = container.querySelector('ol')!
    expect(list.getAttribute('tabindex')).toBe('0')

    scrollWidth = 200
    await resize()
    expect(list.hasAttribute('tabindex')).toBe(false)

    scrollWidth = clientWidth + 1
    await resize()
    expect(list.hasAttribute('tabindex')).toBe(false)

    scrollWidth = clientWidth + 2
    await resize()
    expect(list.getAttribute('tabindex')).toBe('0')
  } finally {
    if (clientWidthDescriptor) Object.defineProperty(HTMLElement.prototype, 'clientWidth', clientWidthDescriptor)
    else Reflect.deleteProperty(HTMLElement.prototype, 'clientWidth')
    if (scrollWidthDescriptor) Object.defineProperty(HTMLElement.prototype, 'scrollWidth', scrollWidthDescriptor)
    else Reflect.deleteProperty(HTMLElement.prototype, 'scrollWidth')
  }
})
