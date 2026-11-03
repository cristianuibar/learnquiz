import { describe, expect, it } from 'vitest'
import themeCss from '../theme.css?raw'
import { brandCss, brandProblem, contrast, deriveBrand } from './brand.ts'
import { renderThemeCss } from './css.ts'
import { colors } from './tokens.ts'
import { shadows } from './native.ts'

const surfaces = [
  'surface-page', 'surface-card', 'surface-sunken', 'brand-tint', 'accent-tint',
  'feedback-correct-tint', 'feedback-wrong-tint', 'feedback-learning-tint',
] as const

for (const [theme, index] of [['light', 0], ['dark', 1]] as const) {
  describe(`${theme} contrast`, () => {
    it.each(['on-brand', 'surface-page'] as const)('brand against %s meets AA', (background) => {
      expect(contrast(colors.brand[index], colors[background][index])).toBeGreaterThanOrEqual(4.5)
    })

    it.each(surfaces)('ink against %s meets AA', (surface) => {
      expect(contrast(colors.ink[index], colors[surface][index])).toBeGreaterThanOrEqual(4.5)
    })

    it('on-accent against accent meets AA', () => {
      expect(contrast(colors['on-accent'][index], colors.accent[index])).toBeGreaterThanOrEqual(4.5)
    })
  })
}

describe('brandProblem', () => {
  it.each(['#0E5A73', '#5B2A6E'])('accepts %s', (color) => {
    expect(brandProblem(color)).toBeNull()
  })

  it.each([
    ['#00AA00', 'reserved for answer feedback'],
    ['#D32F2F', 'reserved for answer feedback'],
    ['#FFFF00', '4.5:1 contrast'],
    ['teal', '#RRGGBB'],
    ['#5B2A6E; color: red', '#RRGGBB'],
  ])('rejects %s and emits no brand CSS', (color, reason) => {
    expect(brandProblem(color)).toContain(reason)
    expect(brandCss(color)).toBe('')
  })
})

describe('deriveBrand', () => {
  const brand = deriveBrand('#5B2A6E')

  it.each([['light', 0], ['dark', 1]] as const)('keeps plum readable in %s', (theme, index) => {
    const palette = brand[theme]
    expect(contrast(palette.brand, colors['surface-page'][index])).toBeGreaterThanOrEqual(4.5)
    expect(contrast(palette.brand, palette.onBrand)).toBeGreaterThanOrEqual(4.5)
    expect(contrast(palette.brand, palette.onBrand)).toBe(
      Math.max(contrast(palette.brand, '#FFFFFF'), contrast(palette.brand, '#14181F')),
    )
  })
})

it('keeps the shipped theme CSS in sync with its renderer', () => {
  expect(themeCss).toBe(renderThemeCss())
})

it.each(['light', 'dark'] as const)('derives the native %s raised shadow from the token', (theme) => {
  expect(shadows[theme].raised).toEqual({
    shadowColor: theme === 'light' ? 'rgba(20,24,31,0.12)' : 'rgba(0,0,0,0.5)',
    shadowOffset: { width: 0, height: 8 },
    shadowOpacity: 1,
    shadowRadius: 12,
  })
})
