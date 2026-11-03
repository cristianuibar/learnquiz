import { createElement as h } from 'react'
import { fireEvent, render, screen } from '@testing-library/react-native'
import { themes, typography } from '@learnquiz/tokens/native'
import { ThemeProvider } from '../../theme/ThemeProvider'
import { Button } from './Button'
import { Card } from './Card'
import { Chip } from './Chip'
import { StatusMark } from './StatusMark'
import { Text } from './Text'

test.each(['light', 'dark'] as const)('cards keep their content and actions usable in %s mode', async (scheme) => {
  const onPress = jest.fn()
  await render(h(ThemeProvider, { scheme, children: h(Card, { accessibilityLabel: 'Daily quest' },
    h(Text, null, 'Clear your reviews'), h(Button, { onPress, children: 'Practise' }),
  ) }))
  expect(screen.getByLabelText('Daily quest')).toHaveStyle({ backgroundColor: themes[scheme].surfaceCard, borderWidth: 1, borderColor: themes[scheme].border, borderRadius: 8, paddingHorizontal: 16, paddingVertical: 16 })
  expect(screen.getByText('Clear your reviews')).toBeOnTheScreen()
  await fireEvent.press(screen.getByRole('button', { name: 'Practise' }))
  expect(onPress).toHaveBeenCalledTimes(1)
})

test('tight cards reduce vertical padding and accept token padding overrides', async () => {
  const view = await render(h(ThemeProvider, { children: h(Card, { variant: 'tight', accessibilityLabel: 'Receiving' }, h(Text, null, '72%')) }))
  expect(screen.getByLabelText('Receiving')).toHaveStyle({ paddingHorizontal: 16, paddingVertical: 12 })
  await view.rerender(h(ThemeProvider, { children: h(Card, { variant: 'tight', padding: 6, paddingHorizontal: 2, accessibilityLabel: 'Receiving' }, h(Text, null, '72%')) }))
  expect(screen.getByLabelText('Receiving')).toHaveStyle({ paddingHorizontal: 8, paddingVertical: 24 })
  await view.rerender(h(ThemeProvider, { children: h(Card, { paddingVertical: 3, accessibilityLabel: 'Receiving' }, h(Text, null, '72%')) }))
  expect(screen.getByLabelText('Receiving')).toHaveStyle({ paddingHorizontal: 16, paddingVertical: 12 })
})

describe.each(['light', 'dark'] as const)('%s status chips', (scheme) => {
  const colors = themes[scheme]
  test.each([
    ['none', 'Not started', colors.inkMuted, colors.surfaceSunken, colors.inkMuted, 'solid'],
    ['mastered', 'Mastered', colors.feedbackCorrect, colors.feedbackCorrectTint, colors.feedbackCorrect, 'solid'],
    ['learning', 'Still learning', colors.feedbackLearning, colors.feedbackLearningTint, colors.feedbackLearning, 'solid'],
    ['estimate', 'Estimate', colors.inkMuted, undefined, colors.borderStrong, 'dashed'],
    ['critical', 'Critical', colors.ink, colors.surfaceCard, colors.borderStrong, 'solid'],
    ['locked', 'Locked', colors.inkMuted, colors.surfaceSunken, colors.inkMuted, 'solid'],
  ] as const)('%s keeps its word visible with decorative marks hidden from TalkBack', async (variant, label, color, backgroundColor, borderColor, borderStyle) => {
    await render(h(ThemeProvider, { scheme, children: h(Chip, { variant }) }))
    expect(screen.getByText(label)).toHaveStyle({ ...typography.chip, color })
    const chip = screen.getByRole('text', { name: label })
    expect(chip).toHaveStyle({ minHeight: 28, backgroundColor, borderWidth: 1, borderColor, borderStyle })
    expect(chip.children).toHaveLength(variant === 'estimate' ? 1 : 2)
    expect(screen.queryByRole('image')).toBeNull()
    expect(screen.queryByRole('button')).toBeNull()
  })

  test('records keep neutral styling as their text changes', async () => {
    const view = await render(h(ThemeProvider, { scheme, children: h(Chip, { variant: 'neutral', children: 'Corrected Oct 30' }) }))
    expect(screen.getByRole('text', { name: 'Corrected Oct 30' })).toHaveStyle({ backgroundColor: colors.surfaceSunken, borderColor: colors.border })
    expect(screen.getByText('Corrected Oct 30')).toHaveStyle({ color: colors.ink })
    await view.rerender(h(ThemeProvider, { scheme, children: h(Chip, { variant: 'neutral', children: 'Comes back first' }) }))
    expect(screen.getByText('Comes back first')).toHaveStyle({ color: colors.ink })
    expect(screen.queryByText('Corrected Oct 30')).toBeNull()
  })
})

test('critical counts retain the visible word', async () => {
  await render(h(ThemeProvider, { children: h(Chip, { variant: 'critical', children: '3 critical' }) }))
  expect(screen.getByRole('text', { name: '3 critical' })).toBeOnTheScreen()
  expect(screen.getByText('3 critical')).toBeOnTheScreen()
})

test.each(['light', 'dark'] as const)('quest marks announce completion without becoming controls in %s mode', async (scheme) => {
  const view = await render(h(ThemeProvider, { scheme, children: h(StatusMark, {}) }))
  const notDone = screen.getByRole('image', { name: 'Not done' })
  expect(notDone).toHaveStyle({ width: 20, height: 20 })
  expect(notDone.queryAll((node) => node.type === 'RNSVGCircle')[0]).toHaveProp('strokeDasharray', ['2', '5.07'])
  await view.rerender(h(ThemeProvider, { scheme, children: h(StatusMark, { done: true }) }))
  const done = screen.getByRole('image', { name: 'Done' })
  expect(done).toHaveStyle({ backgroundColor: themes[scheme].brandTint })
  expect(done.children[0]).toHaveProp('width', 16)
  expect(done.queryAll((node) => node.type === 'RNSVGPath')[0]).toHaveProp('d')
  expect(screen.queryByRole('image', { name: 'Not done' })).toBeNull()
  expect(screen.queryByRole('button')).toBeNull()
  expect(screen.queryByRole('checkbox')).toBeNull()
})

test('a quest mark inside an already labelled row can suppress its announcement', async () => {
  await render(h(ThemeProvider, { children: h(StatusMark, { done: true, accessible: false }) }))
  expect(screen.queryByRole('image')).toBeNull()
  expect(screen.queryByLabelText('Done')).toBeNull()
})
