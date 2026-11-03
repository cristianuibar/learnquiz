import { act } from 'react'
import { createRoot } from 'react-dom/client'
import type { Root } from 'react-dom/client'
import { createMemoryHistory, createRootRoute, createRoute, createRouter, RouterProvider } from '@tanstack/react-router'
import { afterEach, beforeEach, expect, it } from 'vitest'
import { Route as appRootRoute } from './__root'
import { Route as indexRoute } from './index'
import { Route as privacyRoute } from './privacy'
import { Route as termsRoute } from './terms'

let container: HTMLDivElement
let root: Root

beforeEach(() => {
  Object.assign(globalThis, { IS_REACT_ACT_ENVIRONMENT: true })
  container = document.createElement('div')
  document.body.appendChild(container)
  root = createRoot(container)
})

afterEach(async () => {
  await act(async () => root.unmount())
  container.remove()
})

async function renderPage(path = '/') {
  const layout = createRootRoute({ component: appRootRoute.options.component })
  const routes = [
    createRoute({ getParentRoute: () => layout, path: '/', component: indexRoute.options.component }),
    createRoute({ getParentRoute: () => layout, path: '/privacy', component: privacyRoute.options.component }),
    createRoute({ getParentRoute: () => layout, path: '/terms', component: termsRoute.options.component }),
  ]
  const router = createRouter({
    routeTree: layout.addChildren(routes),
    history: createMemoryHistory({ initialEntries: [path] }),
  })
  await act(async () => {
    await router.load()
    root.render(<RouterProvider router={router} />)
  })
}

it('offers company signup as the only accent-filled action', async () => {
  await renderPage()
  const accent = container.querySelectorAll('.bg-accent')
  expect(accent).toHaveLength(1)
  expect(accent[0].tagName).toBe('A')
  expect(accent[0].textContent).toBe('Create a company account')
  expect(accent[0].getAttribute('href')).toBe('https://app.learnquiz.com/sign-in?mode=up&redirect=%2Forg%2Fnew')
  expect(accent[0].closest('section')?.querySelector('h1')?.textContent).toBe('Train every new hire on your own procedures.')
  expect(container.querySelector('main')?.textContent).toContain("Upload your SOPs. Each employee gets five-minute quiz sessions and one question during the shift, in your company's words, until they know the job.")
})

it('presents the company-first sections with one main landmark and an accessible skip target', async () => {
  await renderPage()
  expect(container.querySelectorAll('main')).toHaveLength(1)
  expect(container.querySelectorAll('h1')).toHaveLength(1)
  expect(container.querySelector('header')?.parentElement).toBe(container.querySelector('main')?.parentElement)
  expect(container.querySelector('header')?.textContent).toContain('Learn Quiz')
  expect(container.querySelector('a[href="#main"]')?.textContent).toBe('Skip to content')
  expect(container.querySelector('#main')?.getAttribute('tabindex')).toBe('-1')
  expect([...container.querySelectorAll('main > section h2')].map((heading) => heading.textContent)).toEqual([
    'How it works',
    'Answers from your documents',
    'One question during the shift',
    'Confidence counts',
    'Progress managers can read',
    'Privacy and fairness',
    'Built on Meta models',
    'Open source',
    'Quiz it, until you learn it.',
  ])
  expect(container.querySelectorAll('ol li h3')).toHaveLength(3)
  expect(container.textContent?.match(/Quiz it, until you learn it\./g)).toHaveLength(1)
  for (const section of container.querySelectorAll('main > section')) {
    const label = section.getAttribute('aria-labelledby')
    expect(section.querySelector(`[id="${label}"]`)?.textContent).toBeTruthy()
  }
})

it('shows all five product screens with descriptions, reserved dimensions and lazy loading below the hero', async () => {
  await renderPage()
  const images = [...container.querySelectorAll('main img')]
  expect(images.map((image) => image.getAttribute('src'))).toEqual([
    '/screens/Today.png', '/screens/Reveal.png', '/screens/PushLock.png', '/screens/QChoice.png', '/screens/Profile.png',
  ])
  for (const image of images) {
    expect(image.getAttribute('width')).toBe('360')
    expect(image.getAttribute('height')).toBe('740')
    expect(image.getAttribute('alt')?.length).toBeGreaterThan(30)
  }
  expect(images[0].getAttribute('loading')).not.toBe('lazy')
  expect(images[0].getAttribute('fetchpriority')).toBe('high')
  expect(images.slice(1).every((image) => image.getAttribute('loading') === 'lazy')).toBe(true)
})

it('links secondary actions and legal notices to their specified destinations', async () => {
  await renderPage()
  const signInLinks = [...container.querySelectorAll('a')].filter((link) => link.textContent === 'Sign in')
  expect(signInLinks).toHaveLength(3)
  expect(signInLinks.every((link) => link.getAttribute('href') === 'https://app.learnquiz.com/sign-in')).toBe(true)
  expect(container.querySelector('a[href="https://app.learnquiz.com/start"]')?.textContent).toBe('Learn on your own')
  expect(container.querySelector('a[href="https://github.com/cristianuibar/learnquiz"]')?.textContent).toBe('View the code')
  expect(container.querySelector('main a[href="/privacy"]')?.textContent).toBe('Read the privacy notice')
  expect([...container.querySelectorAll('footer a')].map((link) => [link.textContent, link.getAttribute('href')])).toEqual([
    ['Privacy', '/privacy'], ['Terms', '/terms'], ['GitHub', 'https://github.com/cristianuibar/learnquiz'],
  ])
})

it.each([['/privacy', 'Privacy'], ['/terms', 'Terms']])('preserves the existing notice at %s', async (path, title) => {
  await renderPage(path)
  expect(container.querySelectorAll('main')).toHaveLength(1)
  expect(container.querySelector('h1')?.textContent).toBe(title)
  expect(container.querySelector('main')?.textContent).toContain('Draft notice. This page is not yet the final policy.')
  expect(container.querySelector('footer a[href="/"]')?.textContent).toBe('Learn Quiz')
})
