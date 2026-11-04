import { createFileRoute, redirect } from '@tanstack/react-router'
import { z } from 'zod'
import { SessionLoading } from '@/components/session-loading'

export const Route = createFileRoute('/play/loading')({
  validateSearch: z.object({
    topicId: z.string().min(1),
    start: z.enum(['session', 'placement']),
    unitId: z.string().min(1).optional(),
  }),
  beforeLoad: ({ context }) => {
    if (!context.user) throw redirect({ to: '/' })
  },
  component: () => {
    const { topicId, start, unitId } = Route.useSearch()
    return <SessionLoading topicId={topicId} start={start} unitId={unitId} />
  },
})
