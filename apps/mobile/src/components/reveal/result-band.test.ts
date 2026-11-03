import { createElement as h, createRef } from 'react'
import type { View } from 'react-native'
import { render, screen } from '@testing-library/react-native'
import { themes } from '@learnquiz/tokens/native'
import type { RevealModel } from '@learnquiz/api/reveal'
import { ThemeProvider } from '../../theme/ThemeProvider'
import { ResultBand } from './result-band'

const base: RevealModel = {
  variant: 'correctSure', tone: 'correct', heading: 'Correct', xpText: '+10 XP', counts: null, announcement: 'Correct, 10 XP',
  continueLabel: 'Continue', showWhy: true, openByDefault: false, noQuoteLine: null, partialLines: [],
}
const models = {
  correct: base,
  wrong: { ...base, variant: 'notQuite', tone: 'wrong', heading: 'Not quite', xpText: null, announcement: 'Not quite' },
  learning: { ...base, variant: 'partial', tone: 'learning', heading: 'Partly right', xpText: null, counts: '1 of 2 found · 1 extra', announcement: 'Partly right, 1 of 2 found, 1 extra' },
  neutral: { ...base, variant: 'ungraded', tone: 'neutral', heading: 'Couldn’t grade this answer', xpText: null, announcement: 'Couldn’t grade this answer' },
} satisfies Record<string, RevealModel>

function band(model: RevealModel, scheme: 'light' | 'dark', props: Record<string, unknown> = {}) {
  return render(h(ThemeProvider, { scheme, children: h(ResultBand, { model, ...props }) }))
}

describe.each(['light', 'dark'] as const)('%s result band', (scheme) => {
  const c = themes[scheme]
  const tones = {
    correct: { tint: c.feedbackCorrectTint, solid: c.feedbackCorrect },
    wrong: { tint: c.feedbackWrongTint, solid: c.feedbackWrong },
    learning: { tint: c.feedbackLearningTint, solid: c.feedbackLearning },
    neutral: { tint: c.surfaceSunken, solid: c.ink },
  }

  test.each(Object.keys(models) as (keyof typeof models)[])('%s tone paints the band, disc and heading', async (tone) => {
    const model = models[tone]
    await band(model, scheme)
    const node = screen.getByRole('header', { name: model.announcement })
    expect(node).toHaveStyle({ backgroundColor: tones[tone].tint, flexDirection: 'row', alignItems: 'center', gap: 12, paddingTop: 24, paddingBottom: 16, paddingHorizontal: 16 })
    expect(screen.getByText(model.heading)).toHaveStyle({ color: tones[tone].solid, flex: 1, fontSize: 20, lineHeight: 28 })
    const disc = node.children[0] as unknown as { props: { style: unknown } }
    expect(disc.props.style).toMatchObject({ width: 32, height: 32, borderRadius: 9999, backgroundColor: tones[tone].solid })
  })

  test('the xp text is muted with tabular numbers and the heading keeps the tone colour', async () => {
    await band(models.correct, scheme)
    expect(screen.getByText('+10 XP')).toHaveStyle({ color: c.inkMuted, fontVariant: ['tabular-nums'], fontSize: 14 })
    expect(screen.getByRole('header', { name: 'Correct, 10 XP' })).toBeOnTheScreen()
  })

  test('partial counts use the band colour', async () => {
    await band(models.learning, scheme)
    expect(screen.getByText('1 of 2 found · 1 extra')).toHaveStyle({ color: c.feedbackLearning, fontVariant: ['tabular-nums'] })
  })
})

test('the band is one accessible node with no live region and no separately accessible children', async () => {
  await band(models.correct, 'light')
  const node = screen.getByRole('header', { name: 'Correct, 10 XP' })
  expect(node.props.accessible).toBe(true)
  expect(node.props.accessibilityLiveRegion).toBeUndefined()
  expect(screen.getAllByRole('header')).toHaveLength(1)
})

test('wrong and neutral bands show no right side text', async () => {
  await band(models.wrong, 'light')
  expect(screen.queryByText(/XP|found/)).toBeNull()
  expect(screen.getByRole('header', { name: 'Not quite' }).children).toHaveLength(2)
})

test('compact tightens the padding', async () => {
  await band(models.correct, 'light', { compact: true })
  expect(screen.getByRole('header', { name: 'Correct, 10 XP' })).toHaveStyle({ paddingTop: 12, paddingBottom: 12, paddingHorizontal: 16 })
})

test('the ref reaches the band so the sheet can focus it', async () => {
  const ref = createRef<View>()
  await band(models.correct, 'light', { ref })
  expect(ref.current == null).toBe(false)
})

test('no band uses the accent colour', async () => {
  for (const tone of Object.keys(models) as (keyof typeof models)[]) {
    const view = await band(models[tone], 'light')
    expect(JSON.stringify(screen.toJSON())).not.toContain(themes.light.accent)
    view.unmount()
  }
})
