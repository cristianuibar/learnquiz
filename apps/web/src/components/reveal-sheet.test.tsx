// @vitest-environment happy-dom
import { act } from 'react'
import { createRoot } from 'react-dom/client'
import { afterEach, describe, expect, it, vi } from 'vitest'
import type { Answer, ItemView, Reveal } from '@learnquiz/api'
import { RevealSheet } from '@/components/reveal-sheet'

vi.mock('motion/react', async (original) => ({ ...(await original<typeof import('motion/react')>()), useReducedMotion: () => true }))
vi.mock('@tanstack/react-start', () => ({ useServerFn: (fn: unknown) => fn }))
vi.mock('@/server/diagrams', () => ({ generateConceptDiagram: vi.fn().mockResolvedValue({ status: 'unavailable' }) }))

function result(overrides: Partial<Reveal> = {}): Reveal {
  return {
    diagramConceptId: null,
    attemptId: 'attempt',
    state: 'A',
    correct: true,
    xp: 10,
    critical: false,
    correctOptionIds: ['record'],
    detail: null,
    score: 1,
    feedback: null,
    missingPoints: [],
    correctAnswer: 'Record the damage',
    chosenFeedback: null,
    explanation: 'Record before moving.',
    sourceQuote: 'Photograph the damage before moving anything.',
    sourceTitle: 'Receiving SOP',
    sourceVersion: 3,
    mixUps: [],
    returnsThisSession: false,
    pKnownBefore: 0.2,
    pKnownAfter: 0.5,
    ...overrides,
  }
}

const baseItem: ItemView = {
  id: 'i1',
  conceptId: 'c1',
  conceptName: 'Damage',
  format: 'mcq',
  stem: 'What first?',
  options: [{ id: 'record', text: 'Record the damage' }, { id: 'move', text: 'Move the carton' }],
  blank: null,
  image: null,
  difficulty: 1,
}
const baseAnswer: Answer = { optionId: 'move' }

let cleanup: (() => void) | null = null
afterEach(() => { cleanup?.(); cleanup = null })

async function mount(reveal: Reveal, props: { onContinue?: (r: string) => void; onReport?: (r: string) => void; item?: ItemView; answer?: Answer } = {}) {
  Object.assign(globalThis, { IS_REACT_ACT_ENVIRONMENT: true })
  const container = document.createElement('div')
  document.body.appendChild(container)
  const root = createRoot(container)
  await act(async () => root.render(
    <RevealSheet
      reveal={reveal}
      item={props.item ?? baseItem}
      answer={props.answer ?? baseAnswer}
      hasCompany
      onContinue={props.onContinue ?? vi.fn()}
      onReport={props.onReport ?? vi.fn()}
      headingId="reveal-heading"
      headingRef={null}
      reportRef={null}
    />,
  ))
  cleanup = () => { act(() => root.unmount()); container.remove() }
  return container
}

const button = (c: HTMLElement, name: string) =>
  [...c.querySelectorAll('button')].find((b) => b.textContent?.includes(name))!

describe('RevealSheet', () => {
  it.each([
    { name: 'A', reveal: result(), heading: 'Correct', xp: true, cont: 'Next question', pair: false, returns: false, extra: 'Record the damage' },
    { name: 'B', reveal: result({ state: 'B' }), heading: 'Correct', xp: true, cont: 'Next question', pair: false, returns: false, extra: 'Record before moving.' },
    { name: 'A without quote', reveal: result({ sourceQuote: null }), heading: 'Correct', xp: true, cont: 'Next question', pair: false, returns: false, extra: 'Not quoted from your SOP' },
    { name: 'C', reveal: result({ state: 'C', correct: false, xp: 0, returnsThisSession: true, chosenFeedback: 'Moving first loses evidence.' }), heading: 'Not quite', xp: false, cont: 'Next question', pair: true, returns: true, extra: 'Moving first loses evidence.' },
    { name: 'D', reveal: result({ state: 'D', correct: false, xp: 0, returnsThisSession: true, mixUps: ['Speed over proof'] }), heading: 'Not quite', xp: false, cont: 'Next question', pair: true, returns: true, extra: 'Speed over proof' },
    { name: 'ungraded', reveal: result({ state: 'ungraded', correct: false, xp: 0 }), heading: 'Couldn’t grade this answer', xp: false, cont: 'Next question', pair: false, returns: false, extra: 'Record the damage' },
  ])('shows the $name reveal', async ({ reveal, heading, xp, cont, pair, returns, extra }) => {
    const c = await mount(reveal)
    const text = c.textContent!
    expect(c.querySelector('h2')!.textContent).toBe(heading)
    expect(text.includes('+10 XP')).toBe(xp)
    expect(text.includes('You chose')).toBe(pair || reveal.state === 'ungraded')
    expect(text.includes('The answer')).toBe(pair || reveal.state === 'ungraded')
    expect(text.includes('This comes back later this session.')).toBe(returns)
    expect(text).toContain(extra)
    expect(button(c, cont)).toBeTruthy()
    for (const old of ['Continue', 'Got it']) expect(button(c, old)).toBeUndefined()
  })

  it('keeps the explanation and quote behind Why in A', async () => {
    const c = await mount(result())
    const why = button(c, 'Why')
    expect(why.getAttribute('aria-expanded')).toBe('false')
    expect(c.textContent).not.toContain('Record before moving.')
    expect(c.textContent).not.toContain('Photograph the damage')
    await act(async () => why.click())
    expect(why.getAttribute('aria-expanded')).toBe('true')
    expect(c.textContent).toContain('Record before moving.')
    expect(c.textContent).toContain('Photograph the damage before moving anything.')
  })

  it.each([{ critical: true }, { critical: false }])('shows the critical row only when critical is $critical', async ({ critical }) => {
    const c = await mount(result({ state: 'D', correct: false, xp: 0, critical }))
    expect(c.textContent!.includes('Critical step · Comes back first next session')).toBe(critical)
  })

  it('shows the chosen option feedback in D when the concept has no mix-ups', async () => {
    const c = await mount(result({ state: 'D', correct: false, xp: 0, chosenFeedback: 'Moving first loses evidence.' }))
    expect(c.textContent).toContain('Moving first loses evidence.')
    expect(c.textContent).not.toContain('Why it felt right')
  })

  it('passes the reflection to Next question and reports from the footer', async () => {
    const onContinue = vi.fn()
    const onReport = vi.fn()
    const c = await mount(result({ state: 'D', correct: false, xp: 0 }), { onContinue, onReport })
    const input = c.querySelector('input')!
    await act(async () => {
      Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value')!.set!.call(input, '  Evidence matters ')
      input.dispatchEvent(new Event('input', { bubbles: true }))
    })
    await act(async () => button(c, 'Next question').click())
    expect(onContinue).toHaveBeenCalledWith('Evidence matters')
    await act(async () => button(c, 'Report this question').click())
    expect(onReport).toHaveBeenCalledWith('Evidence matters')
  })

  it('shows the partly-right lines, counts and quote for a partial multi-select', async () => {
    const multi: ItemView = {
      ...baseItem,
      format: 'multi',
      options: [
        { id: 'hazmat', text: 'Hazmat' },
        { id: 'seal', text: 'Broken seal' },
        { id: 'mixed', text: 'Mixed-SKU' },
        { id: 'damaged', text: 'Damaged' },
      ],
    }
    const c = await mount(
      result({
        state: 'P',
        correct: false,
        xp: 0,
        returnsThisSession: true,
        correctOptionIds: ['hazmat', 'seal'],
        detail: {
          kind: 'multi',
          found: 1,
          total: 2,
          extra: 1,
          options: [
            { id: 'hazmat', text: 'Hazmat', correct: true, chosen: true, note: '' },
            { id: 'seal', text: 'Broken seal', correct: true, chosen: false, note: 'needs sign-off.' },
            { id: 'mixed', text: 'Mixed-SKU', correct: false, chosen: true, note: 'no sign-off needed.' },
            { id: 'damaged', text: 'Damaged', correct: false, chosen: false, note: '' },
          ],
        },
      }),
      { item: multi, answer: { optionIds: ['hazmat', 'mixed'] } },
    )
    const text = c.textContent!
    expect(c.querySelector('h2')!.textContent).toBe('Partly right')
    const band = c.querySelector('[role=status]')!.textContent!
    expect(band).toContain('1 of 2 found · 1 extra')
    expect(band).not.toContain('+10 XP')
    const lines = [...c.querySelectorAll('li')]
    expect(lines.map((li) => li.textContent)).toEqual(['Broken seal: needs sign-off. You missed it.', 'Mixed-SKU: no sign-off needed.'])
    expect(lines[0]!.querySelector('strong')!.textContent).toBe('Broken seal:')
    expect(text).not.toContain('You chose')
    expect(text).not.toContain('The answer')
    expect(text).toContain('Photograph the damage before moving anything.')
    expect(text).toContain('This comes back later this session.')
    expect(button(c, 'Next question')).toBeTruthy()
  })
})
