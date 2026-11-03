import { createElement as h, StrictMode, type ReactNode } from 'react'
import { fireEvent, render, screen } from '@testing-library/react-native'
import { themes } from '@learnquiz/tokens/native'
import type { ItemView, Reveal } from '@learnquiz/api'
import { ThemeProvider } from '../../theme/ThemeProvider'
import { resultHaptic } from '../../lib/haptics'
import { RevealSheet, type RevealSheetProps } from './reveal-sheet'

const sheetProps: { current: Record<string, unknown> | null } = { current: null }

jest.mock('../../lib/haptics', () => ({ resultHaptic: jest.fn() }))
jest.mock('../sheet/sheet', () => ({
  Sheet: (props: { band?: ReactNode; body: ReactNode; foot?: ReactNode }) => {
    const { View: V } = require('react-native')
    const { createElement } = require('react')
    sheetProps.current = props
    return createElement(V, null, props.band, props.body, props.foot)
  },
}))

const base: Reveal = {
  diagramConceptId: null, attemptId: 'attempt', state: 'A', correct: true, xp: 10, critical: false, correctOptionIds: ['record'], detail: null,
  score: 1, feedback: null, missingPoints: [], correctAnswer: 'Record the damage', chosenFeedback: null, explanation: 'Record before moving.',
  sourceQuote: 'Photograph the damage before moving anything.', sourceTitle: 'Receiving SOP', sourceVersion: 3, mixUps: [], returnsThisSession: false,
  pKnownBefore: 0.2, pKnownAfter: 0.5,
}
const multi: Extract<NonNullable<Reveal['detail']>, { kind: 'multi' }> = { kind: 'multi', found: 1, total: 2, extra: 1, options: [{ id: 'a', text: 'A', correct: true, chosen: true, note: 'Yes.' }] }
const item: ItemView = { id: 'i', conceptId: 'c', conceptName: 'Receiving', format: 'mcq', stem: 'What first?', options: [], blank: null, image: null, difficulty: 1 }

function sheet(overrides: Partial<RevealSheetProps> = {}, reveal: Partial<Reveal> = {}) {
  return h(ThemeProvider, {
    children: h(RevealSheet, {
      reveal: { ...base, ...reveal }, item, answer: {}, confidence: 'sure', reflection: '', onReflection: jest.fn(), onContinue: jest.fn(), onReport: jest.fn(), ...overrides,
    }),
  })
}

beforeEach(() => jest.clearAllMocks())

test.each([
  ['A', { state: 'A' }, 'Correct, 10 XP', 'Continue'],
  ['B', { state: 'B' }, 'Correct, 10 XP', 'Continue'],
  ['C', { state: 'C', correct: false, xp: 0 }, 'Not quite', 'Continue'],
  ['D', { state: 'D', correct: false, xp: 0 }, 'Not quite', 'Got it'],
  ['P', { state: 'P', correct: false, xp: 0, detail: multi }, 'Partly right, 1 of 2 found, 1 extra', 'Continue'],
  ['ungraded', { state: 'ungraded', correct: false, xp: 0 }, 'Couldn’t grade this answer', 'Continue'],
] as const)('state %s shows its band, the continue label and Report', async (_state, reveal, announcement, label) => {
  await render(sheet({}, reveal))
  expect(screen.getByRole('header', { name: announcement })).toBeOnTheScreen()
  expect(screen.getByRole('button', { name: label })).toBeOnTheScreen()
  expect(screen.getByRole('button', { name: 'Report this question' })).toBeOnTheScreen()
})

test('no source quote means no quote block', async () => {
  await render(sheet({}, { sourceQuote: null }))
  expect(screen.queryByLabelText(/^Quote:/)).toBeNull()
  expect(screen.getByText('Record the damage')).toBeOnTheScreen()
})

test('hasCompany comes from branding and noSource is chosen without a quote', async () => {
  const bodies = require('./correct-body') as typeof import('./correct-body')
  const spy = jest.spyOn(bodies, 'CorrectBody')
  const view = await render(sheet({ branding: { name: 'Acme' } }, { sourceQuote: null }))
  const model = spy.mock.calls[0][0].model
  expect(model.variant).toBe('noSource')
  expect(model.noQuoteLine).toBe('Not quoted from your SOP')
  spy.mockClear()
  await view.unmount()
  await render(sheet({ branding: null }, { sourceQuote: null }))
  expect(spy.mock.calls[0][0].model.noQuoteLine).toBe('Not quoted from a source')
  spy.mockRestore()
})

test('wrong states render through the wrong body and partial through the partial body', async () => {
  const wrong = jest.spyOn(require('./wrong-body') as typeof import('./wrong-body'), 'WrongBody')
  const partial = jest.spyOn(require('./partial-body') as typeof import('./partial-body'), 'PartialBody')
  const correct = jest.spyOn(require('./correct-body') as typeof import('./correct-body'), 'CorrectBody')
  for (const [state, extra] of [['C', {}], ['D', {}], ['P', { detail: multi }], ['ungraded', {}], ['B', {}]] as const) {
    const view = await render(sheet({}, { state, ...extra }))
    await view.unmount()
  }
  expect([wrong.mock.calls.length, partial.mock.calls.length, correct.mock.calls.length]).toEqual([2, 1, 2])
  jest.restoreAllMocks()
})

test('continue and report fire their callbacks', async () => {
  const onContinue = jest.fn()
  const onReport = jest.fn()
  await render(sheet({ onContinue, onReport }))
  await fireEvent.press(screen.getByRole('button', { name: 'Continue' }))
  expect(onContinue).toHaveBeenCalledTimes(1)
  expect(onReport).not.toHaveBeenCalled()
  await fireEvent.press(screen.getByRole('button', { name: 'Report this question' }))
  expect(onReport).toHaveBeenCalledTimes(1)
})

test('busy disables continue', async () => {
  const onContinue = jest.fn()
  await render(sheet({ busy: true, onContinue }))
  const button = screen.getByRole('button', { name: 'Continue' })
  expect(button).toHaveProp('accessibilityState', expect.objectContaining({ busy: true, disabled: true }))
  await fireEvent.press(button)
  expect(onContinue).not.toHaveBeenCalled()
})

test('an error shows as an alert above continue', async () => {
  await render(sheet({ error: 'Could not save. Try again.' }))
  const alert = screen.getByRole('alert')
  expect(screen.getByText('Could not save. Try again.')).toBeOnTheScreen()
  const order = screen.toJSON() as { children: unknown[] }
  const text = JSON.stringify(order)
  expect(text.indexOf('Could not save')).toBeLessThan(text.indexOf('"button"'))
  expect(alert).toBeOnTheScreen()
})

test('no alert without an error', async () => {
  await render(sheet({ error: null }))
  expect(screen.queryByRole('alert')).toBeNull()
})

test.each([
  ['A', {}, 'correct'], ['B', {}, 'correct'], ['C', {}, 'miss'], ['D', {}, 'miss'], ['P', { detail: multi }, 'miss'],
] as const)('state %s fires the %s haptic once, even across rerenders and strict mode', async (state, extra, kind) => {
  const view = await render(h(StrictMode, null, sheet({}, { state, ...extra })))
  await view.rerender(h(StrictMode, null, sheet({ busy: true }, { state, ...extra })))
  expect(resultHaptic).toHaveBeenCalledTimes(1)
  expect(resultHaptic).toHaveBeenCalledWith(kind)
})

test('an ungraded result fires no haptic', async () => {
  await render(sheet({}, { state: 'ungraded' }))
  expect(resultHaptic).not.toHaveBeenCalled()
})

test('the sheet receives the band to focus, and Back is consumed by default', async () => {
  await render(sheet())
  const props = sheetProps.current as { focusRef: { current: unknown }; onBack: () => boolean; grabber?: boolean }
  expect(props.focusRef.current == null).toBe(false)
  expect(props.onBack()).toBe(true)
  const onBack = jest.fn(() => false)
  await render(sheet({ onBack }))
  expect((sheetProps.current as { onBack: () => boolean }).onBack()).toBe(false)
})

test('no accent colour appears on the reveal', async () => {
  for (const state of ['A', 'C', 'P', 'ungraded'] as const) {
    const view = await render(sheet({ error: 'x' }, { state, detail: state === 'P' ? multi : null }))
    for (const scheme of ['light', 'dark'] as const) expect(JSON.stringify(screen.toJSON())).not.toContain(themes[scheme].accent)
    await view.unmount()
  }
})
