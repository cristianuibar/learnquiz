import { Link } from '@tanstack/react-router'
import { Button } from '@/components/ui/button'

// Signed-in accounts sign out from /me; guests and visitors get a way to sign in.
export function TopBar({ signIn, branding, home = '/' }: { signIn: boolean; branding?: { name: string; logoUrl: string | null } | null; home?: '/' | '/start' }) {
  return (
    <header className="mx-auto flex h-16 w-full max-w-3xl items-center justify-between px-4">
      <Link
        to={home}
        className="-mx-2 flex h-12 items-center rounded-md px-2 text-lg font-semibold tracking-tight outline-none focus-visible:ring-[3px] focus-visible:ring-ring/50"
      >
        {branding?.logoUrl ? <img src={branding.logoUrl} alt={branding.name} className="max-h-10 max-w-48 object-contain" /> : 'Learn Quiz'}
      </Link>
      {signIn && (
        <Button variant="ghost" className="h-12 text-sm" asChild>
          <Link to="/sign-in">Sign in</Link>
        </Button>
      )}
    </header>
  )
}
