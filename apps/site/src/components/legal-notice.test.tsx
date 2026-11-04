import { renderToStaticMarkup } from 'react-dom/server'
import { expect, it } from 'vitest'
import { withPlaceholders } from './legal-notice'

function render(value: string) {
  const host = document.createElement('p')
  host.innerHTML = renderToStaticMarkup(<>{withPlaceholders(value)}</>)
  return host
}

it('turns bracket and brace placeholders into chips and keeps their text unchanged', () => {
  const host = render('Run by [LEGAL ENTITY], {CITY}. Write to us.')
  const chips = [...host.querySelectorAll('span.ph')].map((chip) => chip.textContent)
  expect(chips).toEqual(['[LEGAL ENTITY]', '{CITY}'])
  expect(host.textContent).toBe('Run by [LEGAL ENTITY], {CITY}. Write to us.')
})

it('leaves text without placeholders as plain text', () => {
  const host = render('Your training and development.')
  expect(host.querySelector('.ph')).toBeNull()
  expect(host.textContent).toBe('Your training and development.')
})
