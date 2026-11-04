import { createElement as h } from 'react'
import { render, screen } from '@testing-library/react-native'
import type { ItemView } from '@learnquiz/api'
import { ThemeProvider } from '../../theme/ThemeProvider'
import { ClozeBody } from './cloze'

const item: ItemView = {
  id: 'i', conceptId: 'c', conceptName: 'Units', format: 'cloze',
  stem: '', options: [], blank: { numeric: false }, image: null, difficulty: 1,
}

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
