import { act } from 'react'
import { createRoot } from 'react-dom/client'
import type { Root } from 'react-dom/client'
import { renderToStaticMarkup } from 'react-dom/server'
import { afterEach, beforeEach, expect, it, vi } from 'vitest'
import { Science } from './science'

const CHART_LABEL =
  'Illustrative chart. Read once: recall falls steeply and is nearly gone by day 7. Reviewed on days 1, 3 and 7: each review brings recall back to the top, and each drop afterwards is shallower, so recall stays high at day 14.'

type ChangeListener = (event: { matches: boolean }) => void

interface MediaStub {
  matches: boolean
  setMatches: (next: boolean) => void
}

class FakeObserver {
  static instances: FakeObserver[] = []
  callback: IntersectionObserverCallback
  options: IntersectionObserverInit | undefined
  disconnect = vi.fn()
  observe = vi.fn()
  unobserve = vi.fn()

  constructor(callback: IntersectionObserverCallback, options?: IntersectionObserverInit) {
    this.callback = callback
    this.options = options
    FakeObserver.instances.push(this)
  }

  trigger(entry: Partial<IntersectionObserverEntry>) {
    this.callback(
      [{ isIntersecting: false, intersectionRatio: 0, ...entry } as IntersectionObserverEntry],
      this as unknown as IntersectionObserver,
    )
  }
}

let container: HTMLDivElement
let root: Root
let origMatchMedia: typeof window.matchMedia | undefined
let origObserver: typeof IntersectionObserver | undefined
let origInnerHeight: number | undefined

function installMatchMedia(matches: boolean): MediaStub {
  const listeners = new Set<ChangeListener>()
  const stub = {
    matches,
    media: '(prefers-reduced-motion: reduce)',
    addEventListener: (_type: string, listener: ChangeListener) => listeners.add(listener),
    removeEventListener: (_type: string, listener: ChangeListener) => listeners.delete(listener),
    addListener: (listener: ChangeListener) => listeners.add(listener),
    removeListener: (listener: ChangeListener) => listeners.delete(listener),
  }
  window.matchMedia = vi.fn().mockReturnValue(stub)
  return {
    get matches() {
      return stub.matches
    },
    setMatches(next: boolean) {
      stub.matches = next
      for (const listener of listeners) listener({ matches: next })
    },
  }
}

function stubTop(top: number) {
  vi.spyOn(HTMLElement.prototype, 'getBoundingClientRect').mockReturnValue({ top } as DOMRect)
}

function figure(): HTMLElement | null {
  return container.querySelector('figure')
}

function replayButton(): HTMLButtonElement | null {
  return container.querySelector('button')
}

function hasArmed(): boolean {
  return figure()?.classList.contains('curve-armed') ?? false
}

function hasPlay(): boolean {
  return figure()?.classList.contains('curve-play') ?? false
}

async function mount() {
  await act(async () => {
    root.render(<Science />)
  })
}

async function clickReplay() {
  await act(async () => {
    replayButton()!.dispatchEvent(new MouseEvent('click', { bubbles: true }))
  })
}

beforeEach(() => {
  Object.assign(globalThis, { IS_REACT_ACT_ENVIRONMENT: true })
  origMatchMedia = window.matchMedia
  origObserver = (globalThis as Record<string, unknown>).IntersectionObserver as
    | typeof IntersectionObserver
    | undefined
  origInnerHeight = window.innerHeight
  Object.defineProperty(window, 'innerHeight', { value: 800, configurable: true })
  ;(globalThis as Record<string, unknown>).IntersectionObserver =
    FakeObserver as unknown as typeof IntersectionObserver
  FakeObserver.instances = []
  container = document.createElement('div')
  document.body.appendChild(container)
  root = createRoot(container)
})

afterEach(async () => {
  await act(async () => root.unmount())
  container.remove()
  vi.restoreAllMocks()
  vi.useRealTimers()
  if (origMatchMedia === undefined) {
    // happy-dom may not ship matchMedia; remove the stub entirely.
    Reflect.deleteProperty(window, 'matchMedia')
  } else {
    window.matchMedia = origMatchMedia
  }
  if (origObserver === undefined) {
    delete (globalThis as Record<string, unknown>).IntersectionObserver
  } else {
    ;(globalThis as Record<string, unknown>).IntersectionObserver = origObserver
  }
  if (origInnerHeight !== undefined) {
    Object.defineProperty(window, 'innerHeight', { value: origInnerHeight, configurable: true })
  }
})

it('prerenders the final static figure with four cites and a described chart', () => {
  const holder = document.createElement('div')
  holder.innerHTML = renderToStaticMarkup(<Science />)
  const staticFigure = holder.querySelector('figure')
  expect(staticFigure).not.toBeNull()
  expect(staticFigure?.classList.contains('curve-armed')).toBe(false)
  expect(staticFigure?.classList.contains('curve-play')).toBe(false)
  expect(holder.querySelector('h2')?.textContent).toBe('Built on how memory works.')
  const cites = [...holder.querySelectorAll('cite')]
  expect(cites).toHaveLength(4)
  expect(holder.querySelector('button')).toBeNull()
  const svg = holder.querySelector('svg[role="img"]')
  expect(svg?.getAttribute('aria-label')).toBe(CHART_LABEL)
  const describedId = svg?.getAttribute('aria-describedby')
  expect(describedId).toBeTruthy()
  const desc = holder.querySelector(`#${describedId}`)
  expect(desc?.tagName.toLowerCase()).toBe('desc')
  const words = (desc?.textContent ?? '').toLowerCase()
  expect(words).toContain('horizontal')
  expect(words).toContain('vertical')
  expect(words).toContain('solid')
  expect(words).toContain('dashed')
})

it('stays static with no Replay and no observer under reduced motion', async () => {
  installMatchMedia(true)
  stubTop(2000)
  await mount()
  expect(figure()).not.toBeNull()
  expect(replayButton()).toBeNull()
  expect(hasArmed()).toBe(false)
  expect(hasPlay()).toBe(false)
  expect(FakeObserver.instances).toHaveLength(0)
})

it('shows Replay and stays static when the figure starts in view', async () => {
  installMatchMedia(false)
  stubTop(100)
  await mount()
  expect(replayButton()?.textContent).toBe('Replay')
  expect(hasArmed()).toBe(false)
  expect(hasPlay()).toBe(false)
  expect(FakeObserver.instances).toHaveLength(0)
})

it('arms below the fold and plays once at half visibility, ignoring the rest', async () => {
  installMatchMedia(false)
  stubTop(2000)
  await mount()
  expect(hasArmed()).toBe(true)
  expect(FakeObserver.instances).toHaveLength(1)
  expect(FakeObserver.instances[0].options).toMatchObject({ threshold: 0.5 })

  await act(async () => {
    FakeObserver.instances[0].trigger({ isIntersecting: true, intersectionRatio: 0.4 })
  })
  expect(hasArmed()).toBe(true)
  expect(hasPlay()).toBe(false)
  expect(FakeObserver.instances[0].disconnect).not.toHaveBeenCalled()

  await act(async () => {
    FakeObserver.instances[0].trigger({ isIntersecting: true, intersectionRatio: 0.5 })
  })
  expect(hasPlay()).toBe(true)
  expect(FakeObserver.instances[0].disconnect).toHaveBeenCalledTimes(1)

  await act(async () => {
    FakeObserver.instances[0].trigger({ isIntersecting: true, intersectionRatio: 1 })
  })
  expect(hasPlay()).toBe(true)
  expect(FakeObserver.instances[0].disconnect).toHaveBeenCalledTimes(1)
})

it('re-arms Replay after 60ms and resets the timer on repeated clicks', async () => {
  vi.useFakeTimers()
  installMatchMedia(false)
  stubTop(100)
  await mount()

  await clickReplay()
  expect(hasArmed()).toBe(true)
  expect(hasPlay()).toBe(false)

  await act(async () => {
    vi.advanceTimersByTime(59)
  })
  expect(hasArmed()).toBe(true)

  await clickReplay()
  await act(async () => {
    vi.advanceTimersByTime(59)
  })
  expect(hasArmed()).toBe(true)
  expect(hasPlay()).toBe(false)

  await act(async () => {
    vi.advanceTimersByTime(1)
  })
  expect(hasPlay()).toBe(true)
})

it('cancels a pending replay and disconnects the observer on unmount', async () => {
  vi.useFakeTimers()
  installMatchMedia(false)
  stubTop(2000)
  await mount()
  expect(figure()).not.toBeNull()
  expect(FakeObserver.instances[0].disconnect).not.toHaveBeenCalled()
  await act(async () => root.unmount())
  expect(FakeObserver.instances[0].disconnect).toHaveBeenCalledTimes(1)

  root = createRoot(container)
  await mount()
  await clickReplay()
  expect(vi.getTimerCount()).toBe(1)
  await act(async () => root.unmount())
  expect(vi.getTimerCount()).toBe(0)
})

it('switching to reduced motion clears the animation and removes Replay', async () => {
  vi.useFakeTimers()
  const preference = installMatchMedia(false)
  stubTop(2000)
  await mount()
  expect(replayButton()).not.toBeNull()

  await clickReplay()
  expect(hasArmed()).toBe(true)
  await act(async () => {
    preference.setMatches(true)
  })
  expect(replayButton()).toBeNull()
  expect(hasArmed()).toBe(false)
  expect(hasPlay()).toBe(false)

  await act(async () => {
    vi.advanceTimersByTime(500)
  })
  expect(hasPlay()).toBe(false)
  expect(replayButton()).toBeNull()
})
