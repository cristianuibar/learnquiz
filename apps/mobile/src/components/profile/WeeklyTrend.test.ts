import { createElement as h } from 'react'
import { render, screen } from '@testing-library/react-native'
import type { Profile } from '@learnquiz/api/progress'
import { ThemeProvider } from '../../theme/ThemeProvider'
import { WeeklyTrend } from './WeeklyTrend'

const Native: typeof import('react-native') = require('react-native')
const day = 86_400_000
const oct19 = Date.UTC(2026, 9, 19)
const profile = {
  name: 'Jordan', role: null, started: true, mastery: 0.66, benchmark: 0.85, onboarding: { day: 16, days: 30 },
  proficiency: { achievedAt: null, days: null, estimatedDays: null, projectedAt: Date.UTC(2026, 10, 12) },
  weeks: [
    { start: oct19, mastery: 0.29, sessions: 5, partial: false },
    { start: oct19 + 7 * day, mastery: 0.48, sessions: 6, partial: false },
    { start: oct19 + 14 * day, mastery: 0.66, sessions: 2, partial: true },
  ],
} as unknown as Profile

// The native SVG text nodes: each RNSVGText carries its font, and its TSpan the content.
type Node = { type: string; props: Record<string, unknown>; children?: Node[] | null }
function svgTexts() {
  const found: { text: string; fontSize: unknown }[] = []
  const walk = (node: Node | null) => {
    if (!node || typeof node !== 'object') return
    if (node.type === 'RNSVGText') {
      const text = (node.children ?? []).map((child) => String(child.props.content ?? '')).join('')
      found.push({ text, fontSize: (node.props.font as { fontSize?: number }).fontSize })
    }
    for (const child of node.children ?? []) walk(child)
  }
  const tree = screen.toJSON() as unknown as Node | Node[] | null
  for (const node of Array.isArray(tree) ? tree : [tree]) walk(node)
  return found
}

afterEach(() => { jest.restoreAllMocks() })

test.each([[1, 12, 188], [2, 18, 209]])('at font scale %s the chart labels are %s px and the chart is %s high', async (fontScale, size, height) => {
  jest.spyOn(Native, 'useWindowDimensions').mockReturnValue({ width: 360, height: 740, scale: 3, fontScale })
  await render(h(ThemeProvider, { children: h(WeeklyTrend, { profile }) }))
  const chart = screen.getByRole('image', { name: /^Line chart of weekly role mastery: 29% in the week of Oct 19 \(5 sessions\)/ })
  expect(chart).toHaveStyle({ minHeight: height })
  const texts = svgTexts()
  expect(texts.length).toBeGreaterThan(0)
  for (const label of ['Nov 12', '66%', 'so far']) expect(texts.find(({ text }) => text.trim() === label)?.fontSize).toBe(size)
  expect(texts.find(({ text }) => text === 'Sessions')?.fontSize).toBe(Math.round(13 * Math.min(fontScale, 1.5)))
})
