import { Link } from '@tanstack/react-router'
import { Button } from '@/components/ui/button'

// Signed-in accounts sign out from /me; guests and visitors get a way to sign in.
export function TopBar({ signIn }: { signIn: boolean }) {
  return (
    <header className="mx-auto flex h-16 w-full max-w-3xl items-center justify-between px-4">
      <Link
        to="/"
        className="-mx-2 flex h-12 items-center rounded-md px-2 text-lg font-semibold tracking-tight outline-none focus-visible:ring-[3px] focus-visible:ring-ring/50"
      >
        Learn Quiz
      </Link>
      {signIn && (
        <Button variant="ghost" className="h-12 text-sm" asChild>
          <Link to="/sign-in">Sign in</Link>
        </Button>
      )}
    </header>
  )
}
