import { createElement } from 'react'
import { Text, useColorScheme } from 'react-native'
import { render, screen } from '@testing-library/react-native'
import { deriveBrand } from '@learnquiz/tokens'
import { themes } from '@learnquiz/tokens/native'
import { ThemeProvider, useTheme } from './ThemeProvider'

jest.mock('react-native/Libraries/Utilities/useColorScheme', () => ({
  __esModule: true,
  default: jest.fn(),
}))

const colorScheme = jest.mocked(useColorScheme)

function Probe() {
  const { scheme, colors, typography } = useTheme()
  return createElement(Text, { style: typography.body }, `${scheme} ${colors.brand}`)
}

beforeEach(() => {
  colorScheme.mockReturnValue('light')
})

test('updates the displayed theme when the OS scheme changes', async () => {
  const view = await render(createElement(ThemeProvider, { children: createElement(Probe) }))
  expect(screen.getByText(`light ${themes.light.brand}`)).toBeOnTheScreen()
  colorScheme.mockReturnValue('dark')
  await view.rerender(createElement(ThemeProvider, { children: createElement(Probe) }))
  expect(screen.getByText(`dark ${themes.dark.brand}`)).toBeOnTheScreen()
})

test('lets a nested invitation theme change its accent and inherit the parent scheme', async () => {
  const accent = '#604080'
  await render(createElement(ThemeProvider, {
    scheme: 'dark',
    children: [
      createElement(Probe, { key: 'parent' }),
      createElement(ThemeProvider, { key: 'invitation', accent, children: createElement(Probe) }),
    ],
  }))
  expect(screen.getByText(`dark ${themes.dark.brand}`)).toBeOnTheScreen()
  expect(screen.getByText(`dark ${deriveBrand(accent).dark.brand}`)).toBeOnTheScreen()
})

test('inherits a parent accent and allows a nested provider to reset it', async () => {
  const accent = '#604080'
  await render(createElement(ThemeProvider, {
    accent,
    children: [
      createElement(ThemeProvider, { key: 'inherited', children: createElement(Probe) }),
      createElement(ThemeProvider, { key: 'reset', accent: null, children: createElement(Probe) }),
    ],
  }))
  expect(screen.getByText(`light ${deriveBrand(accent).light.brand}`)).toBeOnTheScreen()
  expect(screen.getByText(`light ${themes.light.brand}`)).toBeOnTheScreen()
})
