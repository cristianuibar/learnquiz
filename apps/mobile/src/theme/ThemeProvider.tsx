import { createContext, useContext, type ReactNode } from 'react'
import { useColorScheme } from 'react-native'
import { resolveTheme, type Scheme } from './resolve'

const ThemeContext = createContext<{
  theme: ReturnType<typeof resolveTheme>
  accent?: string | null
} | null>(null)

export function ThemeProvider({ accent, scheme, children }: {
  accent?: string | null
  scheme?: Scheme
  children: ReactNode
}) {
  const parent = useContext(ThemeContext)
  const systemScheme = useColorScheme()
  const inheritedAccent = accent === undefined ? parent?.accent : accent
  const theme = resolveTheme({
    accent: inheritedAccent,
    scheme: scheme ?? parent?.theme.scheme,
    systemScheme,
  })

  return (
    <ThemeContext.Provider value={{ theme, accent: inheritedAccent }}>
      {children}
    </ThemeContext.Provider>
  )
}

export function useTheme() {
  const context = useContext(ThemeContext)
  if (!context) throw new Error('useTheme must be used within a ThemeProvider')
  return context.theme
}
