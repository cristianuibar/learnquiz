import { renderToStaticMarkup } from 'react-dom/server'
import type { ReactElement } from 'react'
import { expect, it } from 'vitest'
import { learnOnYourOwnUrl, signUpUrl } from '../../site-config'
import { Close } from './close'

function render(element: ReactElement) {
  const container = document.createElement('div')
  container.innerHTML = renderToStaticMarkup(element)
  document.body.replaceChildren(container)
  return container
}

function actions(container: Element) {
  return [...container.querySelectorAll('#lqs-close-cta a')].map((a) => [a.textContent, a.getAttribute('href')])
}

it('closes with a labelled call to sign up or learn alone, and no Android button while the APK URL is empty', () => {
  const container = render(<Close apkUrl="" />)
  const section = container.querySelector('section')!
  const heading = document.getElementById(section.getAttribute('aria-labelledby')!)!
  expect(heading.tagName).toBe('H2')
  expect(heading.textContent).toBe('Quiz it, until you learn it.')
  expect(actions(container)).toEqual([
    ['Create a company account', signUpUrl],
    ['Learn on your own', learnOnYourOwnUrl],
  ])
  expect(container.querySelector('a[href=""]')).toBeNull()
  const accent = container.querySelectorAll('.btn-accent')
  expect(accent).toHaveLength(1)
  expect(accent[0].textContent).toBe('Create a company account')
})

it('adds a non-accent Android button after the others once an APK URL is set', () => {
  const container = render(<Close apkUrl="https://example.test/learnquiz.apk" />)
  expect(actions(container)).toEqual([
    ['Create a company account', signUpUrl],
    ['Learn on your own', learnOnYourOwnUrl],
    ['Get the Android app', 'https://example.test/learnquiz.apk'],
  ])
  const android = container.querySelector('#lqs-close-cta a:last-child')!
  expect(android.classList.contains('btn-accent')).toBe(false)
  expect(container.querySelectorAll('.btn-accent')).toHaveLength(1)
})
