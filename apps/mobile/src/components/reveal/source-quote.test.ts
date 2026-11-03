import { createElement as h } from 'react'
import { render, screen } from '@testing-library/react-native'
import { themes } from '@learnquiz/tokens/native'
import { ThemeProvider } from '../../theme/ThemeProvider'
import { SourceQuote } from './source-quote'

function quote(props: { sourceTitle: string | null; sourceVersion: number | null }, scheme: 'light' | 'dark' = 'light') {
  return render(h(ThemeProvider, { scheme, children: h(SourceQuote, { quote: 'Photograph the damage.', ...props }) }))
}

describe.each(['light', 'dark'] as const)('%s source quote', (scheme) => {
  test('shows the quote in typographic marks above a muted title and version caption', async () => {
    const c = themes[scheme]
    await quote({ sourceTitle: 'Receiving SOP', sourceVersion: 3 }, scheme)
    const node = screen.getByLabelText('Quote: Photograph the damage., Receiving SOP · v3')
    expect(node).toHaveStyle({ backgroundColor: c.surfaceSunken, borderRadius: 8, paddingVertical: 12, paddingHorizontal: 16, gap: 8 })
    expect(screen.getByText('“Photograph the damage.”')).toHaveStyle({ color: c.ink, fontSize: 15, lineHeight: 22 })
    expect(screen.getByText('Receiving SOP · v3')).toHaveStyle({ color: c.inkMuted, fontSize: 13, lineHeight: 18 })
  })
})

test('is one accessible node', async () => {
  await quote({ sourceTitle: 'Receiving SOP', sourceVersion: 3 })
  expect(screen.getByLabelText(/^Quote:/).props.accessible).toBe(true)
})

test('shows the title alone without a version', async () => {
  await quote({ sourceTitle: 'Receiving SOP', sourceVersion: null })
  expect(screen.getByText('Receiving SOP')).toBeOnTheScreen()
  expect(screen.getByLabelText('Quote: Photograph the damage., Receiving SOP')).toBeOnTheScreen()
})

test('omits the caption row without a title', async () => {
  await quote({ sourceTitle: null, sourceVersion: 3 })
  expect(screen.getByLabelText('Quote: Photograph the damage.')).toBeOnTheScreen()
  expect(screen.queryByText(/v3/)).toBeNull()
  expect(screen.getByText('“Photograph the damage.”')).toBeOnTheScreen()
})
