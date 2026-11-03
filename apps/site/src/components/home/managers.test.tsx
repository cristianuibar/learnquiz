import { renderToStaticMarkup } from 'react-dom/server'
import { expect, it } from 'vitest'
import { Managers } from './managers'

const PORTAL_LABEL = 'Company portal, Warehouse picker role at Northwind Logistics. Source document Warehouse picker SOPs, version 3. Curriculum of five units: Receiving, Picking, Scanning, Safety, Returns. People: Alex Rivera invited; Morgan Chen onboarding at 66 percent with one confident error on a critical step; Sam Patel proficient at 88 percent.'
const PHONE_LABEL = 'Morgan Chen’s Training progress page on a phone. Your manager sees this same page. 66 percent of 85 percent benchmark, day 16 of 30, projected Nov 12. By unit: Scanning 74 percent with one confident error on Resolve a scan mismatch, Receiving 82 percent, Picking 68 percent.'

function render() {
  const container = document.createElement('div')
  container.innerHTML = renderToStaticMarkup(<Managers />)
  const section = container.querySelector('section') as HTMLElement
  const frames = [...section.querySelectorAll('[role="img"]')] as HTMLElement[]
  const portal = frames.find((f) => f.getAttribute('aria-label') === PORTAL_LABEL)!
  const phone = frames.find((f) => f.getAttribute('aria-label') === PHONE_LABEL)!
  return { container, section, frames, portal, phone }
}

const texts = (els: Iterable<Element>) => [...els].map((el) => el.textContent?.trim())
const orderOf = (text: string, names: string[]) => names.map((n) => text.indexOf(n))
const ascending = (nums: number[]) => nums.every((n, i) => n >= 0 && (i === 0 || n > nums[i - 1]))

it('labels the section by its heading', () => {
  const { section } = render()
  const heading = section.querySelector(`[id="${section.getAttribute('aria-labelledby')}"]`)
  expect(heading?.tagName).toBe('H2')
  expect(heading?.textContent?.trim()).toBe('You see who is on track. They see exactly what you see.')
})

it('presents exactly two illustrations with the specified accessible descriptions', () => {
  const { frames } = render()
  expect(frames.map((f) => f.getAttribute('aria-label'))).toEqual([PORTAL_LABEL, PHONE_LABEL])
})

it('captions each illustration in its own figure, outside the image', () => {
  const { portal, phone } = render()
  const expected = [
    [portal, 'Company portal. Northwind Logistics is a demo company; names and numbers are illustrative.'],
    [phone, 'Morgan’s Training progress, on their phone and in the portal alike.'],
  ] as const
  for (const [frame, caption] of expected) {
    const figure = frame.closest('figure')!
    expect(figure).not.toBeNull()
    const figcaption = figure.querySelector('figcaption')!
    expect(figcaption.textContent?.trim()).toBe(caption)
    expect(frame.contains(figcaption)).toBe(false)
  }
  expect(portal.closest('figure')).not.toBe(phone.closest('figure'))
})

it('hides all visual content from assistive tech and has nothing interactive or an img', () => {
  const { section, frames } = render()
  for (const frame of frames) {
    expect(frame.querySelectorAll('a, button, input, select, textarea, [tabindex], [href]')).toHaveLength(0)
    expect(frame.children.length).toBeGreaterThan(0)
    for (const child of frame.children) expect(child.getAttribute('aria-hidden')).toBe('true')
    expect([...frame.childNodes].filter((n) => n.nodeType === 3)).toHaveLength(0)
  }
  expect(section.querySelectorAll('img')).toHaveLength(0)
})

it('shows the portal content: address, company, document, curriculum and people in order', () => {
  const { portal } = render()
  const text = portal.textContent!
  for (const s of ['app.learnquiz.com/roles/warehouse-picker', 'Northwind Logistics', 'Warehouse picker SOPs.pdf']) {
    expect(text).toContain(s)
  }
  const units = ['Receiving', 'Picking', 'Scanning', 'Safety', 'Returns']
  expect(ascending(orderOf(text, units))).toBe(true)
  expect(ascending(orderOf(text, ['Alex Rivera', 'Morgan Chen', 'Sam Patel']))).toBe(true)
})

it('uses neutral status chips for Invited, Onboarding and Proficient', () => {
  const { portal } = render()
  const chips = [...portal.querySelectorAll('.chip')]
  const labels = texts(chips)
  for (const status of ['Invited', 'Onboarding', 'Proficient']) expect(labels).toContain(status)
  for (const chip of chips.filter((c) => ['Invited', 'Onboarding', 'Proficient'].includes(c.textContent!.trim()))) {
    expect(chip.classList.contains('chip-critical')).toBe(false)
  }
})

it('draws progress bars at the specified widths and benchmark', () => {
  const { portal, phone } = render()
  const fills = [...portal.querySelectorAll('.bar-fill')].map((el) => (el as HTMLElement).style.width)
  expect(fills).toContain('66%')
  expect(fills).toContain('88%')
  expect((portal.querySelector('.bar-bench') as HTMLElement).style.left).toBe('85%')
  expect((phone.querySelector('.bar-lg .bar-fill') as HTMLElement).style.width).toBe('66%')
  const text = phone.textContent!
  expect(ascending(orderOf(text, ['Scanning', 'Receiving', 'Picking']))).toBe(true)
})

it('marks the current destination in each navigation', () => {
  const { portal, phone } = render()
  const nav = (root: HTMLElement, selector: string) => {
    const items = [...root.querySelector(selector)!.children]
    return { labels: texts(items), on: texts(items.filter((i) => i.classList.contains('is-on'))) }
  }
  expect(nav(phone, '.p-nav')).toEqual({ labels: ['Today', 'Path', 'Profile'], on: ['Profile'] })
  expect(nav(portal, '.desk-nav')).toEqual({ labels: ['Roles', 'People', 'Settings'], on: ['Roles'] })
})
