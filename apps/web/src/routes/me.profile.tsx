import { createFileRoute, redirect } from '@tanstack/react-router'
import { RouteError } from '@/components/inline-error'
import { StartButton } from '@/components/start-button'
import { TrainingProgress } from '@/components/training-progress'
import { getProfile } from '@/server/profile'
import { getToday } from '@/server/today'

export const Route = createFileRoute('/me/profile')({
  beforeLoad: ({ context }) => {
    if (!context.user) throw redirect({ to: '/' })
  },
  loader: async () => {
    const profile = await getProfile({ data: {} })
    return { profile, today: profile.started ? null : await getToday() }
  },
  errorComponent: RouteError,
  component: MyProfile,
})

function MyProfile() {
  const { profile, today } = Route.useLoaderData()
  const first = today?.topic && today.plan?.playable && !today.role?.preparing ? { topicId: today.topic.id, placement: today.plan.start === 'placement' } : null
  return (
    <TrainingProgress
      profile={profile}
      self
      action={first && <StartButton topicId={first.topicId} placement={first.placement} size="lg">Play first session</StartButton>}
    />
  )
}
