import { createElement as h } from 'react'
import { Dimensions, StyleSheet } from 'react-native'
import { fireEvent, render, screen } from '@testing-library/react-native'
import type { TodayRoleView } from '@learnquiz/api/today'
import { themes } from '@learnquiz/tokens/native'
import { ThemeProvider } from '../../theme/ThemeProvider'
import { RoleCard } from './RoleCard'

const windowSize = Dimensions.get('window')
const role: TodayRoleView = {
  name: 'Warehouse picker: receiving and inventory procedures',
  pct: 66,
  benchmarkPct: 85,
  started: true,
  chip: null,
  progressLabel: '66% of 85% benchmark',
  dayLabel: 'Day 1 of 14',
  accessibleLabel: 'Warehouse picker: 66% of 85% benchmark, day 1 of 14',
}

afterEach(() => Dimensions.set({ window: windowSize }))

test.each(['light', 'dark'] as const)('%s progress emphasizes the percentage and mutes the client-built benchmark suffix', async (scheme) => {
  const view = { ...role, pct: 72, benchmarkPct: 90 }
  await render(h(ThemeProvider, { scheme, children: h(RoleCard, { role: view, onPress: jest.fn() }) }))
  expect(screen.getByText('72% of 90% benchmark', { includeHiddenElements: true })).toHaveStyle({
    color: themes[scheme].ink, fontSize: 14, lineHeight: 20, fontFamily: 'Inter_600SemiBold',
  })
  expect(screen.getByText(' of 90% benchmark', { includeHiddenElements: true, normalizer: (text) => text })).toHaveStyle({
    color: themes[scheme].inkMuted, fontSize: 14, lineHeight: 20, fontFamily: 'Inter_500Medium',
  })
  expect(screen.getByRole('link', { name: role.accessibleLabel })).toBeOnTheScreen()
  expect(screen.getAllByRole('link')).toHaveLength(1)
})

describe.each([1, 2])('at font scale %s', (fontScale) => {
  beforeEach(() => Dimensions.set({ window: { ...windowSize, width: 320, fontScale } }))

  test.each([false, true])('role metadata can wrap and grow, not started: %s', async (notStarted) => {
    const onPress = jest.fn()
    const view = notStarted ? { ...role, started: false, pct: null, chip: 'Not started' as const } : role
    await render(h(ThemeProvider, { children: h(RoleCard, { role: view, onPress }) }))

    // Jest does not measure native line breaks; verify the rendered layout permits them.
    const day = screen.getByText(role.dayLabel, { includeHiddenElements: true })
    const metadata = day.parent!
    expect(metadata).toHaveStyle({ flexDirection: 'row', flexWrap: 'wrap', justifyContent: 'space-between' })
    expect(StyleSheet.flatten(metadata.props.style).height).toBeUndefined()
    expect(StyleSheet.flatten(metadata.props.style).maxHeight).toBeUndefined()
    expect(day).toHaveStyle({ maxWidth: '100%', flexShrink: 1 })

    const progress = screen.getByText(notStarted ? 'Not started' : role.progressLabel, { includeHiddenElements: true })
    expect(notStarted ? progress.parent : progress).toHaveStyle({ maxWidth: '100%' })
    for (const text of [day, progress, screen.getByText(role.name, { includeHiddenElements: true })]) {
      expect(text.props.numberOfLines).toBeUndefined()
      expect(text.props.allowFontScaling).not.toBe(false)
      expect(text.props.maxFontSizeMultiplier).toBeUndefined()
    }

    const card = screen.getByRole('link', { name: role.accessibleLabel })
    expect(StyleSheet.flatten(card.props.style).height).toBeUndefined()
    await fireEvent.press(card)
    expect(onPress).toHaveBeenCalledTimes(1)
  })
})
