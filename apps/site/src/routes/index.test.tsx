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

it('keeps accessible page landmarks and labelled sections', async () => {
  await renderPage()
  const main = container.querySelector('main')!
  expect(container.querySelectorAll('main')).toHaveLength(1)
  expect(container.querySelectorAll('h1')).toHaveLength(1)
  expect(container.querySelector('a[href="#main"]')).not.toBeNull()
  expect(main.id).toBe('main')
  expect(main.getAttribute('tabindex')).toBe('-1')
  for (const landmark of ['header', 'footer']) {
    const element = container.querySelector(landmark)!
    expect(element).not.toBeNull()
    expect(main.contains(element)).toBe(false)
    expect(element.parentElement).toBe(main.parentElement)
  }
  const sections = [...main.querySelectorAll(':scope > section')]
  expect(sections.length).toBeGreaterThan(0)
  for (const section of sections) {
    const label = section.getAttribute('aria-labelledby')
    expect(label).toBeTruthy()
    expect(document.getElementById(label!)?.textContent?.trim()).toBeTruthy()
  }
})

it.each([['/privacy', 'Privacy'], ['/terms', 'Terms']])('renders the notice at %s with links home', async (path, title) => {
  await renderPage(path)
  expect(container.querySelectorAll('main')).toHaveLength(1)
  expect(container.querySelector('h1')?.textContent).toBe(title)
  for (const landmark of ['header', 'footer']) {
    expect(container.querySelector(`${landmark} a[aria-label="Learn Quiz home"]`)?.getAttribute('href')).toBe('/')
  }
})
