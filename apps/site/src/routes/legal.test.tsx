import { renderToString } from 'react-dom/server'
import { createMemoryHistory, createRootRoute, createRoute, createRouter, RouterProvider } from '@tanstack/react-router'
import { expect, it } from 'vitest'
import { signUpUrl } from '../site-config'
import { Route as appRootRoute } from './__root'
import { Route as indexRoute } from './index'
import { Route as privacyRoute } from './privacy'
import { Route as termsRoute } from './terms'

const CONTROLLER = 'LearnQuiz is run by its founder as a sole proprietor, based in Timișoara, Romania. It is not yet a registered company.'
const SUPPORT = 'hello@learnquiz.com'
const AGE = 'LearnQuiz is for adults at work and is not meant for anyone under 16.'

// Server-render the route as the prerenderer does, then read it back as a document.
async function prerender(path: string) {
  const layout = createRootRoute({ component: appRootRoute.options.component })
  const routes = [
    createRoute({ getParentRoute: () => layout, path: '/', component: indexRoute.options.component }),
    createRoute({ getParentRoute: () => layout, path: '/privacy', component: privacyRoute.options.component }),
    createRoute({ getParentRoute: () => layout, path: '/terms', component: termsRoute.options.component }),
  ]
  const router = createRouter({
    routeTree: layout.addChildren(routes),
    history: createMemoryHistory({ initialEntries: [path] }),
    isServer: true,
  })
  await router.load()
  const page = document.createElement('div')
  page.innerHTML = renderToString(<RouterProvider router={router} />)
  return page
}

const text = (element: Element | null | undefined) => element?.textContent?.replace(/\s+/g, ' ').trim() ?? ''

it.each([
  ['/privacy', 'Privacy'],
  ['/terms', 'Terms'],
])('%s names the controller, the support address and who may use the app', async (path) => {
  const page = await prerender(path)
  const main = page.querySelector('main')!
  const paragraphs = [...main.querySelectorAll('p, li')].map(text)
  expect(paragraphs).toContain(CONTROLLER)
  expect(paragraphs).toContain(AGE)
  expect(paragraphs.some((line) => line.includes(SUPPORT))).toBe(true)
})

it('keeps the privacy notice’s draft sections and drops the draft disclaimer', async () => {
  const main = (await prerender('/privacy')).querySelector('main')!
  const body = text(main)
  for (const line of [
    'Your answers, how sure you were, how long each answer took, and your progress.',
    'What you type in a reflection or a report note is stored with the attempt.',
    "You and your company's admins.",
    'Your training and development.',
    'The app does not read your camera, your sensors or your health data. Voice recordings are not stored.',
    'Cloudflare hosts the app. Meta models write questions, grade written answers and transcribe voice answers when you choose to use voice.',
  ]) expect(body).toContain(line)
  expect(body).not.toContain('Draft notice')
})

it('gives the terms their own text instead of repeating the privacy notice', async () => {
  const main = (await prerender('/terms')).querySelector('main')!
  const headings = [...main.querySelectorAll('h2')].map(text)
  expect(headings).not.toContain('What the app records')
  const body = text(main)
  expect(body).toContain('A person makes every decision.')
  expect(body).toContain('as is during the pilot')
  expect(body).toMatch(/deleted[^.]*hello@learnquiz\.com/)
})

it.each([
  ['/privacy', 'Privacy'],
  ['/terms', 'Terms'],
])('%s renders the legal layout', async (path, title) => {
  const page = await prerender(path)

  const skip = page.querySelector('a')!
  expect(text(skip)).toBe('Skip to content')
  expect(skip.getAttribute('href')).toBe('#main')
  expect(page.querySelectorAll('main')).toHaveLength(1)
  const main = page.querySelector('main#main')!
  expect(main).not.toBeNull()

  const header = page.querySelector('header')!
  expect(main.contains(header)).toBe(false)
  expect(header.querySelectorAll('button')).toHaveLength(0)
  expect(header.querySelector(`a[href="${signUpUrl}"]`)).toBeNull()

  const article = main.querySelector('article[aria-labelledby]')!
  expect(article).not.toBeNull()
  const h1s = page.querySelectorAll('h1')
  expect(h1s).toHaveLength(1)
  expect(h1s[0]!.id).toBe(article.getAttribute('aria-labelledby'))
  expect(article.contains(h1s[0]!)).toBe(true)
  expect(text(h1s[0])).toBe(title)

  const sections = [...article.querySelectorAll('section')]
  expect(sections.length).toBeGreaterThan(3)
  for (const section of sections) {
    const h2 = section.querySelector('h2')!
    expect(h2).not.toBeNull()
    expect(h2.id).toBeTruthy()
    expect(section.getAttribute('aria-labelledby')).toBe(h2.id)
    expect(text(h2)).toBeTruthy()
    expect(section.querySelectorAll('p, li').length).toBeGreaterThan(0)
  }

  // Neither page has a date yet, so no "Last updated" line, empty or invented.
  expect(text(article)).not.toMatch(/last updated/i)

  const footer = page.querySelector('footer')!
  expect(main.contains(footer)).toBe(false)
  expect(footer.querySelector('[role="group"][aria-label="Theme"]')).toBeNull()
  const current = [...footer.querySelectorAll('a[aria-current="page"]')]
  expect(current.map((a) => a.getAttribute('href'))).toEqual([path])
})

it('renders the home page with its own chrome only once', async () => {
  const page = await prerender('/')
  expect(page.querySelectorAll('header')).toHaveLength(1)
  expect(page.querySelectorAll('footer')).toHaveLength(1)
  expect(page.querySelectorAll('main')).toHaveLength(1)
})
