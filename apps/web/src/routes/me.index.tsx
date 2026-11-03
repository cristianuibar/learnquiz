import { useState } from 'react'
import { createFileRoute, Link, redirect, useRouter } from '@tanstack/react-router'
import { Button } from '@/components/ui/button'
import { authClient } from '@/lib/auth-client'
import { PushSettings } from '@/components/push-settings'
import { getPushSettings } from '@/server/push'
import { getToday } from '@/server/today'

export const Route = createFileRoute('/me/')({
  beforeLoad: ({ context }) => {
    if (!context.user) throw redirect({ to: '/' })
  },
  loader: async ({ context }) => context.user?.isAnonymous
    ? { push: null, today: await getToday() }
    : { push: context.user ? await getPushSettings() : null, today: null },
  component: Me,
})

function Me() {
  const { user, adminCompanies } = Route.useRouteContext()
  const { push, today } = Route.useLoaderData()
  const router = useRouter()

  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')

  async function signOut() {
    setBusy(true)
    setError('')
    const { error } = await authClient.signOut().catch(() => ({ error: { message: 'Could not sign out' } }))
    if (error) {
      setError(error.message ?? 'Could not sign out')
      setBusy(false)
      return
    }
    await router.invalidate()
    await router.navigate({ to: '/' })
  }

  if (!user) return null
  return (
    <main className="mx-auto flex w-full max-w-xl flex-col gap-6 px-4 pt-8 pb-8">
      <h1 className="text-3xl font-bold tracking-tight">{user.isAnonymous ? 'Guest' : user.name}</h1>
      {user.isAnonymous && (
        <section aria-label="Your progress" className="flex flex-col gap-4">
          {today?.topic && (
            <div className="flex flex-col gap-1">
              <p className="text-lg font-medium">{today.topic.title}</p>
              <p className="text-sm text-muted-foreground">Streak {today.topic.streak} · {today.topic.xp} XP</p>
            </div>
          )}
          <Button asChild className="px-6 sm:self-start">
            <Link to="/sign-in" search={{ mode: 'up', redirect: '/me' }}>Save your progress</Link>
          </Button>
        </section>
      )}
      <Link to="/me/profile" className="flex min-h-12 items-center rounded-lg border p-4 font-medium text-primary focus-visible:outline-2">
        Training progress
      </Link>
      {adminCompanies.length > 0 && (
        <ul className="flex flex-col gap-3">
          {adminCompanies.map((company) => (
            <li key={company.slug}>
              <Button asChild variant="secondary" className="px-6">
                <Link to="/org/$slug" params={{ slug: company.slug }}>{company.name} portal</Link>
              </Button>
            </li>
          ))}
        </ul>
      )}
      {user.role === 'admin' && <Link to="/admin" className="inline-flex min-h-11 items-center rounded-md underline focus-visible:ring-[3px] focus-visible:ring-ring/50">Staff area</Link>}
      {push && <PushSettings {...push} />}
      {!user.isAnonymous && (
        <>
          <Button variant="secondary" className="w-full px-6 sm:w-auto sm:self-start" onClick={signOut} disabled={busy}>
            Sign out
          </Button>
          {error && <p role="alert" className="text-sm font-medium text-wrong">{error}</p>}
        </>
      )}
    </main>
  )
}
