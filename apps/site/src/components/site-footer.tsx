import { githubUrl } from '../site-config'

export function SiteFooter() {
  return (
    <footer className="border-t border-border py-6">
      <div className="wrap">
        <nav aria-label="Site" className="flex flex-wrap gap-6">
          <a href="/privacy">Privacy</a>
          <a href="/terms">Terms</a>
          <a href={githubUrl}>GitHub</a>
        </nav>
      </div>
    </footer>
  )
}
