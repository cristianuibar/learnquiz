import { colors, typography as styles } from './tokens.ts'

export { space, radius, sizes, duration } from './tokens.ts'
export const easing = [0.2, 0, 0, 1] as const

type CamelCase<S extends string> = S extends `${infer Head}-${infer Tail}`
  ? `${Head}${Capitalize<CamelCase<Tail>>}`
  : S

export type Theme = { [Key in keyof typeof colors as CamelCase<Key>]: string }

function camelCase(value: string): string {
  return value.replace(/-([a-z0-9])/g, (_, letter: string) => letter.toUpperCase())
}

function theme(index: 0 | 1): Theme {
  return Object.fromEntries(
    Object.entries(colors).map(([name, values]) => [camelCase(name), values[index]]),
  ) as Theme
}

export const themes: { light: Theme; dark: Theme } = { light: theme(0), dark: theme(1) }

const fonts = {
  400: 'Inter_400Regular',
  500: 'Inter_500Medium',
  600: 'Inter_600SemiBold',
  700: 'Inter_700Bold',
} as const

export type TypographyStyle = {
  fontSize: number
  lineHeight: number
  letterSpacing: number
  fontFamily: (typeof fonts)[keyof typeof fonts]
}

export const typography = Object.fromEntries(
  Object.entries(styles).map(([name, style]) => [camelCase(name), {
    fontSize: style.fontSize,
    lineHeight: style.lineHeight,
    letterSpacing: style.letterSpacing * style.fontSize,
    fontFamily: fonts[style.fontWeight],
  }]),
) as { [Key in keyof typeof styles as CamelCase<Key>]: TypographyStyle }
