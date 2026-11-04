import { act } from 'react'
import { createRoot } from 'react-dom/client'
import type { Root } from 'react-dom/client'
import { afterEach, beforeEach, expect, it } from 'vitest'
import { signUpUrl } from '../../site-config'
import { demoEmbedUrl, Hero } from './hero'

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

async function renderHero(props: { videoUrl?: string; transcriptUrl?: string; apkUrl?: string } = {}) {
  await act(async () => root.render(<Hero {...props} />))
}

const watchButton = () =>
  [...container.querySelectorAll('button')].find((b) => b.textContent?.includes('Watch the demo')) as HTMLButtonElement
const dialog = () => container.querySelector('dialog') as HTMLDialogElement
const click = (el: Element) => act(async () => el.dispatchEvent(new MouseEvent('click', { bubbles: true })))

it.each([
  'https://www.youtube.com/watch?v=abc123',
  'https://youtu.be/abc123',
])('turns %s into a captioned nocookie embed', (input) => {
  expect(demoEmbedUrl(input)).toBe('https://www.youtube-nocookie.com/embed/abc123?cc_load_policy=1')
})

it('keeps embed params, adds captions, and leaves other URLs alone', () => {
  const embed = new URL(demoEmbedUrl('https://www.youtube.com/embed/abc123?start=5')!)
  expect(embed.host).toBe('www.youtube-nocookie.com')
  expect(embed.pathname).toBe('/embed/abc123')
  expect(embed.searchParams.get('start')).toBe('5')
  expect(embed.searchParams.get('cc_load_policy')).toBe('1')
  for (const same of ['https://www.youtube-nocookie.com/embed/abc123?cc_load_policy=1', 'https://player.vimeo.com/video/42']) {
    expect(demoEmbedUrl(same)).toBe(same)
  }
})

const unsafeUrls = [
  'data:text/html,<script>alert(1)</script>',
  'javascript:alert(1)',
  'vbscript:msgbox(1)',
  'http://example.com/video',
  '/videos/demo.mp4',
  'not a url',
]

it.each(unsafeUrls)('treats %s as no demo video', async (videoUrl) => {
  expect(demoEmbedUrl(videoUrl)).toBeNull()
  await renderHero({ videoUrl })
  expect(watchButton()).toBeUndefined()
  expect(container.querySelector('dialog')).toBeNull()
  expect(container.querySelector('iframe')).toBeNull()
})

it('embeds a non-YouTube https video as given', async () => {
  await renderHero({ videoUrl: 'https://player.vimeo.com/video/42' })
  await click(watchButton())
  expect(container.querySelector('iframe')?.getAttribute('src')).toBe('https://player.vimeo.com/video/42')
})

it.each(unsafeUrls)('renders no transcript link for %s', async (transcriptUrl) => {
  await renderHero({ videoUrl: 'https://youtu.be/abc123', transcriptUrl })
  expect(container.querySelector('dialog p')?.textContent).toBe('Captions on by default.')
  expect(container.querySelector('dialog a')).toBeNull()
})

it('shows only the sign-up link when no demo video is configured', async () => {
  await renderHero({ apkUrl: '' })
  const links = container.querySelectorAll('#lqs-hero-cta a')
  expect(links).toHaveLength(1)
  expect(links[0].textContent).toBe('Create a company account')
  expect(links[0].getAttribute('href')).toBe(signUpUrl)
  expect(watchButton()).toBeUndefined()
  expect(container.querySelector('dialog')).toBeNull()
  expect(container.querySelector('iframe')).toBeNull()
  const section = container.querySelector('section')!
  expect(section.id).toBe('top')
  const heading = document.getElementById(section.getAttribute('aria-labelledby')!)!
  expect(heading.tagName).toBe('H1')
  expect(heading.textContent).toBe('New hires learn the job from your own SOPs.')
  expect(container.querySelector('.hero-phone img')?.getAttribute('alt')).toContain('Where do you move the tote to start the check?')
})

it('opens the demo in a modal dialog and restores focus when it closes', async () => {
  await renderHero({ videoUrl: 'https://youtu.be/abc123' })
  const button = watchButton()
  expect(button.type).toBe('button')
  expect(button.getAttribute('aria-haspopup')).toBe('dialog')
  expect(dialog().hasAttribute('open')).toBe(false)
  expect(container.querySelector('iframe')).toBeNull()

  await click(button)
  expect(dialog().hasAttribute('open')).toBe(true)
  const title = document.getElementById(dialog().getAttribute('aria-labelledby')!)
  expect(title?.textContent).toBe('Learn Quiz demo, 3 minutes')
  const frame = container.querySelector('iframe')!
  const src = new URL(frame.getAttribute('src')!)
  expect(src.host).toBe('www.youtube-nocookie.com')
  expect(src.searchParams.get('cc_load_policy')).toBe('1')
  expect(frame.getAttribute('title')).toBe('Learn Quiz demo, 3 minutes')
  expect(frame.hasAttribute('allowfullscreen')).toBe(true)
  expect(frame.getAttribute('allow')).toBe('encrypted-media; picture-in-picture')
  expect(frame.getAttribute('referrerpolicy')).toBe('strict-origin-when-cross-origin')

  await click(container.querySelector('[aria-label="Close"]')!)
  expect(dialog().hasAttribute('open')).toBe(false)
  expect(container.querySelector('iframe')).toBeNull()
  expect(document.activeElement).toBe(button)

  // Escape closes a modal dialog natively by firing `close`; happy-dom has no Escape handling.
  await click(button)
  expect(container.querySelector('iframe')).not.toBeNull()
  ;(document.activeElement as HTMLElement).blur()
  await act(async () => {
    dialog().removeAttribute('open')
    dialog().dispatchEvent(new Event('close'))
  })
  expect(container.querySelector('iframe')).toBeNull()
  expect(document.activeElement).toBe(button)
})

it('offers a transcript link only when one is configured', async () => {
  await renderHero({ videoUrl: 'https://youtu.be/abc123' })
  const foot = () => container.querySelector('dialog p')!
  expect(foot().textContent).toBe('Captions on by default.')
  expect(foot().querySelector('a')).toBeNull()

  await renderHero({ videoUrl: 'https://youtu.be/abc123', transcriptUrl: 'https://example.com/t' })
  const link = foot().querySelector('a')!
  expect(link.textContent).toBe('Transcript')
  expect(link.getAttribute('href')).toBe('https://example.com/t')
  expect(link.getAttribute('target')).toBe('_blank')
  expect(link.getAttribute('rel')).toBe('noopener noreferrer')
})

const heroActions = () =>
  [...container.querySelectorAll('#lqs-hero-cta > a, #lqs-hero-cta > button')].map((el) => [el.textContent, el.getAttribute('href')])

it('offers the Android app right after the accent action, as a non-accent button, once an APK URL is set', async () => {
  await renderHero({ videoUrl: '', apkUrl: 'https://example.test/learnquiz.apk' })
  expect(heroActions()).toEqual([
    ['Create a company account', signUpUrl],
    ['Get the Android app', 'https://example.test/learnquiz.apk'],
  ])
  const android = [...container.querySelectorAll('#lqs-hero-cta a')].find((a) => a.textContent === 'Get the Android app')!
  expect(android.classList.contains('btn-accent')).toBe(false)
  expect(container.querySelectorAll('.btn-accent')).toHaveLength(1)
})

it('shows no Android button while the APK URL is empty', async () => {
  await renderHero({ videoUrl: '', apkUrl: '' })
  expect(heroActions()).toEqual([['Create a company account', signUpUrl]])
  expect(container.querySelector('a[href=""]')).toBeNull()
})
