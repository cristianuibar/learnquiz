import { act } from 'react'
import { createRoot } from 'react-dom/client'
import type { Root } from 'react-dom/client'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { AnswerMoment } from './answer-moment'

let container: HTMLDivElement
let root: Root
let scrollSpy: ReturnType<typeof vi.fn>
let hadScroll: boolean
let originalScroll: unknown

beforeEach(() => {
  Object.assign(globalThis, { IS_REACT_ACT_ENVIRONMENT: true })
  const proto = Element.prototype as unknown as Record<string, unknown>
  hadScroll = typeof proto.scrollIntoView === 'function'
  originalScroll = proto.scrollIntoView
  scrollSpy = vi.fn()
  proto.scrollIntoView = scrollSpy
  container = document.createElement('div')
  document.body.appendChild(container)
  root = createRoot(container)
})

afterEach(async () => {
  await act(async () => root.unmount())
  container.remove()
  vi.restoreAllMocks()
  const proto = Element.prototype as unknown as Record<string, unknown>
  if (hadScroll) proto.scrollIntoView = originalScroll
  else delete proto.scrollIntoView
})

const ANSWERS = [
  'Scan the item next to it',
  'Stop the pick and tell the shift lead',
  'Type the expected code',
  'Override and continue',
]
const CONF = ['Sure', 'Unsure', 'Guessing']
const OUTCOME_TITLES = ['Correct and sure', 'Correct, unsure', 'Not quite', 'Sure and wrong']
const WHY: Record<number, string> = {
  0: 'A nearby label makes the scanner agree, but the pick is now recorded from the wrong slot.',
  2: 'Typing the code forces a match the scanner never made. The wrong item can still ship.',
  3: 'The warning is the check. Override it and the mistake travels to the customer.',
}
const EXPLANATION =
  'The mismatch warning is the check. Stopping keeps the wrong item off the order, and the shift lead sorts out the slot.'
const QUOTE = 'Warehouse picker SOPs v3 · §3.4'
const FELT_C = 'You know which item the pick wants, so typing it feels faster than waiting.'
const MATTERS = 'A mismatch means stop. The shift lead checks the slot before anything moves.'

async function mount() {
  await act(async () => {
    root.render(<AnswerMoment />)
  })
}

const answerRadios = () =>
  [...container.querySelectorAll<HTMLButtonElement>('[role=radiogroup][aria-labelledby="lqs-q"] button[role=radio]')]
const confRadios = () =>
  [...container.querySelectorAll<HTMLButtonElement>('[role=radiogroup][aria-labelledby="lqs-conf-l"] button[role=radio]')]
const checkBtn = () =>
  [...container.querySelectorAll<HTMLButtonElement>('button')].find((b) => b.textContent?.trim() === 'Check')!
const outcomeBtns = () => [...container.querySelectorAll<HTMLButtonElement>('ul.reveals button.rv-item')]
const sheet = () => container.querySelector<HTMLElement>('section.sheet[aria-labelledby=lqs-result]')
const heading = () => container.querySelector<HTMLElement>('#lqs-result')
const whyBtn = () => container.querySelector<HTMLButtonElement>('button.link-btn')
const pressedIndexes = () =>
  outcomeBtns().flatMap((b, i) => (b.getAttribute('aria-pressed') === 'true' ? [i] : []))
const text = (el: Element | null) => el?.textContent ?? ''

async function click(el: HTMLElement) {
  await act(async () => {
    el.click()
  })
}

// A real pointer click focuses the button first; el.click() alone does not.
async function pointerClick(el: HTMLElement) {
  await act(async () => {
    el.focus()
    el.click()
  })
}

async function key(el: HTMLElement, k: string) {
  const event = new KeyboardEvent('keydown', { key: k, bubbles: true, cancelable: true })
  await act(async () => {
    el.dispatchEvent(event)
  })
  return event
}

async function answer(a: number, c: number) {
  await click(answerRadios()[a])
  await click(confRadios()[c])
  await click(checkBtn())
}

function expectAsking() {
  expect(answerRadios()).toHaveLength(4)
  expect(sheet()).toBeNull()
  expect(checkBtn().disabled).toBe(true)
  expect(pressedIndexes()).toEqual([])
}

function tabbable(radios: HTMLElement[]) {
  return radios.flatMap((r, i) => (r.getAttribute('tabindex') === '0' ? [i] : []))
}

const CASES = [
  { id: 'cs', a: 1, c: 0, heading: 'Correct and sure' as const, outcome: 0 },
  { id: 'cu-unsure', a: 1, c: 1, heading: 'cu' as const, outcome: 1 },
  { id: 'cu-guessing', a: 1, c: 2, heading: 'cu' as const, outcome: 1 },
  { id: 'nq-a', a: 0, c: 1, heading: 'nq' as const, outcome: 2 },
  { id: 'nq-d', a: 3, c: 1, heading: 'nq' as const, outcome: 2 },
  { id: 'nq-c-guessing', a: 2, c: 2, heading: 'nq' as const, outcome: 2 },
  { id: 'sw-c', a: 2, c: 0, heading: 'sw' as const, outcome: 3 },
  { id: 'sw-a', a: 0, c: 0, heading: 'sw' as const, outcome: 3 },
]
const HEADINGS: Record<string, string> = {
  'Correct and sure': 'Correct, and you were sure.',
  cu: 'Correct, but you weren’t sure, so here is why.',
  nq: 'Not quite.',
  sw: 'Not quite, and you were sure. This is a critical step.',
}

describe('AnswerMoment', () => {
  it('renders the asking state with a labelled section, question and radios', async () => {
    await mount()
    const section = container.querySelector('section#try[aria-labelledby="lqs-answer"]')!
    expect(section).not.toBeNull()
    expect(text(section.querySelector('h2#lqs-answer'))).toBe('Being right and being sure are different things.')
    expect(section.querySelector('div[role=group][aria-label="Try a question"]')).not.toBeNull()
    expect(text(section.querySelector('p#lqs-q'))).toBe(
      'Your scanner says the item doesn’t match the pick. What do you do first?',
    )
    expect(answerRadios().map((r) => r.textContent!.trim())).toEqual(ANSWERS)
    expect(confRadios().map((r) => r.textContent!.trim())).toEqual(CONF)
    for (const r of [...answerRadios(), ...confRadios()]) expect(r.getAttribute('aria-checked')).toBe('false')
    expect(container.querySelector('.is-selected')).toBeNull()
    expectAsking()
    expect(outcomeBtns()).toHaveLength(4)
    outcomeBtns().forEach((b, i) => expect(text(b.querySelector('.rv-title')).startsWith(OUTCOME_TITLES[i])).toBe(true))
  })

  it('walks the issue flow: keyboard select, Check, outcome buttons, reset', async () => {
    await mount()
    // (1)
    expect(checkBtn().disabled).toBe(true)
    expect(container.querySelectorAll('[role=radiogroup][aria-labelledby="lqs-q"] [tabindex="0"]')).toHaveLength(1)
    expect(container.querySelectorAll('[role=radiogroup][aria-labelledby="lqs-conf-l"] [tabindex="0"]')).toHaveLength(1)
    // (2)
    await key(answerRadios()[0], 'ArrowDown')
    expect(document.activeElement).toBe(answerRadios()[1])
    expect(answerRadios()[1].textContent!.trim()).toBe('Stop the pick and tell the shift lead')
    expect(answerRadios()[1].getAttribute('aria-checked')).toBe('true')
    expect(checkBtn().disabled).toBe(true)
    await key(confRadios()[0], ' ')
    expect(confRadios()[0].textContent!.trim()).toBe('Sure')
    expect(confRadios()[0].getAttribute('aria-checked')).toBe('true')
    expect(checkBtn().disabled).toBe(false)
    // (3)
    await click(checkBtn())
    expect(document.activeElement).toBe(heading())
    expect(text(heading())).toBe('Correct, and you were sure.')
    expect(outcomeBtns()[0].getAttribute('aria-pressed')).toBe('true')
    // (4)
    await click(outcomeBtns()[3])
    expect(text(sheet())).toContain('You were sure, on a critical step.')
    expect(document.activeElement).toBe(heading())
    await pointerClick(outcomeBtns()[3])
    expectAsking()
    expect(document.activeElement).toBe(outcomeBtns()[3])
  })

  describe('outcomes reached through Check', () => {
    it.each(CASES)('$id (answer $a, confidence $c)', async ({ a, c, heading: h, outcome }) => {
      await mount()
      await answer(a, c)
      const correct = a === 1
      const kind = h

      expect(answerRadios()).toHaveLength(0)
      expect(container.querySelector('div[role=group][aria-label="Try a question"]')).toBeNull()
      expect(sheet()).not.toBeNull()
      expect(heading()!.getAttribute('tabindex')).toBe('-1')
      expect(document.activeElement).toBe(heading())
      expect(text(heading())).toBe(HEADINGS[kind])
      expect(pressedIndexes()).toEqual([outcome])

      const sh = text(sheet())
      if (correct) expect(sh).toContain('+10 XP')
      else expect(sh).not.toContain('+10 XP')
      expect(text(heading())).not.toContain('XP')

      const body = sheet()!.querySelector('.sheet-body[role=region][aria-label="Answer details"]')!
      expect(body).not.toBeNull()

      if (kind === 'Correct and sure') {
        expect(text(body)).toContain('Stop the pick and tell the shift lead.')
        const why = whyBtn()!
        expect(text(why).trim()).toBe('Why')
        expect(why.getAttribute('aria-expanded')).toBe('false')
        expect(text(body)).not.toContain(EXPLANATION)
        expect(text(body)).not.toContain(QUOTE)
        expect(body.querySelector('figure.quote')).toBeNull()
        expect(body.querySelectorAll('.pair')).toHaveLength(0)
      } else if (kind === 'cu') {
        expect(whyBtn()).toBeNull()
        expect(text(body)).toContain(EXPLANATION)
        expect(text(body.querySelector('figure.quote'))).toContain(QUOTE)
      } else {
        const pairs = body.querySelectorAll('.pair')
        expect(pairs).toHaveLength(2)
        expect(whyBtn()).toBeNull()
        const b = text(body)
        expect(b).toContain('The answer')
        expect(b).toContain('Stop the pick and tell the shift lead')
        expect(b).toContain('You chose')
        expect(text(pairs[1])).toContain(ANSWERS[a])
        expect(text(pairs[1])).toContain(WHY[a])
        expect(text(body.querySelector('figure.quote'))).toContain(QUOTE)
        if (kind === 'nq') {
          expect(sh).toContain('This comes back later this session.')
          expect(sheet()!.querySelector('.critical-row')).toBeNull()
        } else {
          const crit = text(sheet()!.querySelector('p.critical-row'))
          expect(crit).toContain('You were sure, on a critical step.')
          expect(crit).toContain('It comes back first next session.')
          const h4s = [...sheet()!.querySelectorAll('h4')].map((e) => text(e))
          expect(h4s).toContain('Why it felt right')
          expect(h4s).toContain('What actually matters')
          expect(sh).toContain(MATTERS)
          if (a === 2) expect(sh).toContain(FELT_C)
          expect(sh).not.toContain('This comes back later this session.')
        }
      }

      // revealed question layer
      const layer = container.querySelector('.p-scroll[aria-hidden=true]')!
      expect(layer).not.toBeNull()
      const correctOpt = layer.querySelectorAll('.opt.is-correct')
      expect(correctOpt).toHaveLength(1)
      expect(text(correctOpt[0])).toContain('Correct')
      if (correct) {
        expect(layer.querySelectorAll('.opt.is-wrong')).toHaveLength(0)
        expect(layer.querySelectorAll('.opt.is-rest')).toHaveLength(3)
      } else {
        const wrong = layer.querySelectorAll('.opt.is-wrong')
        expect(wrong).toHaveLength(1)
        expect(text(wrong[0])).toContain('Not quite')
        expect(text(wrong[0])).toContain(ANSWERS[a])
        expect(layer.querySelectorAll('.opt.is-rest')).toHaveLength(2)
      }
    })
  })

  describe('outcomes reached through the outcome buttons', () => {
    it.each([
      { i: 0, kind: 'Correct and sure' },
      { i: 1, kind: 'cu' },
      { i: 2, kind: 'nq' },
      { i: 3, kind: 'sw' },
    ])('button $i shows $kind', async ({ i, kind }) => {
      await mount()
      expect(outcomeBtns()[i].getAttribute('aria-pressed')).not.toBe('true')
      await click(outcomeBtns()[i])
      expect(answerRadios()).toHaveLength(0)
      expect(text(heading())).toBe(HEADINGS[kind])
      expect(document.activeElement).toBe(heading())
      expect(pressedIndexes()).toEqual([i])
      const sh = text(sheet())
      if (i <= 1) expect(sh).toContain('+10 XP')
      else expect(sh).not.toContain('+10 XP')
      if (i === 3) expect(sh).toContain('You were sure, on a critical step.')
      if (i === 2) expect(sh).toContain('This comes back later this session.')
      if (i === 1) expect(whyBtn()).toBeNull()
      if (i === 0) expect(whyBtn()).not.toBeNull()
    })

    it('switches between outcomes and presses the pressed one to reset', async () => {
      await mount()
      await click(outcomeBtns()[2])
      await click(outcomeBtns()[1])
      expect(pressedIndexes()).toEqual([1])
      expect(text(heading())).toBe(HEADINGS.cu)
      expect(document.activeElement).toBe(heading())
      await pointerClick(outcomeBtns()[1])
      expectAsking()
      expect(document.activeElement).toBe(outcomeBtns()[1])
    })
  })

  describe('keyboard', () => {
    it('wraps with arrows, selects on each, prevents default and keeps focus in the group', async () => {
      await mount()
      expect(tabbable(answerRadios())).toEqual([0])
      expect(tabbable(confRadios())).toEqual([0])

      let ev = await key(answerRadios()[0], 'ArrowUp')
      expect(ev.defaultPrevented).toBe(true)
      expect(document.activeElement).toBe(answerRadios()[3])
      expect(answerRadios()[3].getAttribute('aria-checked')).toBe('true')
      expect(answerRadios()[3].classList.contains('is-selected')).toBe(true)
      expect(tabbable(answerRadios())).toEqual([3])
      expect(answerRadios().filter((r) => r.getAttribute('aria-checked') === 'true')).toHaveLength(1)

      ev = await key(answerRadios()[3], 'ArrowDown')
      expect(ev.defaultPrevented).toBe(true)
      expect(document.activeElement).toBe(answerRadios()[0])
      expect(tabbable(answerRadios())).toEqual([0])

      ev = await key(answerRadios()[0], 'ArrowRight')
      expect(ev.defaultPrevented).toBe(true)
      expect(document.activeElement).toBe(answerRadios()[1])
      expect(answerRadios()[1].getAttribute('aria-checked')).toBe('true')

      ev = await key(answerRadios()[1], 'ArrowLeft')
      expect(ev.defaultPrevented).toBe(true)
      expect(document.activeElement).toBe(answerRadios()[0])
      expect(answerRadios()[0].getAttribute('aria-checked')).toBe('true')
      expect(answerRadios()[1].getAttribute('aria-checked')).toBe('false')

      // confidence group
      ev = await key(confRadios()[0], 'ArrowLeft')
      expect(ev.defaultPrevented).toBe(true)
      expect(document.activeElement).toBe(confRadios()[2])
      expect(tabbable(confRadios())).toEqual([2])
      ev = await key(confRadios()[2], 'ArrowRight')
      expect(ev.defaultPrevented).toBe(true)
      expect(document.activeElement).toBe(confRadios()[0])
      expect(confRadios()[0].getAttribute('aria-checked')).toBe('true')
      expect(checkBtn().disabled).toBe(false)
      ev = await key(confRadios()[0], 'ArrowDown')
      expect(document.activeElement).toBe(confRadios()[1])
      ev = await key(confRadios()[1], 'ArrowUp')
      expect(document.activeElement).toBe(confRadios()[0])
      // answer group untouched by confidence navigation
      expect(answerRadios()[0].getAttribute('aria-checked')).toBe('true')
    })

    it('selects the focused radio with Space and Enter and prevents default', async () => {
      await mount()
      let ev = await key(answerRadios()[2], 'Enter')
      expect(ev.defaultPrevented).toBe(true)
      expect(answerRadios()[2].getAttribute('aria-checked')).toBe('true')
      expect(tabbable(answerRadios())).toEqual([2])
      ev = await key(confRadios()[1], ' ')
      expect(ev.defaultPrevented).toBe(true)
      expect(confRadios()[1].getAttribute('aria-checked')).toBe('true')
      expect(tabbable(confRadios())).toEqual([1])
      expect(checkBtn().disabled).toBe(false)
      ev = await key(confRadios()[2], 'Enter')
      expect(confRadios()[2].getAttribute('aria-checked')).toBe('true')
      expect(confRadios()[1].getAttribute('aria-checked')).toBe('false')
    })

    it('moves the roving tabindex with a click', async () => {
      await mount()
      await click(answerRadios()[3])
      expect(tabbable(answerRadios())).toEqual([3])
      expect(answerRadios().map((r) => r.getAttribute('tabindex'))).toEqual(['-1', '-1', '-1', '0'])
      expect(answerRadios()[3].classList.contains('is-selected')).toBe(true)
      await click(confRadios()[2])
      expect(tabbable(confRadios())).toEqual([2])
    })
  })

  describe('Why toggle', () => {
    it('hides the explanation until toggled, and toggles back', async () => {
      await mount()
      await answer(1, 0)
      expect(text(sheet())).not.toContain(EXPLANATION)
      await click(whyBtn()!)
      expect(whyBtn()!.getAttribute('aria-expanded')).toBe('true')
      expect(text(sheet())).toContain(EXPLANATION)
      expect(text(sheet()!.querySelector('figure.quote'))).toContain(QUOTE)
      await click(whyBtn()!)
      expect(whyBtn()!.getAttribute('aria-expanded')).toBe('false')
      expect(text(sheet())).not.toContain(EXPLANATION)
    })

    it('resets the open Why when the outcome changes', async () => {
      await mount()
      await click(outcomeBtns()[0])
      await click(whyBtn()!)
      expect(whyBtn()!.getAttribute('aria-expanded')).toBe('true')
      await click(outcomeBtns()[1])
      expect(whyBtn()).toBeNull()
      await click(outcomeBtns()[0])
      expect(whyBtn()!.getAttribute('aria-expanded')).toBe('false')
      expect(text(sheet())).not.toContain(EXPLANATION)
    })
  })

  it('Try another answer resets everything and focuses the first answer', async () => {
    await mount()
    await answer(2, 0)
    const again = [...container.querySelectorAll<HTMLButtonElement>('button')].find(
      (b) => b.textContent?.trim() === 'Try another answer',
    )!
    expect(again).toBeDefined()
    await click(again)
    expectAsking()
    expect(answerRadios().every((r) => r.getAttribute('aria-checked') === 'false')).toBe(true)
    expect(confRadios().every((r) => r.getAttribute('aria-checked') === 'false')).toBe(true)
    expect(tabbable(answerRadios())).toEqual([0])
    expect(tabbable(confRadios())).toEqual([0])
    expect(document.activeElement).toBe(answerRadios()[0])
    expect(answerRadios()[0].textContent!.trim()).toBe('Scan the item next to it')
  })

  it.each(['Check', ...OUTCOME_TITLES])('focuses without browser scrolling, then centers the full result band from %s', async (source) => {
    const focusSpy = vi.spyOn(HTMLElement.prototype, 'focus')
    await mount()
    if (source === 'Check') await answer(1, 0)
    else await click(outcomeBtns()[OUTCOME_TITLES.indexOf(source)])

    expect(document.activeElement).toBe(heading())
    expect(focusSpy).toHaveBeenLastCalledWith({ preventScroll: true })
    expect(scrollSpy).toHaveBeenCalledExactlyOnceWith({ block: 'center' })
    expect(scrollSpy.mock.instances[0]).toBe(sheet()!.querySelector('.sheet-band'))
    expect(focusSpy.mock.invocationCallOrder.at(-1)).toBeLessThan(scrollSpy.mock.invocationCallOrder[0])

    // Switching an already revealed sheet must bring the new result back into view too.
    const next = source === 'Sure and wrong' ? 0 : 3
    await pointerClick(outcomeBtns()[next])
    expect(document.activeElement).toBe(heading())
    expect(focusSpy).toHaveBeenLastCalledWith({ preventScroll: true })
    expect(scrollSpy).toHaveBeenCalledTimes(2)
    expect(scrollSpy.mock.instances[1]).toBe(sheet()!.querySelector('.sheet-band'))
    expect(scrollSpy).toHaveBeenLastCalledWith({ block: 'center' })
  })
})
