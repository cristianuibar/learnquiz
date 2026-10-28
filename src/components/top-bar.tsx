import { Link, useRouter } from '@tanstack/react-router'
import { Button } from '@/components/ui/button'
import { authClient } from '@/lib/auth-client'

export function TopBar({
  user,
}: {
  user: { name: string; isAnonymous: boolean } | null
}) {
  const router = useRouter()

  async function signOut() {
    await authClient.signOut()
    await router.invalidate()
    await router.navigate({ to: '/' })
  }

  return (
    <header className="mx-auto flex h-16 w-full max-w-3xl items-center justify-between px-4">
      <Link
        to="/"
        className="-mx-2 flex h-11 items-center rounded-md px-2 text-lg font-semibold tracking-tight outline-none focus-visible:ring-[3px] focus-visible:ring-ring/50"
      >
        Learn Quiz
      </Link>
      {user && (
        <div className="flex items-center gap-1 text-sm">
          <span className="font-medium">{user.isAnonymous ? 'Guest' : user.name}</span>
          <Button variant="ghost" className="h-11" onClick={signOut}>
            Sign out
          </Button>
        </div>
      )}
    </header>
  )
}
