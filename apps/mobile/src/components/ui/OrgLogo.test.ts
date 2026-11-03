import { createElement as h } from 'react'
import { act, render, screen } from '@testing-library/react-native'
import { Image } from 'expo-image'
import { ThemeProvider } from '../../theme/ThemeProvider'
import { OrgLogo } from './OrgLogo'

jest.mock('expo-image', () => ({ Image: jest.fn(() => null) }))

test.each([['Northwind Logistics', 'NL'], ['Acme', 'AC'], ['   ', 'LQ']])('a missing logo for %s falls back to two initials', async (name, initials) => {
  await render(h(ThemeProvider, { children: h(OrgLogo, { name }) }))
  expect(screen.getByText(initials, { includeHiddenElements: true })).toBeOnTheScreen()
  expect(screen.queryByText(initials)).toBeNull()
})

test('a failed logo falls back to initials and a replacement source can load', async () => {
  const source = { uri: 'https://example.com/logo.png' }
  const view = await render(h(ThemeProvider, { children: h(OrgLogo, { name: 'Northwind Logistics', source }) }))
  expect(screen.queryByText('NL', { includeHiddenElements: true })).toBeNull()
  const onError = jest.mocked(Image).mock.lastCall?.[0].onError
  expect(onError).toBeDefined()
  await act(() => onError?.({ error: 'Image unavailable' }))
  expect(screen.getByText('NL', { includeHiddenElements: true })).toBeOnTheScreen()
  await view.rerender(h(ThemeProvider, { children: h(OrgLogo, { name: 'Northwind Logistics', source: { uri: 'https://example.com/replacement.png' } }) }))
  expect(screen.queryByText('NL', { includeHiddenElements: true })).toBeNull()
})
