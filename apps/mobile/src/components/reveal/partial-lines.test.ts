import { createElement as h } from 'react'
import { render, screen } from '@testing-library/react-native'
import { themes, typography } from '@learnquiz/tokens/native'
import type { ItemView, Reveal } from '@learnquiz/api'
import { revealModel } from '@learnquiz/api/reveal'
import { ThemeProvider } from '../../theme/ThemeProvider'
import { PartialBody } from './partial-body'
import { splitPartialLine } from './partial-lines'

describe('splitPartialLine', () => {
  test('a line with a note leads with the option text and its colon', () => {
    expect(splitPartialLine('Broken seal: needs sign-off. You missed it.', 'Broken seal')).toEqual({ lead: 'Broken seal:', rest: ' needs sign-off. You missed it.' })
  })

  test('a missed option without a note leads with the option text alone', () => {
    expect(splitPartialLine('Hazmat. You missed it.', 'Hazmat')).toEqual({ lead: 'Hazmat', rest: '. You missed it.' })
  })

  test('an extra option without a note leads with the option text alone', () => {
    expect(splitPartialLine('Mixed-SKU was not needed.', 'Mixed-SKU')).toEqual({ lead: 'Mixed-SKU', rest: ' was not needed.' })
  })

  test('an unknown or mismatched option keeps the whole line plain', () => {
    expect(splitPartialLine('Broken seal: needs sign-off.', undefined)).toEqual({ lead: '', rest: 'Broken seal: needs sign-off.' })
    expect(splitPartialLine('Broken seal: needs sign-off.', 'Hazmat')).toEqual({ lead: '', rest: 'Broken seal: needs sign-off.' })
    expect(splitPartialLine('Broken seal: needs sign-off.', '')).toEqual({ lead: '', rest: 'Broken seal: needs sign-off.' })
  })
})

const reveal: Reveal = {
  diagramConceptId: null, attemptId: 'attempt', state: 'P', correct: false, xp: 0, critical: false, correctOptionIds: ['hazmat', 'seal'],
  detail: {
    kind: 'multi', found: 1, total: 2, extra: 1,
    options: [
      { id: 'hazmat', text: 'Hazmat', correct: true, chosen: true, note: 'Needs sign-off.' },
      { id: 'seal', text: 'Broken seal', correct: true, chosen: false, note: 'needs sign-off.' },
      { id: 'sku', text: 'Mixed-SKU', correct: false, chosen: true, note: 'no sign-off needed.' },
      { id: 'damaged', text: 'Damaged label', correct: false, chosen: false, note: '' },
    ],
  },
  score: 0.5, feedback: null, missingPoints: [], correctAnswer: 'Hazmat, Broken seal', chosenFeedback: null, explanation: 'Leads sign off on risky cartons.',
  sourceQuote: 'Hazmat-labeled cartons and cartons with a broken seal wait in staging for a lead’s sign-off before put-away.',
  sourceTitle: 'Receiving SOP', sourceVersion: 3, mixUps: [], returnsThisSession: true, pKnownBefore: 0.2, pKnownAfter: 0.4,
}
const item: ItemView = { id: 'i', conceptId: 'c', conceptName: 'Receiving', format: 'multi', stem: 'Which cartons need sign-off?', options: [], blank: null, image: null, difficulty: 1 }

function body(overrides: Partial<Reveal> = {}, scheme: 'light' | 'dark' = 'light') {
  const r = { ...reveal, ...overrides }
  const model = revealModel(r, { hasCompany: true })
  return render(h(ThemeProvider, { scheme, children: h(PartialBody, { model, reveal: r, item, answer: {}, reflection: '', onReflection: jest.fn() }) }))
}

const missed = 'Broken seal: needs sign-off. You missed it.'
const extra = 'Mixed-SKU: no sign-off needed.'
const quoteLabel = 'Quote: Hazmat-labeled cartons and cartons with a broken seal wait in staging for a lead’s sign-off before put-away., Receiving SOP · v3'

describe.each(['light', 'dark'] as const)('%s partial body', (scheme) => {
  const c = themes[scheme]

  test('shows one line per option that was off, with a check for the missed one and an x for the extra one', async () => {
    await body({}, scheme)
    expect(screen.getByLabelText(missed)).toBeOnTheScreen()
    expect(screen.getByLabelText(extra)).toBeOnTheScreen()
    expect(screen.queryByText(/Hazmat:/)).toBeNull()
    expect(screen.queryByText(/Damaged label/)).toBeNull()
    expect(JSON.stringify(screen.getByLabelText(missed).children[0])).toContain(c.feedbackCorrect)
    expect(JSON.stringify(screen.getByLabelText(extra).children[0])).toContain(c.feedbackWrong)
  })

  test('the option name is in 600 and the line is body large', async () => {
    await body({}, scheme)
    expect(screen.getByText('Broken seal:')).toHaveStyle({ fontFamily: typography.labelLg.fontFamily, fontSize: 17, lineHeight: 26 })
    expect(screen.getByText('Mixed-SKU:')).toHaveStyle({ fontFamily: typography.labelLg.fontFamily })
    expect(screen.getByText(/no sign-off needed\.$/)).toHaveStyle({ fontFamily: typography.bodyLg.fontFamily, fontSize: 17, lineHeight: 26, color: c.ink })
  })

  test('the return line is muted', async () => {
    await body({}, scheme)
    expect(screen.getByText('This comes back later this session.')).toHaveStyle({ color: c.inkMuted, fontSize: 15 })
  })
})

test('lines come before the quote and the quote before the return line', async () => {
  await body()
  const text = JSON.stringify(screen.toJSON())
  const order = [missed, extra, quoteLabel, 'This comes back later this session.'].map((needle) => text.indexOf(needle))
  expect(order.every((index) => index >= 0)).toBe(true)
  expect([...order].sort((a, b) => a - b)).toEqual(order)
})

test('never shows a wrong heading, the answer pair or the explanation', async () => {
  await body()
  expect(screen.queryByText(/Wrong|Not quite|The answer|You chose/)).toBeNull()
  expect(screen.queryByText('Leads sign off on risky cartons.')).toBeNull()
})

test('no return line when the item does not come back this session', async () => {
  await body({ returnsThisSession: false })
  expect(screen.queryByText('This comes back later this session.')).toBeNull()
  expect(screen.getByLabelText(missed)).toBeOnTheScreen()
})

test('no quote block without a source quote', async () => {
  await body({ sourceQuote: null })
  expect(screen.queryByLabelText(/^Quote:/)).toBeNull()
  expect(screen.getByText('This comes back later this session.')).toBeOnTheScreen()
})

test('notes are optional: missed and extra lines fall back to the model wording', async () => {
  const detail = reveal.detail as Extract<NonNullable<Reveal['detail']>, { kind: 'multi' }>
  await body({ detail: { ...detail, options: detail.options.map((option) => ({ ...option, note: '' })) } })
  expect(screen.getByLabelText('Broken seal. You missed it.')).toBeOnTheScreen()
  expect(screen.getByLabelText('Mixed-SKU was not needed.')).toBeOnTheScreen()
  expect(screen.getByText('Broken seal')).toHaveStyle({ fontFamily: typography.labelLg.fontFamily })
})

test('no accent colour on the partial body', async () => {
  for (const scheme of ['light', 'dark'] as const) {
    const view = await body({}, scheme)
    expect(JSON.stringify(screen.toJSON())).not.toContain(themes[scheme].accent)
    await view.unmount()
  }
})
