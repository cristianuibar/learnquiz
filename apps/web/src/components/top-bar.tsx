import { useId } from 'react'
import { Link } from '@tanstack/react-router'
import { Button } from '@/components/ui/button'

// The Learn Quiz mark: a brand-colored ring with a saffron dot cut out of its corner.
function LogoMark() {
  const maskId = `lq-mark-${useId().replace(/[^a-zA-Z0-9_-]/g, '')}`
  return (
    <svg viewBox="0 0 64 64" aria-hidden="true" focusable="false" className="size-7 shrink-0">
      <mask id={maskId}>
        <rect width="64" height="64" fill="white" />
        <circle cx="48" cy="48" r="13" fill="black" />
      </mask>
      <circle cx="32" cy="32" r="19" fill="none" strokeWidth="14" mask={`url(#${maskId})`} style={{ stroke: 'var(--brand)' }} />
      <circle cx="48" cy="48" r="9" fill="#F2A900" />
    </svg>
  )
}

// Signed-in accounts sign out from /me; guests and visitors get a way to sign in.
export function TopBar({ signIn, branding, home = '/' }: { signIn: boolean; branding?: { name: string; logoUrl: string | null } | null; home?: '/' | '/today' }) {
  return (
    <header className="mx-auto flex h-16 w-full max-w-3xl items-center justify-between px-4">
      <Link
        to={home}
        className="-mx-2 flex h-12 min-w-24 items-center gap-2 whitespace-nowrap rounded-md px-2 text-lg font-bold tracking-tight outline-none focus-visible:ring-[3px] focus-visible:ring-ring/50"
      >
        {branding?.logoUrl ? <img src={branding.logoUrl} alt={branding.name} className="max-h-10 max-w-48 object-contain" /> : (
          <>
            <LogoMark />
            Learn Quiz
          </>
        )}
      </Link>
      {signIn && (
        <Button variant="ghost" asChild>
          <Link to="/sign-in">Sign in</Link>
        </Button>
      )}
    </header>
  )
}
