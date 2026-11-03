import { act } from 'react'
import { createRoot } from 'react-dom/client'
import type { Root } from 'react-dom/client'
import { renderToString } from 'react-dom/server'
import { createMemoryHistory, createRootRoute, createRoute, createRouter, RouterProvider } from '@tanstack/react-router'
import { afterEach, beforeEach, expect, it, vi } from 'vitest'
import { githubUrl, signInUrl, signUpUrl } from '../site-config'
import { themeStorageKey } from '../theme'
import { SiteFooter } from './site-footer'
import { SiteHeader } from './site-header'

let container: HTMLDivElement
let root: Root
let media: MediaQueryList
let observers: Observer[]

class Observer {
  callback: IntersectionObserverCallback
  options?: IntersectionObserverInit
  targets: Element[] = []
  disconnect = vi.fn()

  constructor(callback: IntersectionObserverCallback, options?: IntersectionObserverInit) {
    this.callback = callback
    this.options = options
    observers.push(this)
  }

  observe(target: Element) {
    this.targets.push(target)
  }

  async report(visibility: Record<string, boolean>) {
    await act(async () => {
      this.callback(Object.entries(visibility).map(([id, isIntersecting]) => ({
        target: document.getElementById(id)!, isIntersecting,
      })) as unknown as IntersectionObserverEntry[], this as unknown as IntersectionObserver)
    })
  }
}

beforeEach(() => {
  Object.assign(globalThis, { IS_REACT_ACT_ENVIRONMENT: true })
  localStorage.clear()
  document.documentElement.removeAttribute('data-theme')
  observers = []
  media = Object.assign(new EventTarget(), {
    matches: false, media: '(min-width: 640px)', onchange: null,
  }) as unknown as MediaQueryList
  vi.stubGlobal('matchMedia', vi.fn(() => media))
  vi.stubGlobal('IntersectionObserver', Observer)
  container = document.createElement('div')
  document.body.appendChild(container)
  root = createRoot(container)
})

afterEach(async () => {
  await act(async () => root.unmount())
  container.remove()
  localStorage.clear()
  document.documentElement.removeAttribute('data-theme')
  vi.unstubAllGlobals()
})

async function renderChrome({
  path = '/', variant = 'home', hero = true, close = true,
}: { path?: string; variant?: 'home' | 'legal'; hero?: boolean; close?: boolean } = {}) {
  const layout = createRootRoute({ component: () => (
    <>
      <SiteHeader variant={variant} />
      <main id="main" tabIndex={-1}>
        {hero && <div id="lqs-hero-cta">Hero actions</div>}
        {close && <div id="lqs-close-cta">Close actions</div>}
      </main>
      <SiteFooter variant={variant} />
    </>
  ) })
  const page = createRoute({ getParentRoute: () => layout, path, component: () => null })
  const router = createRouter({
    routeTree: layout.addChildren([page]),
    history: createMemoryHistory({ initialEntries: [path] }),
  })
  await act(async () => {
    await router.load()
    root.render(<RouterProvider router={router} />)
  })
  return router
}

function menuButton() {
  const button = container.querySelector<HTMLButtonElement>('button[aria-label="Menu"]')
  expect(button).not.toBeNull()
  return button!
}

function signup() {
  const link = container.querySelector<HTMLAnchorElement>('header a[href="' + signUpUrl + '"]')
  expect(link).not.toBeNull()
  return link!
}

it.each(['button', 'menu'])('opens the labelled menu and restores focus on Escape from the %s', async (from) => {
  await renderChrome()
  const button = menuButton()
  expect(button.getAttribute('aria-expanded')).toBe('false')
  expect(container.querySelector('nav[aria-label="Site menu"]')).toBeNull()
  await act(async () => button.click())
  const menu = container.querySelector<HTMLElement>('nav[aria-label="Site menu"]')!
  expect(menu.id).toBe(button.getAttribute('aria-controls'))
  expect(button.getAttribute('aria-expanded')).toBe('true')
  expect([...menu.querySelectorAll('a')].map((a) => [a.textContent, a.href])).toEqual([
    ['Sign in', signInUrl], ['GitHub', githubUrl],
  ])
  const target = from === 'button' ? button : menu.querySelector('a')!
  target.focus()
  await act(async () => {
    target.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true }))
  })
  expect(container.querySelector('nav[aria-label="Site menu"]')).toBeNull()
  expect(button.getAttribute('aria-expanded')).toBe('false')
  expect(document.activeElement).toBe(button)
})

it('collapses the mobile menu when the viewport reaches the desktop breakpoint', async () => {
  await renderChrome()
  const button = menuButton()
  await act(async () => button.click())
  expect(button.getAttribute('aria-expanded')).toBe('true')
  await act(async () => {
    Object.assign(media, { matches: true })
    media.dispatchEvent(Object.assign(new Event('change'), { matches: true }))
  })
  expect(button.getAttribute('aria-expanded')).toBe('false')
  expect(container.querySelector('nav[aria-label="Site menu"]')).toBeNull()
})

it('places the skip link first and transfers focus to the main landmark', async () => {
  await renderChrome()
  const skip = container.querySelector<HTMLAnchorElement>('a')!
  expect(skip.textContent?.trim()).toBe('Skip to content')
  expect(skip.getAttribute('href')).toBe('#main')
  skip.focus()
  await act(async () => skip.click())
  expect(document.activeElement).toBe(container.querySelector('main'))
  expect(container.querySelector('header a[aria-label="Learn Quiz home"]')?.getAttribute('href')).toBe('#top')
})

it('keeps the header action quiet until both actions leave, including separate observer batches', async () => {
  await renderChrome()
  const action = signup()
  expect(action.classList.contains('btn-secondary')).toBe(true)
  expect(observers).toHaveLength(1)
  const observer = observers[0]!
  expect(observer.options?.rootMargin).toBe('-64px 0px 0px 0px')
  expect(observer.targets.map((target) => target.id)).toEqual(['lqs-hero-cta', 'lqs-close-cta'])
  await observer.report({ 'lqs-hero-cta': false })
  expect(action.classList.contains('btn-secondary')).toBe(true)
  await observer.report({ 'lqs-close-cta': false })
  expect(action.classList.contains('btn-accent')).toBe(true)
  await observer.report({ 'lqs-close-cta': true })
  await observer.report({ 'lqs-hero-cta': false })
  expect(action.classList.contains('btn-secondary')).toBe(true)
  await observer.report({ 'lqs-close-cta': false })
  expect(action.classList.contains('btn-accent')).toBe(true)
  await act(async () => root.unmount())
  expect(observer.disconnect).toHaveBeenCalledOnce()
  root = createRoot(container)
})

it.each(['observer', 'hero', 'close'])('keeps the action quiet when the %s is unavailable', async (missing) => {
  if (missing === 'observer') vi.stubGlobal('IntersectionObserver', undefined)
  await renderChrome({ hero: missing !== 'hero', close: missing !== 'close' })
  expect(signup().classList.contains('btn-secondary')).toBe(true)
  expect(observers).toHaveLength(0)
})

it('server-renders the header action quietly', () => {
  const html = document.createElement('div')
  html.innerHTML = renderToString(<SiteHeader />)
  const action = html.querySelector('a[href="' + signUpUrl + '"]')!
  expect(action).not.toBeNull()
  expect(action.classList.contains('btn-secondary')).toBe(true)
  expect(html.querySelector('button[aria-label="Menu"]')?.getAttribute('aria-expanded')).toBe('false')
  expect(observers).toHaveLength(0)
})

it('reads the stored theme and applies exclusive Light, Dark and System choices', async () => {
  localStorage.setItem(themeStorageKey, 'dark')
  await renderChrome()
  const group = container.querySelector('[role="group"][aria-label="Theme"]')!
  expect(group).not.toBeNull()
  const buttons = [...group.querySelectorAll<HTMLButtonElement>('button')]
  const selected = () => buttons.filter((button) => button.getAttribute('aria-pressed') === 'true').map((button) => button.textContent)
  expect(selected()).toEqual(['Dark'])
  for (const [label, value] of [['Light', 'light'], ['Dark', 'dark'], ['System', null]] as const) {
    const button = buttons.find((item) => item.textContent === label)!
    expect(button.type).toBe('button')
    button.focus()
    await act(async () => button.click())
    expect(selected()).toEqual([label])
    expect(localStorage.getItem(themeStorageKey)).toBe(value)
    expect(document.documentElement.getAttribute('data-theme')).toBe(value)
    expect(document.activeElement).toBe(button)
  }
})

it('server-renders System pressed before reading a stored theme after mount', async () => {
  localStorage.setItem(themeStorageKey, 'dark')
  const router = await renderChrome()
  const html = document.createElement('div')
  html.innerHTML = renderToString(<RouterProvider router={router} />)
  const selected = html.querySelectorAll('[role="group"][aria-label="Theme"] button[aria-pressed="true"]')
  expect(selected).toHaveLength(1)
  expect(selected[0]?.textContent).toBe('System')
})

it.each(['/privacy', '/terms'])('renders the reduced legal chrome and marks the current %s link', async (path) => {
  await renderChrome({ path, variant: 'legal' })
  const header = container.querySelector('header')!
  expect(header.querySelector('a[aria-label="Learn Quiz home"]')?.getAttribute('href')).toBe('/')
  expect(header.querySelectorAll('button')).toHaveLength(0)
  expect(header.querySelector('a[href="' + signUpUrl + '"]')).toBeNull()
  expect([...header.querySelectorAll('nav[aria-label="Site"] a')].map((a) => a.textContent?.trim())).toEqual(['GitHub', 'Sign in'])
  expect(observers).toHaveLength(0)
  const footer = container.querySelector('footer')!
  expect(footer.querySelector('a[aria-label="Learn Quiz home"]')?.getAttribute('href')).toBe('/')
  expect(footer.querySelector('[role="group"][aria-label="Theme"]')).toBeNull()
  expect([...footer.querySelectorAll('nav[aria-label="Footer"] a')].map((a) => a.textContent?.trim())).toEqual(['Privacy', 'Terms', 'GitHub', 'Sign in'])
  const current = footer.querySelectorAll('a[aria-current="page"]')
  expect(current).toHaveLength(1)
  expect(current[0]?.getAttribute('href')).toBe(path)
})
