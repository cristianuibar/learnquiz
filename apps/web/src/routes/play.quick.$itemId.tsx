import { createFileRoute, redirect } from '@tanstack/react-router'
import { z } from 'zod'
import { RouteError } from '@/components/inline-error'
import { QuickSession, goneState } from '@/components/quick-session'
import { getSession, startMiniSession } from '@/server/play'

export const Route = createFileRoute('/play/quick/$itemId')({
  validateSearch: z.object({ pushId: z.string().min(1).optional() }),
  beforeLoad: ({ context, location }) => {
    if (!context.user || context.user.isAnonymous) throw redirect({ to: '/sign-in', search: { redirect: location.href } })
  },
  loaderDeps: ({ search }) => ({ pushId: search.pushId }),
  loader: async ({ params, deps }) => {
    try {
      const { sessionId } = await startMiniSession({ data: { itemId: params.itemId, pushId: deps.pushId } })
      const view = await getSession({ data: { sessionId } })
      if (view.ended || !view.item) return { status: 'answered' as const }
      return { status: 'question' as const, view }
    } catch (err) {
      const gone = goneState(err)
      if (!gone) throw err
      return { status: gone }
    }
  },
  // The session is created per visit, so cached loader data would replay an old question.
  gcTime: 0,
  errorComponent: RouteError,
  component: () => {
    const data = Route.useLoaderData()
    return data.status === 'question' ? <QuickSession key={data.view.id} status="question" view={data.view} /> : <QuickSession status={data.status} />
  },
})
