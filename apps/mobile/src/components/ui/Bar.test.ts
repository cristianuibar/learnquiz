import { createElement as h } from 'react'
import { render, screen } from '@testing-library/react-native'
import { themes } from '@learnquiz/tokens/native'
import { ThemeProvider } from '../../theme/ThemeProvider'
import { Bar } from './Bar'

test('progress announces the supplied value text and updates as questions finish', async () => {
  const view = await render(h(ThemeProvider, { children: h(Bar, { value: 60, accessibilityLabel: 'Preparing your session', accessibilityValue: { text: '12 of 20 questions ready' } }) }))
  expect(screen.getByRole('progressbar', { name: 'Preparing your session' })).toHaveAccessibilityValue({ min: 0, max: 100, now: 60, text: '12 of 20 questions ready' })
  await view.rerender(h(ThemeProvider, { children: h(Bar, { value: 100, accessibilityLabel: 'Preparing your session', accessibilityValue: { text: '20 of 20 questions ready' } }) }))
  expect(screen.getByRole('progressbar')).toHaveAccessibilityValue({ now: 100, text: '20 of 20 questions ready' })
})

test.each([[-10, 0], [140, 100], [NaN, 0], [Infinity, 0]])('progress %s stays within its announced range', async (value, now) => {
  await render(h(ThemeProvider, { children: h(Bar, { value }) }))
  expect(screen.getByRole('progressbar')).toHaveAccessibilityValue({ min: 0, max: 100, now })
})

test('a bar inside a labelled row does not repeat its announcement', async () => {
  await render(h(ThemeProvider, { children: h(Bar, { value: 72, before: 58, benchmark: 85, accessible: false }) }))
  expect(screen.queryByRole('progressbar')).toBeNull()
})

test('mastery gains show the earlier amount and only the gain in brand', async () => {
  const view = await render(h(ThemeProvider, { children: h(Bar, { value: 58, before: 58, benchmark: 85 }) }))
  await view.rerender(h(ThemeProvider, { children: h(Bar, { value: 72, before: 58, benchmark: 85 }) }))
  const bar = screen.getByRole('progressbar')
  expect(bar.children[0]).toHaveStyle({ width: '72%', backgroundColor: themes.light.inkMuted })
  expect(bar.children[1]).toHaveStyle({ left: '58%', width: '14%', backgroundColor: themes.light.brand })
  expect(bar.children[2]).toHaveStyle({ left: '85%', top: -4, bottom: -4, width: 2, backgroundColor: themes.light.ink })
})

test('a mastery decrease leaves a single neutral fill without a gain', async () => {
  const view = await render(h(ThemeProvider, { children: h(Bar, { value: 72, before: 58 }) }))
  await view.rerender(h(ThemeProvider, { children: h(Bar, { value: 50, before: 58 }) }))
  const bar = screen.getByRole('progressbar')
  expect(bar.children).toHaveLength(1)
  expect(bar.children[0]).toHaveStyle({ width: '50%', backgroundColor: themes.light.inkMuted })
})

test('an estimate uses a dashed outline instead of a measured fill', async () => {
  await render(h(ThemeProvider, { children: h(Bar, { value: 40, estimate: true, accessibilityValue: { text: 'About 40%, placement estimate' } }) }))
  const bar = screen.getByRole('progressbar')
  expect(bar).toHaveAccessibilityValue({ text: 'About 40%, placement estimate' })
  expect(bar.children).toHaveLength(1)
  expect(bar.children[0]).toHaveStyle({ width: '40%', borderWidth: 2, borderStyle: 'dashed', borderColor: themes.light.inkMuted })
})
