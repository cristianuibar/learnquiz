import { renderToStaticMarkup } from 'react-dom/server'
import { expect, it } from 'vitest'
import { Managers } from './managers'

it('shows the People page and Morgan’s progress with accessible screenshots', () => {
  const container = document.createElement('div')
  container.innerHTML = renderToStaticMarkup(<Managers />)
  const section = container.querySelector('section')!
  const heading = section.querySelector('h2')!
  expect(heading.id).toBe(section.getAttribute('aria-labelledby'))
  expect(heading.textContent?.trim()).toBe('You see who is on track. They see exactly what you see.')
  const screenshots = [...section.querySelectorAll<HTMLImageElement>('img:not(.shot-dark)')]
  expect(screenshots.map((image) => image.alt)).toEqual([
    expect.stringContaining('Northwind Logistics People page'),
    expect.stringContaining('Morgan Chen’s Training progress'),
  ])
  for (const image of screenshots) expect(image.closest('[aria-hidden="true"]')).toBeNull()
})
