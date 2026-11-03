import { brandProblem, deriveBrand } from '@learnquiz/tokens'
import { themes, typography, space, radius, sizes } from '@learnquiz/tokens/native'

export type Scheme = 'system' | 'light' | 'dark'

export function resolveTheme({
  scheme = 'system',
  systemScheme,
  accent,
}: {
  scheme?: Scheme
  systemScheme?: 'light' | 'dark' | 'unspecified' | null
  accent?: string | null
} = {}) {
  const resolved = scheme === 'system' ? (systemScheme === 'dark' ? 'dark' : 'light') : scheme
  const brand = accent && brandProblem(accent) === null ? deriveBrand(accent)[resolved] : {}

  return {
    colors: { ...themes[resolved], ...brand },
    typography,
    space,
    radius,
    sizes,
    scheme: resolved,
  }
}
