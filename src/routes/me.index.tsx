import { Link, createFileRoute, redirect, useRouter } from '@tanstack/react-router'
import { Button } from '@/components/ui/button'
import { authClient } from '@/lib/auth-client'
import { PushSettings } from '@/components/push-settings'
import { getPushSettings } from '@/server/push'

export const Route = createFileRoute('/me/')({
  beforeLoad: ({ context }) => {
    if (!context.user) throw redirect({ to: '/' })
  },
  loader: ({ context }) => context.user && !context.user.isAnonymous ? getPushSettings() : null,
  component: Me,
})

function Me() {
  const { user } = Route.useRouteContext()
  const push = Route.useLoaderData()
  const router = useRouter()

  async function signOut() {
    await authClient.signOut()
    await router.invalidate()
    await router.navigate({ to: '/' })
  }

  if (!user) return null
  return (
    <main className="mx-auto flex w-full max-w-xl flex-col gap-6 px-4 pt-8 pb-8">
      <h1 className="text-3xl font-bold tracking-tight">{user.isAnonymous ? 'Guest' : user.name}</h1>
      {push && <PushSettings {...push} />}
      {user.role === 'admin' && <Link to="/admin" className="inline-flex min-h-11 items-center rounded-md underline focus-visible:ring-[3px] focus-visible:ring-ring/50">Staff area</Link>}
      {!user.isAnonymous && (
        <Button variant="outline" className="h-12 w-full px-6 sm:w-auto sm:self-start" onClick={signOut}>
          Sign out
        </Button>
      )}
    </main>
  )
}
