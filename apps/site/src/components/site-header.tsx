import { signInUrl } from '../site-config'
import { Logo } from './ui/logo'

export function SiteHeader() {
  return (
    <>
      <a href="#main" className="skip">
        Skip to content
      </a>
      <header className="border-b border-border py-6">
        <div className="wrap flex items-center justify-between gap-4">
          <Logo href="/" />
          <nav aria-label="Account">
            <a className="link-btn" href={signInUrl}>Sign in</a>
          </nav>
        </div>
      </header>
    </>
  )
}
