import { createElement as h } from 'react'
import { render, screen } from '@testing-library/react-native'
import { conceptRows } from '../../lib/unit'
import { ThemeProvider } from '../../theme/ThemeProvider'
import { ConceptRow } from './ConceptRow'

const concept = { id: 'c1', order: 1, name: 'Damaged pallet: record before moving', summary: '', visual: false, grounded: true,
  critical: true, answeredCount: 4, pKnown: 0.72, measured: true, status: 'learning' as const }

test('TalkBack reads a concept row as one stop with its name and value, and skips the bar and chips', async () => {
  const [row] = conceptRows({ concepts: [concept] }, 0.85)
  await render(h(ThemeProvider, { children: h(ConceptRow, { row, benchmark: 85, first: true }) }))
  // The design's h3: the row is the concept's heading, read with its value.
  const stop = screen.getByRole('header', { name: 'Damaged pallet: record before moving, 72%, Still learning, critical, benchmark 85%' })
  expect(stop).toBeOnTheScreen()
  expect(stop.props.accessible).toBe(true)
  // The bar is drawn but hidden from TalkBack; the chips are visible text inside the one stop.
  expect(screen.queryByRole('progressbar')).toBeNull()
  expect(screen.queryByRole('text', { name: 'Still learning' })).toBeNull()
  expect(screen.queryByRole('text', { name: 'Critical' })).toBeNull()
  expect(screen.getByText('Still learning', { includeHiddenElements: true })).toBeOnTheScreen()
  expect(screen.getByText('72%', { includeHiddenElements: true })).toBeOnTheScreen()
  expect(screen.getByText('Damaged pallet: record before moving', { includeHiddenElements: true })).toBeOnTheScreen()
  // Nothing inside the row is a separate accessible element.
  expect(screen.queryAllByText(/./)).toEqual([])
  expect(screen.queryAllByRole('text')).toEqual([])
  expect(screen.getAllByRole('header')).toEqual([stop])
})
