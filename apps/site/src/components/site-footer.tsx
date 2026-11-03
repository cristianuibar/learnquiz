import { useEffect, useState } from 'react'
import { useLocation } from '@tanstack/react-router'
import { githubUrl, signInUrl } from '../site-config'
import { applyTheme, readTheme, type ThemeChoice } from '../theme'
import { Logo } from './ui/logo'

const themeOptions: { value: ThemeChoice; label: string }[] = [
  { value: 'system', label: 'System' },
  { value: 'light', label: 'Light' },
  { value: 'dark', label: 'Dark' },
]

function ThemeSwitch() {
  const [choice, setChoice] = useState<ThemeChoice>('system')
  useEffect(() => {
    setChoice(readTheme())
  }, [])
  function pick(next: ThemeChoice) {
    applyTheme(next)
    setChoice(next)
  }
  return (
    <div className="seg" role="group" aria-label="Theme">
      {themeOptions.map((option) => (
        <button
          key={option.value}
          type="button"
          className="seg-btn"
          aria-pressed={option.value === choice}
          onClick={() => pick(option.value)}
        >
          {option.label}
        </button>
      ))}
    </div>
  )
}

export function SiteFooter({ variant = 'home' }: { variant?: 'home' | 'legal' }) {
  const pathname = useLocation({ select: (state) => state.pathname })
  return (
    <footer className="ftr">
      <div className="wrap">
        <div className="ftr-in">
          <Logo href={variant === 'home' ? '#top' : '/'} markSize={28} />
          <nav className="ftr-links" aria-label="Footer">
            <a href="/privacy" aria-current={pathname === '/privacy' ? 'page' : undefined}>
              Privacy
            </a>
            <a href="/terms" aria-current={pathname === '/terms' ? 'page' : undefined}>
              Terms
            </a>
            <a href={githubUrl}>GitHub</a>
            <a href={signInUrl}>Sign in</a>
          </nav>
          <div className="ftr-meta">
            <p className="t-caption muted">© 2026 Learn Quiz</p>
            {variant === 'home' && <ThemeSwitch />}
          </div>
        </div>
      </div>
    </footer>
  )
}
