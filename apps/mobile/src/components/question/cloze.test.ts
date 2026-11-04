import { createElement as h } from 'react'
import { fireEvent, render, screen } from '@testing-library/react-native'
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
