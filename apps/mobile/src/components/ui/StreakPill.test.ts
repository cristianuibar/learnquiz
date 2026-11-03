import { createElement as h } from 'react'
import { act, render, screen } from '@testing-library/react-native'
import { setUpTests, useReducedMotion } from 'react-native-reanimated'
import { themes } from '@learnquiz/tokens/native'
import { ThemeProvider } from '../../theme/ThemeProvider'
import { StreakPill } from './StreakPill'

jest.mock('react-native-reanimated', () => ({
  ...jest.requireActual('react-native-reanimated'),
  __esModule: true,
  useReducedMotion: jest.fn(() => false),
}))

setUpTests()

beforeEach(() => {
  jest.useFakeTimers()
  jest.mocked(useReducedMotion).mockReturnValue(false)
})

afterEach(() => jest.useRealTimers())

describe.each(['light', 'dark'] as const)('%s streaks', (scheme) => {
  test.each(['quiet', 'reward'] as const)('%s shows the count and announces consecutive days', async (variant) => {
    const colors = themes[scheme]
    await render(h(ThemeProvider, { scheme, children: h(StreakPill, { count: 4, variant }) }))
    expect(screen.getByRole('text', { name: '4 days in a row' })).toHaveStyle({ minHeight: 32, backgroundColor: variant === 'reward' ? colors.accent : colors.surfaceCard, borderWidth: variant === 'quiet' ? 1 : 0, borderColor: colors.border })
    expect(screen.getByRole('text', { name: '4 days in a row' }).children).toHaveLength(2)
    expect(screen.getByText('4 days')).toHaveStyle({ color: variant === 'reward' ? colors.onAccent : colors.ink, fontVariant: ['tabular-nums'] })
    expect(screen.queryByRole('image')).toBeNull()
    expect(screen.queryByRole('button')).toBeNull()
  })
})

test('the default is quiet and the count updates with the right day unit', async () => {
  const view = await render(h(ThemeProvider, { children: h(StreakPill, { count: 1 }) }))
  expect(screen.getByRole('text', { name: '1 day in a row' })).toHaveStyle({ backgroundColor: themes.light.surfaceCard })
  expect(screen.getByText('1 day')).toBeOnTheScreen()
  await view.rerender(h(ThemeProvider, { children: h(StreakPill, { count: 5 }) }))
  expect(screen.getByRole('text', { name: '5 days in a row' })).toBeOnTheScreen()
  expect(screen.getByText('5 days')).toBeOnTheScreen()
})

test('popIn fades and scales in once over 300 ms without replaying for a new count', async () => {
  const view = await render(h(ThemeProvider, { children: h(StreakPill, { count: 4, popIn: true }) }))
  expect(screen.getByRole('text', { name: '4 days in a row' })).toHaveAnimatedStyle({ opacity: 0, transform: [{ scale: 0.92 }] })
  await act(() => jest.advanceTimersByTime(150))
  const pill = screen.getByRole('text', { name: '4 days in a row' })
  expect(pill).not.toHaveAnimatedStyle({ opacity: 0 })
  expect(pill).not.toHaveAnimatedStyle({ opacity: 1 })
  await act(() => jest.advanceTimersByTime(150))
  expect(pill).toHaveAnimatedStyle({ opacity: 1, transform: [{ scale: 1 }] })
  await view.rerender(h(ThemeProvider, { children: h(StreakPill, { count: 5, popIn: true }) }))
  expect(screen.getByRole('text', { name: '5 days in a row' })).toHaveAnimatedStyle({ opacity: 1, transform: [{ scale: 1 }] })
})

test.each([false, true])('reduced motion %s leaves a non-animated pill fully visible', async (reducedMotion) => {
  jest.mocked(useReducedMotion).mockReturnValue(reducedMotion)
  await render(h(ThemeProvider, { children: h(StreakPill, { count: 4, popIn: reducedMotion }) }))
  expect(screen.getByRole('text', { name: '4 days in a row' })).toHaveAnimatedStyle({ opacity: 1, transform: [{ scale: 1 }] })
  await act(() => jest.advanceTimersByTime(300))
  expect(screen.getByRole('text', { name: '4 days in a row' })).toHaveAnimatedStyle({ opacity: 1, transform: [{ scale: 1 }] })
})
