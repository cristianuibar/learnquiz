import { createFileRoute, redirect } from '@tanstack/react-router'
import { z } from 'zod'
import { RouteError } from '@/components/inline-error'
import { startMiniSession } from '@/server/play'

export const Route = createFileRoute('/play/quick/$itemId')({
  validateSearch: z.object({ pushId: z.string().min(1).optional() }),
  beforeLoad: ({ context, location }) => {
    if (!context.user || context.user.isAnonymous) throw redirect({ to: '/sign-in', search: { redirect: location.href } })
  },
  loaderDeps: ({ search }) => ({ pushId: search.pushId }),
  loader: async ({ params, deps }) => {
    const { sessionId } = await startMiniSession({ data: { itemId: params.itemId, pushId: deps.pushId } })
    throw redirect({ to: '/play/$sessionId', params: { sessionId }, replace: true })
  },
  errorComponent: RouteError,
})
