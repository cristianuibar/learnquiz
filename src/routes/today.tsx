import { createFileRoute, Link, redirect } from '@tanstack/react-router'
import { RouteError } from '@/components/inline-error'
import { StartButton } from '@/components/start-button'
import { plural } from '@/lib/utils'
import { getToday } from '@/server/today'

export const Route = createFileRoute('/today')({
  beforeLoad: ({ context }) => {
    if (!context.user) throw redirect({ to: '/' })
  },
  loader: async () => {
    const today = await getToday()
    if (!today.topic && !today.role) throw redirect({ to: '/start' })
    return today
  },
  errorComponent: RouteError,
  component: Today,
})

function Today() {
  const { topic, role } = Route.useLoaderData()
  return (
    <main className="mx-auto w-full max-w-xl px-4 pt-8 pb-16">
      <h1 className="text-3xl font-bold tracking-tight">{topic?.title ?? role?.topicTitle}</h1>
      {topic && (
        <div className="mt-4 flex flex-col gap-6">
          <div className="flex flex-col gap-1">
            <p className="text-lg font-medium">
              {topic.due > 0 ? `${plural(topic.due, 'item', 'items')} due` : 'Nothing due, fresh questions await'}
            </p>
            <p className="text-sm text-muted-foreground">Streak {topic.streak} · {topic.xp} XP</p>
          </div>
          <StartButton topicId={topic.id} placement={!topic.placed}>
            {topic.placed ? 'Start session' : 'Find my level'}
          </StartButton>
        </div>
      )}
      {role && (
        <section className="mt-8 flex flex-col gap-2">
          <h2 className="text-xl font-semibold tracking-tight">Your role training</h2>
          <p>{role.name}: {role.topicTitle}</p>
          {role.preparing && <p className="text-muted-foreground">Your training is being prepared</p>}
          <Link to="/me/profile" className="inline-flex min-h-11 items-center self-start rounded-md font-medium text-primary underline focus-visible:ring-[3px] focus-visible:ring-ring/50">
            Training progress
          </Link>
        </section>
      )}
      {!role && (
        <Link to="/start" className="mt-6 inline-flex min-h-12 items-center rounded-md underline focus-visible:ring-[3px] focus-visible:ring-ring/50">
          Learn something new
        </Link>
      )}
    </main>
  )
}
