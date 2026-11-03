import { useCallback, useEffect, useRef, useState } from 'react'
import { githubUrl, signInUrl, signUpUrl } from '../site-config'
import { Icon } from './ui/icon'
import { Logo } from './ui/logo'

const HERO_CTA_ID = 'lqs-hero-cta'
const CLOSE_CTA_ID = 'lqs-close-cta'
const MENU_ID = 'lqs-menu'
const MENU_BUTTON_ID = 'lqs-menu-btn'

function focusMain() {
  const main = document.getElementById('main')
  if (!main) return
  if (!main.hasAttribute('tabindex')) main.setAttribute('tabindex', '-1')
  main.focus({ preventScroll: true })
}

export function SiteHeader({ variant = 'home' }: { variant?: 'home' | 'legal' }) {
  const isLegal = variant === 'legal'
  const [menuOpen, setMenuOpen] = useState(false)
  const [ctaInView, setCtaInView] = useState(true)
  const visibleRef = useRef<Record<string, boolean>>({})
  const menuButtonRef = useRef<HTMLButtonElement>(null)

  const closeMenu = useCallback(() => {
    setMenuOpen(false)
    menuButtonRef.current?.focus()
  }, [])

  const handleMenuKeyDown = useCallback(
    (e: React.KeyboardEvent) => {
      if (e.key === 'Escape' && menuOpen) {
        e.preventDefault()
        closeMenu()
      }
    },
    [menuOpen, closeMenu],
  )

  useEffect(() => {
    if (isLegal) return
    if (typeof window === 'undefined' || typeof window.matchMedia !== 'function') return
    const mq = window.matchMedia('(min-width: 640px)')
    const onChange = (e: MediaQueryListEvent) => {
      if (e.matches) setMenuOpen(false)
    }
    if (typeof mq.addEventListener === 'function') mq.addEventListener('change', onChange)
    else mq.addListener(onChange)
    return () => {
      if (typeof mq.removeEventListener === 'function') mq.removeEventListener('change', onChange)
      else mq.removeListener(onChange)
    }
  }, [isLegal])

  useEffect(() => {
    if (isLegal) return
    if (typeof IntersectionObserver === 'undefined') return
    const hero = document.getElementById(HERO_CTA_ID)
    const close = document.getElementById(CLOSE_CTA_ID)
    if (!hero || !close) return
    const io = new IntersectionObserver(
      (entries) => {
        for (const entry of entries) visibleRef.current[entry.target.id] = entry.isIntersecting
        const seen = visibleRef.current
        const anyVisible = (seen[HERO_CTA_ID] ?? true) || (seen[CLOSE_CTA_ID] ?? true)
        setCtaInView((prev) => (prev === anyVisible ? prev : anyVisible))
      },
      { rootMargin: '-64px 0px 0px 0px' },
    )
    io.observe(hero)
    io.observe(close)
    return () => {
      io.disconnect()
    }
  }, [isLegal])

  return (
    <>
      <a href="#main" className="skip" onClick={focusMain}>
        Skip to content
      </a>
      <header className="hdr">
        <div className="wrap">
          <div className="hdr-in">
            <Logo href={isLegal ? '/' : '#top'} />
            {isLegal ? (
              <nav className="hdr-links ml-auto flex" aria-label="Site">
                <a className="link-btn" href={githubUrl}>
                  GitHub
                </a>
                <a className="link-btn" href={signInUrl}>
                  Sign in
                </a>
              </nav>
            ) : (
              <>
                <nav className="hdr-links" aria-label="Site">
                  <a className="link-btn" href={signInUrl}>
                    Sign in
                  </a>
                  <a className="link-btn" href={githubUrl}>
                    GitHub
                  </a>
                </nav>
                <a
                  className={`btn hdr-cta ${ctaInView ? 'btn-secondary' : 'btn-accent'}`}
                  href={signUpUrl}
                >
                  Create a company account
                </a>
                <button
                  ref={menuButtonRef}
                  id={MENU_BUTTON_ID}
                  className="icon-btn hdr-menu-btn"
                  type="button"
                  aria-label="Menu"
                  aria-expanded={menuOpen}
                  aria-controls={MENU_ID}
                  onClick={() => setMenuOpen((open) => !open)}
                  onKeyDown={handleMenuKeyDown}
                >
                  <Icon name="menu" size={24} />
                </button>
              </>
            )}
          </div>
          {!isLegal && menuOpen ? (
            <nav id={MENU_ID} className="hdr-menu" aria-label="Site menu" onKeyDown={handleMenuKeyDown}>
              <a href={signInUrl}>Sign in</a>
              <a href={githubUrl}>GitHub</a>
            </nav>
          ) : null}
        </div>
      </header>
    </>
  )
}
