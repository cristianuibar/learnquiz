import { renderToStaticMarkup } from 'react-dom/server'
import { expect, it } from 'vitest'
import { HowItWorks } from './how-it-works'
import { Problem } from './problem'

function renderSections() {
  const container = document.createElement('main')
  container.innerHTML = renderToStaticMarkup(<><Problem /><HowItWorks /></>)
  return container
}

it('labels the problem region and attributes its blockquote in a figure caption', () => {
  const container = renderSections()
  const heading = [...container.querySelectorAll('h2')].find((element) =>
    element.textContent === 'Your best people teach the same things to every new hire.',
  )!
  expect(heading).toBeDefined()
  const section = heading.closest('section')!
  expect(section.getAttribute('aria-labelledby')).toBe(heading.id)
  const quote = section.querySelector('figure > blockquote')!
  expect(quote).not.toBeNull()
  expect(quote.textContent).toBe('You can control what you tell people, but not what they understand.')
  expect(quote.parentElement?.querySelector('figcaption')?.textContent).toContain('Cristian, founder of Learn Quiz')
})

it('presents the training process as three ordered steps with level-three headings', () => {
  const container = renderSections()
  const heading = [...container.querySelectorAll('h2')].find((element) =>
    element.textContent === 'Your SOPs become the training.',
  )!
  expect(heading).toBeDefined()
  const section = heading.closest('section')!
  expect(section.getAttribute('aria-labelledby')).toBe(heading.id)
  const steps = [...section.querySelectorAll('ol > li')]
  expect(steps).toHaveLength(3)
  expect(steps.map((step) => step.querySelector('h3')?.textContent)).toEqual([
    'Upload the role’s SOPs',
    'Learn Quiz builds the curriculum and questions',
    'New hires practice until they reach the benchmark',
  ])
  for (const [index, step] of steps.entries()) {
    expect(step.querySelector('[aria-hidden="true"]')?.textContent).toBe(String(index + 1))
    expect(step.querySelector('p')?.textContent).toBeTruthy()
  }
})

it('shows the SOP becoming a source-backed question with static, non-focusable options', () => {
  const container = renderSections()
  const section = container.querySelectorAll('section')[1]!
  const illustration = section?.querySelector('figure')!
  expect(illustration).toBeTruthy()
  expect(illustration.querySelector('strong')?.textContent).toBe('Critical: resolve a scan mismatch.')
  expect(illustration.textContent).toContain('becomes')
  expect(illustration.textContent).toContain('The explanation quotes Warehouse picker SOPs v3 · §3.4')
  const options = [...illustration.querySelectorAll('ul > li')]
  expect(options).toHaveLength(4)
  for (const option of options) {
    expect(option.getAttribute('role')).toBeNull()
    expect(option.querySelector('[aria-hidden="true"]')).not.toBeNull()
  }
  expect(illustration.querySelector('button, a[href], input, select, textarea, [tabindex], [role="radio"]')).toBeNull()
})
