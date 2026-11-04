import { createFileRoute, Link, redirect } from '@tanstack/react-router'
import { Button } from '@/components/ui/button'
import { getToday } from '@/server/today'

export const Route = createFileRoute('/me/')({
  beforeLoad: ({ context }) => {
    if (!context.user) throw redirect({ to: '/' })
    if (!context.user.isAnonymous) throw redirect({ to: '/me/profile' })
  },
  loader: async () => ({ today: await getToday() }),
  component: Me,
})

// Accounts are redirected to Training progress; only guests render this page.
function Me() {
  const { user } = Route.useRouteContext()
  const { today } = Route.useLoaderData()
  if (!user) return null
  return (
    <main className="mx-auto flex w-full max-w-xl flex-col gap-6 px-4 pt-8 pb-8">
      <h1 className="text-title-1 text-ink">Guest</h1>
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
      <Link to="/me/profile" className="flex min-h-12 items-center rounded-lg border p-4 font-medium text-primary focus-visible:outline-2">
        Training progress
      </Link>
    </main>
  )
}
