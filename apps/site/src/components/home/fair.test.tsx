import { renderToStaticMarkup } from 'react-dom/server'
import { expect, it } from 'vitest'
import { Fair } from './fair'

function render() {
  const container = document.createElement('div')
  container.innerHTML = renderToStaticMarkup(<Fair />)
  document.body.replaceChildren(container)
  return container
}

it('is a section labelled by its heading', () => {
  const container = render()
  const section = container.querySelector('section')!
  const heading = document.getElementById(section.getAttribute('aria-labelledby')!)!
  expect(heading.tagName).toBe('H2')
  expect(heading.textContent).toBe('What Learn Quiz records, and what it never does.')
})

it('pairs each recorded fact with its explanation in a definition list', () => {
  const container = render()
  const rows = [...container.querySelectorAll('dl > div')].map((row) => [
    row.querySelector(':scope > dt')?.textContent,
    row.querySelector(':scope > dd')?.textContent,
  ])
  expect(rows).toEqual([
    ['Recorded', 'Answers, how sure you were, how long each took, and progress toward the benchmark.'],
    ['Who sees it', 'You, and your company’s Learn Quiz admins, such as your manager or training lead.'],
    ['What it’s for', 'Training and development: what to review next, and when you’ve reached the role’s benchmark.'],
  ])
})

it('lists what is never recorded under its own heading, with decorative icons', () => {
  const container = render()
  const heading = [...container.querySelectorAll('h3')].find((h) => h.textContent === 'Never')!
  expect(heading).toBeDefined()
  const items = [...heading.parentElement!.querySelectorAll('ul > li')]
  expect(items.map((li) => li.textContent)).toEqual([
    'No camera, sensors or health data.',
    'No personality scores.',
    'No ranking against coworkers.',
  ])
  for (const li of items) expect(li.querySelector('svg')?.getAttribute('aria-hidden')).toBe('true')
  expect(container.textContent).toContain('No biometrics, no hidden tests. A person decides.')
})
