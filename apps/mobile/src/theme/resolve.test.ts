import { brandProblem, contrast, deriveBrand } from '@learnquiz/tokens'
import { themes, shadows, typography, space, radius, sizes } from '@learnquiz/tokens/native'
import { resolveTheme } from './resolve'

describe('resolveTheme', () => {
  test.each(['light', 'dark'] as const)('uses an explicit %s scheme over the OS scheme', (scheme) => {
    const theme = resolveTheme({ scheme, systemScheme: scheme === 'light' ? 'dark' : 'light' })
    expect(theme.scheme).toBe(scheme)
    expect(theme.colors).toEqual(themes[scheme])
    expect(theme).toMatchObject({ typography, space, radius, sizes, shadow: shadows[scheme] })
  })

  test.each(['light', 'dark'] as const)('follows the %s OS scheme in system mode', (systemScheme) => {
    expect(resolveTheme({ scheme: 'system', systemScheme })).toMatchObject({
      scheme: systemScheme,
      colors: themes[systemScheme],
    })
  })

  test.each([null, undefined, 'unspecified'] as const)('defaults to light for OS preference %s', (systemScheme) => {
    expect(resolveTheme({ systemScheme })).toMatchObject({ scheme: 'light', colors: themes.light })
    expect(resolveTheme().colors).toEqual(themes.light)
  })

  test.each(['light', 'dark'] as const)('applies an accessible company accent in %s mode', (scheme) => {
    const accent = '#604080'
    expect(brandProblem(accent)).toBeNull()
    const theme = resolveTheme({ scheme, accent })
    expect(theme.colors).toEqual({ ...themes[scheme], ...deriveBrand(accent)[scheme] })
    expect(theme.colors.brand).not.toBe(themes[scheme].brand)
    expect(contrast(theme.colors.brand, theme.colors.surfacePage)).toBeGreaterThanOrEqual(4.5)
    expect(contrast(theme.colors.brand, theme.colors.onBrand)).toBeGreaterThanOrEqual(4.5)
    expect(resolveTheme({ scheme }).colors).toEqual(themes[scheme])
  })

  test.each(['invalid', '#FFFFFF', '#008000', '#CC0000', '', null, undefined])(
    'keeps default colors for an invalid or absent accent %s', (accent) => {
      expect(resolveTheme({ accent }).colors).toEqual(themes.light)
      expect(resolveTheme({ scheme: 'dark', accent }).colors).toEqual(themes.dark)
    },
  )
})
