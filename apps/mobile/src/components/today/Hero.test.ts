import { createElement as h } from 'react'
import { fireEvent, render, screen } from '@testing-library/react-native'
import { todayFixtures, todayFixtureNow, todayView } from '@learnquiz/api/today'
import { ThemeProvider } from '../../theme/ThemeProvider'
import { resolveTheme } from '../../theme/resolve'
import { Hero } from './Hero'

describe.each([null, '#5B2A6E'])('brand %s', (accent) => {
  test.each(['normal', 'first', 'basics', 'building'] as const)('%s Play has a visible focus ring', async (kind) => {
    for (const scheme of ['light', 'dark'] as const) {
      const hero = todayView(todayFixtures[kind], todayFixtureNow).hero
      if (hero.kind === 'empty' || hero.kind === 'done') throw new Error('Expected Play hero')
      const onPlay = jest.fn()
      const { colors } = resolveTheme({ scheme, accent })
      await render(h(ThemeProvider, { scheme, accent, children: h(Hero, { hero, onPlay }) }))
      const play = screen.getByRole('button', { name: hero.play.accessibleLabel })
      await fireEvent(play, 'focus')
      expect(play).toHaveStyle({ outlineWidth: 2, outlineOffset: 2, outlineColor: scheme === 'light' ? colors.onBrand : colors.brand })
      await fireEvent(play, 'blur')
      expect(play).toHaveStyle({ outlineWidth: 0 })
      await fireEvent.press(play)
      expect(onPlay).toHaveBeenCalledTimes(1)

      // The call-site override must not change the Done hero's secondary action.
      const done = todayView(todayFixtures.done, todayFixtureNow).hero
      if (done.kind !== 'done') throw new Error('Expected Done hero')
      await screen.rerender(h(ThemeProvider, { scheme, accent, children: h(Hero, { hero: done, onPlay }) }))
      const secondary = screen.getByRole('button', { name: done.action.accessibleLabel })
      await fireEvent(secondary, 'focus')
      expect(secondary).toHaveStyle({ outlineWidth: 2, outlineOffset: 2, outlineColor: colors.brand })
      await screen.unmount()
    }
  })
})

test('building count uses metadata color while heading and bar keep their contrast', async () => {
  for (const scheme of ['light', 'dark'] as const) {
    const hero = todayView(todayFixtures.building, todayFixtureNow).hero
    if (hero.kind !== 'building' || !hero.status) throw new Error('Expected building status')
    const { colors } = resolveTheme({ scheme })
    await render(h(ThemeProvider, { scheme, children: h(Hero, { hero, onPlay: jest.fn() }) }))
    expect(screen.getByText(hero.status)).toHaveStyle({ color: scheme === 'light' ? colors.onBrand : colors.inkMuted })
    expect(screen.getByText(hero.title)).toHaveStyle({ color: scheme === 'light' ? colors.onBrand : colors.ink })
    const progress = screen.getByRole('progressbar', { name: 'Questions ready' })
    expect(progress).toHaveAccessibilityValue({ text: hero.status })
    expect(progress).toHaveStyle({ borderColor: scheme === 'light' ? colors.onBrand : colors.ink })
    await screen.unmount()
  }
})
