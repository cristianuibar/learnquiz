import { act } from 'react'
import { createRoot } from 'react-dom/client'
import type { Root } from 'react-dom/client'
import {
  HeadContent,
  Outlet,
  createMemoryHistory,
  createRootRoute,
  createRoute,
  createRouter,
  RouterProvider,
} from '@tanstack/react-router'
import type { AnyRoute } from '@tanstack/react-router'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { Route as appRootRoute } from './__root'
import { Route as indexRoute } from './index'
import { Route as privacyRoute } from './privacy'
import { Route as termsRoute } from './terms'

const HOME_TITLE = 'Learn Quiz: onboarding from your own SOPs'
const DESCRIPTION =
  'Upload a role’s SOPs. New hires practice them on their phone in five-minute sessions until they reach your benchmark. Every explanation quotes your document.'
const OG_IMAGE = 'https://learnquiz.com/og.png'

function TestShell() {
  return (
    <>
      <HeadContent />
      <Outlet />
    </>
  )
}

// The isolated test tree replaces the generated routes' parents and route IDs.
function routeHead(route: AnyRoute) {
  return route.options.head
}

function createTestRouter(initialPath: string) {
  const layout = createRootRoute({
    head: routeHead(appRootRoute),
    component: TestShell,
  })
  const routes = [
    createRoute({
      getParentRoute: () => layout,
      path: '/',
      head: routeHead(indexRoute),
      component: indexRoute.options.component,
    }),
    createRoute({
      getParentRoute: () => layout,
      path: '/privacy',
      head: routeHead(privacyRoute),
      component: privacyRoute.options.component,
    }),
    createRoute({
      getParentRoute: () => layout,
      path: '/terms',
      head: routeHead(termsRoute),
      component: termsRoute.options.component,
    }),
  ]
  return createRouter({
    routeTree: layout.addChildren(routes),
    history: createMemoryHistory({ initialEntries: [initialPath] }),
  })
}

let container: HTMLDivElement
let root: Root
let initialHeadHtml: string

beforeEach(() => {
  Object.assign(globalThis, { IS_REACT_ACT_ENVIRONMENT: true })
  // React 19 hoists rendered title/meta/link tags into document.head.
  initialHeadHtml = document.head.innerHTML
  container = document.createElement('div')
  document.body.appendChild(container)
  root = createRoot(container)
})

afterEach(async () => {
  await act(async () => root.unmount())
  container.remove()
  document.head.innerHTML = initialHeadHtml
})

async function renderAt(path: string) {
  const router = createTestRouter(path)
  await act(async () => {
    await router.load()
    root.render(<RouterProvider router={router} />)
  })
  return router
}

function title() {
  return document.head.querySelector('title')?.textContent
}

function metaContent(selector: string): string | null {
  return document.head.querySelector(selector)?.getAttribute('content') ?? null
}

function themeColorMetas() {
  return [...document.head.querySelectorAll('meta')].filter(
    (m) => (m.getAttribute('name') ?? '').toLowerCase() === 'theme-color',
  )
}

function expectCanonical(expected: string) {
  const canonicals = document.head.querySelectorAll('link[rel="canonical"]')
  expect(canonicals).toHaveLength(1)
  expect(canonicals[0].getAttribute('href')).toBe(expected)
}

function expectSharedHead(expectedUrl: string) {
  expect(metaContent('meta[name="description"]')).toBe(DESCRIPTION)
  expect(metaContent('meta[property="og:type"]')).toBe('website')
  expect(metaContent('meta[property="og:site_name"]')).toBe('Learn Quiz')
  expect(metaContent('meta[property="og:title"]')).toBe(HOME_TITLE)
  expect(metaContent('meta[property="og:description"]')).toBe(DESCRIPTION)
  expect(metaContent('meta[property="og:url"]')).toBe(expectedUrl)
  expect(metaContent('meta[property="og:image"]')).toBe(OG_IMAGE)
  expect(metaContent('meta[property="og:image"]')).toMatch(/^https:\/\//)
  expect(metaContent('meta[property="og:image:type"]')).toBe('image/png')
  expect(metaContent('meta[property="og:image:width"]')).toBe('1200')
  expect(metaContent('meta[property="og:image:height"]')).toBe('630')
  const imageAlt = metaContent('meta[property="og:image:alt"]')
  expect(imageAlt).toContain('New hires learn the job from your own SOPs.')
  expect(imageAlt).toContain('phone')
  expect(imageAlt).toContain('scanner question')
  expect(imageAlt).toContain('Stop the pick')
  expect(metaContent('meta[name="twitter:card"]')).toBe('summary_large_image')
  expect(metaContent('meta[name="twitter:title"]')).toBe(HOME_TITLE)
  expect(metaContent('meta[name="twitter:description"]')).toBe(DESCRIPTION)
  expect(metaContent('meta[name="twitter:image"]')).toBe(OG_IMAGE)
  expect(metaContent('meta[name="twitter:image:alt"]')).toBe(imageAlt)
}

function expectIconsAndTheme() {
  const icons = document.head.querySelectorAll('link[rel="icon"]')
  expect(icons).toHaveLength(2)
  expect(
    document.head.querySelector('link[rel="icon"][type="image/svg+xml"]')?.getAttribute('href'),
  ).toBe('/favicon.svg')
  const png = document.head.querySelector('link[rel="icon"][type="image/png"]')
  expect(png?.getAttribute('href')).toBe('/favicon-32.png')
  expect(png?.getAttribute('sizes')).toBe('32x32')
  expect(
    document.head.querySelector('link[rel="apple-touch-icon"]')?.getAttribute('href'),
  ).toBe('/apple-touch-icon.png')

  const theme = themeColorMetas()
  expect(theme).toHaveLength(2)
  const byMedia = new Map(theme.map((m) => [m.getAttribute('media'), m.getAttribute('content')]))
  expect(byMedia.get('(prefers-color-scheme: light)')).toBe('#F7F6F2')
  expect(byMedia.get('(prefers-color-scheme: dark)')).toBe('#121417')
}

describe('route head', () => {
  it('renders full head for /', async () => {
    await renderAt('/')
    expect(title()).toBe(HOME_TITLE)
    expectSharedHead('https://learnquiz.com/')
    expectCanonical('https://learnquiz.com/')
    expectIconsAndTheme()
  })

  it.each(['/privacy', '/privacy/'])('renders legal title with shared social tags and /privacy/ canonical at %s', async (path) => {
    await renderAt(path)
    expect(title()).toBe('Privacy — Learn Quiz')
    expectSharedHead('https://learnquiz.com/privacy/')
    expectCanonical('https://learnquiz.com/privacy/')
    expectIconsAndTheme()
  })

  it.each(['/terms', '/terms/'])('renders legal title with shared social tags and /terms/ canonical at %s', async (path) => {
    await renderAt(path)
    expect(title()).toBe('Terms — Learn Quiz')
    expectSharedHead('https://learnquiz.com/terms/')
    expectCanonical('https://learnquiz.com/terms/')
    expectIconsAndTheme()
  })

  it('updates canonical, og:url and title on / -> /privacy -> /terms -> / navigation', async () => {
    const router = await renderAt('/')
    expectCanonical('https://learnquiz.com/')
    expect(title()).toBe(HOME_TITLE)

    await act(async () => {
      await router.navigate({ to: '/privacy' })
    })
    expect(title()).toBe('Privacy — Learn Quiz')
    expectCanonical('https://learnquiz.com/privacy/')
    expect(metaContent('meta[property="og:url"]')).toBe('https://learnquiz.com/privacy/')

    await act(async () => {
      await router.navigate({ to: '/terms' })
    })
    expect(title()).toBe('Terms — Learn Quiz')
    expectCanonical('https://learnquiz.com/terms/')
    expect(metaContent('meta[property="og:url"]')).toBe('https://learnquiz.com/terms/')

    await act(async () => {
      await router.navigate({ to: '/' })
    })
    expect(title()).toBe(HOME_TITLE)
    expectCanonical('https://learnquiz.com/')
    expect(metaContent('meta[property="og:url"]')).toBe('https://learnquiz.com/')
  })
})
