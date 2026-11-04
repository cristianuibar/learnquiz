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

it('shows the push, question and explanation with accessible images', async () => {
  await mount()
  const section = container.querySelector('section')!
  const heading = container.querySelector('h2')!
  expect(heading.id).toBe(section.getAttribute('aria-labelledby'))
  expect(heading.textContent?.trim()).toBe('Between tasks, one question at a time.')
  const list = container.querySelector('ol')!
  expect(list.querySelectorAll(':scope > li')).toHaveLength(3)
  expect(list.querySelector('[role="img"]')?.getAttribute('aria-label')).toContain('Learn Quiz notification')
  const screenshots = [...list.querySelectorAll('img')]
  expect(screenshots.map((image) => image.alt)).toEqual([
    expect.stringContaining('Where do you move the tote to start the check?'),
    expect.stringContaining('The expanded Why explanation quotes Warehouse picker SOP v1'),
  ])
  for (const image of screenshots) expect(image.closest('[aria-hidden="true"]')).toBeNull()
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
