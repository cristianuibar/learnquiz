import { createElement as h } from 'react'
import { fireEvent, render, screen } from '@testing-library/react-native'
import { Dimensions } from 'react-native'
import { themes } from '@learnquiz/tokens/native'
import type { ItemView } from '@learnquiz/api'
import { ThemeProvider } from '../../theme/ThemeProvider'
import { ClozeBody } from './cloze'

const item: ItemView = {
  id: 'i', conceptId: 'c', conceptName: 'Units', format: 'cloze',
  stem: '', options: [], blank: { numeric: false }, image: null, difficulty: 1,
}

test.each(['light', 'dark'] as const)('%s blank adds an offset focus ring without resizing', async (scheme) => {
  const props = { item: { ...item, stem: 'Never lift more than ____ kg.', blank: { numeric: true } }, answer: {}, onAnswer: jest.fn(), marks: null, disabled: false }
  await render(h(ThemeProvider, { scheme, children: h(ClozeBody, props) }))
  const field = screen.getByLabelText('Missing number')
  expect(field).toHaveProp('autoFocus', true)
  expect(field).toHaveProp('keyboardType', 'number-pad')
  await fireEvent(field, 'focus')
  expect(field).toHaveStyle({ outlineWidth: 2, outlineOffset: 2, outlineColor: themes[scheme].brand, borderWidth: 2, borderColor: themes[scheme].brand, width: 88, minHeight: 36 })
  await fireEvent(field, 'blur')
  expect(field).toHaveStyle({ outlineWidth: 0, borderWidth: 2, borderColor: themes[scheme].brand, width: 88, minHeight: 36 })
  await screen.rerender(h(ThemeProvider, { scheme, children: h(ClozeBody, { ...props, disabled: true }) }))
  expect(screen.getByLabelText('Missing number')).toHaveProp('editable', false)
})

test.each([
  ['costs $____.', '$', '.'],
  ['(____) items', '(', ')'],
  ['the "____" sign', '"', '"'],
  ['a ____kg load', '', 'kg'],
  ["the ____'s door", '', "'s"],
])('attached characters share a gapless nowrap row with the field: %s', async (stem, prefix, suffix) => {
  await render(h(ThemeProvider, { children: h(ClozeBody, {
    item: { ...item, stem }, answer: {}, onAnswer: jest.fn(), marks: null, disabled: false,
  }) }))
  const field = screen.getByLabelText('Missing word')
  for (const affix of new Set([prefix, suffix].filter(Boolean))) {
    for (const text of screen.getAllByText(affix)) expect(text.parent).toBe(field.parent)
  }
  expect(field.parent).toHaveStyle({ flexDirection: 'row', flexWrap: 'nowrap', gap: 0 })
  expect(screen.getByRole('text', { name: stem.replace('____', 'blank') })).toBeOnTheScreen()
})

test.each(['light', 'dark'] as const)('%s focused blank reserves ring clearance at 200%% font scale', async (scheme) => {
  const windowSize = Dimensions.get('window')
  Dimensions.set({ window: { ...windowSize, width: 320, fontScale: 2 } })
  try {
    await render(h(ThemeProvider, { scheme, children: h(ClozeBody, {
      item: { ...item, stem: '(____).' }, answer: {}, onAnswer: jest.fn(), marks: null, disabled: false,
    }) }))
    const field = screen.getByLabelText('Missing word')
    await fireEvent(field, 'focus')
    expect(screen.getByText('(').parent).toBe(field.parent)
    expect(screen.getByText(').').parent).toBe(field.parent)
    expect(screen.getByRole('text', { name: '(blank).' }).parent).toHaveStyle({ flexWrap: 'wrap' })
    expect(field.props.allowFontScaling).not.toBe(false)
    expect(field.props.maxFontSizeMultiplier).toBeUndefined()
    expect(field).toHaveStyle({ marginHorizontal: 4, outlineWidth: 2, outlineOffset: 2, width: 88, minHeight: 36 })
  } finally {
    Dimensions.set({ window: windowSize })
  }
})

test.each([
  { disabled: true, marks: null },
  { disabled: false, marks: {} },
])('focused blank hides its ring when made read-only: %j', async (readOnly) => {
  const props = { item, answer: {}, onAnswer: jest.fn(), marks: null, disabled: false }
  const body = (state = {}) => h(ThemeProvider, { children: h(ClozeBody, { ...props, ...state }) })
  await render(body())
  const field = screen.getByLabelText('Missing word')
  await fireEvent(field, 'focus')
  expect(field).toHaveStyle({ outlineWidth: 2 })
  await screen.rerender(body(readOnly))
  expect(field).toHaveProp('editable', false)
  expect(field).toHaveStyle({ outlineWidth: 0 })
})

test('focused blank shows its ring only while editable, including when editing resumes', async () => {
  const body = (disabled: boolean) => h(ThemeProvider, { children: h(ClozeBody, {
    item, answer: {}, onAnswer: jest.fn(), marks: null, disabled,
  }) })
  await render(body(false))
  const field = screen.getByLabelText('Missing word')
  expect(field).toHaveProp('autoFocus', true)
  await fireEvent(field, 'focus')
  expect(field).toHaveStyle({ outlineWidth: 2 })
  await screen.rerender(body(true))
  expect(field).toHaveStyle({ outlineWidth: 0 })
  await screen.rerender(body(false))
  expect(field).toHaveProp('autoFocus', true)
  expect(field).toHaveProp('editable', true)
  expect(field).toHaveStyle({ outlineWidth: 2 })
  await fireEvent(field, 'blur')
  expect(field).toHaveStyle({ outlineWidth: 0 })
})
