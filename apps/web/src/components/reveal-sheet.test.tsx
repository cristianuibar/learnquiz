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

const item: ItemView = {
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
const answer: Answer = { optionId: 'move' }

let cleanup: (() => void) | null = null
afterEach(() => { cleanup?.(); cleanup = null })

async function mount(reveal: Reveal, props: { onContinue?: (r: string) => void; onReport?: () => void } = {}) {
  Object.assign(globalThis, { IS_REACT_ACT_ENVIRONMENT: true })
  const container = document.createElement('div')
  document.body.appendChild(container)
  const root = createRoot(container)
  await act(async () => root.render(
    <RevealSheet
      reveal={reveal}
      item={item}
      answer={answer}
      hasCompany
      onContinue={props.onContinue ?? vi.fn()}
      onReport={props.onReport ?? vi.fn()}
    />,
  ))
  cleanup = () => { act(() => root.unmount()); container.remove() }
  return container
}

const button = (c: HTMLElement, name: string) =>
  [...c.querySelectorAll('button')].find((b) => b.textContent?.includes(name))!

describe('RevealSheet', () => {
  it.each([
    { name: 'A', reveal: result(), heading: 'Correct', xp: true, cont: 'Continue', pair: false, returns: false, extra: 'Record the damage' },
    { name: 'B', reveal: result({ state: 'B' }), heading: 'Correct', xp: true, cont: 'Continue', pair: false, returns: false, extra: 'Record before moving.' },
    { name: 'A without quote', reveal: result({ sourceQuote: null }), heading: 'Correct', xp: true, cont: 'Continue', pair: false, returns: false, extra: 'Not quoted from your SOP' },
    { name: 'C', reveal: result({ state: 'C', correct: false, xp: 0, returnsThisSession: true, chosenFeedback: 'Moving first loses evidence.' }), heading: 'Not quite', xp: false, cont: 'Continue', pair: true, returns: true, extra: 'Moving first loses evidence.' },
    { name: 'D', reveal: result({ state: 'D', correct: false, xp: 0, returnsThisSession: true, mixUps: ['Speed over proof'] }), heading: 'Not quite', xp: false, cont: 'Got it', pair: true, returns: true, extra: 'Speed over proof' },
    { name: 'ungraded', reveal: result({ state: 'ungraded', correct: false, xp: 0 }), heading: 'Couldn’t grade this answer', xp: false, cont: 'Continue', pair: false, returns: false, extra: 'Record the damage' },
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
    expect(button(c, cont === 'Got it' ? 'Continue' : 'Got it')).toBeUndefined()
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

  it('passes the reflection to Got it and reports from the footer', async () => {
    const onContinue = vi.fn()
    const onReport = vi.fn()
    const c = await mount(result({ state: 'D', correct: false, xp: 0 }), { onContinue, onReport })
    const input = c.querySelector('input')!
    await act(async () => {
      Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value')!.set!.call(input, '  Evidence matters ')
      input.dispatchEvent(new Event('input', { bubbles: true }))
    })
    await act(async () => button(c, 'Got it').click())
    expect(onContinue).toHaveBeenCalledWith('Evidence matters')
    await act(async () => button(c, 'Report this question').click())
    expect(onReport).toHaveBeenCalledTimes(1)
  })
})
