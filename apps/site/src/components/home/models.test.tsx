import { renderToStaticMarkup } from 'react-dom/server'
import { expect, it } from 'vitest'
import { githubUrl } from '../../site-config'
import { Models } from './models'

function render() {
  const container = document.createElement('div')
  container.innerHTML = renderToStaticMarkup(<Models />)
  document.body.replaceChildren(container)
  return container
}

function pairs(list: Element) {
  return [...list.querySelectorAll(':scope > div')].map((row) => [
    row.querySelector(':scope > dt')?.textContent,
    row.querySelector(':scope > dd')?.textContent,
  ])
}

it('is one section labelled by its heading', () => {
  const container = render()
  const sections = container.querySelectorAll('section')
  expect(sections).toHaveLength(1)
  const heading = document.getElementById(sections[0].getAttribute('aria-labelledby')!)!
  expect(heading.tagName).toBe('H2')
  expect(heading.textContent).toBe('Built on Meta models. Open source.')
})

it('names each Meta model with the job it does', () => {
  const container = render()
  const lists = container.querySelectorAll('dl')
  expect(lists).toHaveLength(2)
  expect(pairs(lists[0])).toEqual([
    ['Muse Spark', 'Writes the curriculum and questions from your SOPs, checks each one against the source, and grades written answers.'],
    ['Muse Wonder', 'Orders each session, mixing due reviews with new concepts.'],
    ['Muse Image', 'Draws diagrams of procedures.'],
    ['Muse Voice', 'Transcribes spoken answers into a transcript the learner can edit before checking.'],
  ])
})

it('describes the open-source options and links to the repository', () => {
  const container = render()
  const licence = [...container.querySelectorAll('h3')].find((h) => h.textContent === 'MIT licensed')!
  expect(licence).toBeDefined()
  expect(pairs(container.querySelectorAll('dl')[1])).toEqual([
    ['Hosted', 'Run by us at learnquiz.com.'],
    ['Local', 'On your own server, with a Meta open-weight model.'],
  ])
  const link = [...container.querySelectorAll('a')].find((a) => a.textContent?.trim() === 'View on GitHub')!
  expect(link.getAttribute('href')).toBe(githubUrl)
  expect(link.querySelector('svg')?.getAttribute('aria-hidden')).toBe('true')
  expect(container.textContent).toContain('Built for the Meta Global AI Developer Hackathon 2026.')
})
