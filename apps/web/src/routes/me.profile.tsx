import { createFileRoute, Link, redirect } from '@tanstack/react-router'
import { SlidersHorizontal } from 'lucide-react'
import { Button } from '@/components/ui/button'
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
  validateSearch: (search: Record<string, unknown>): { status?: 'flag-sent' } => ({ status: search.status === 'flag-sent' ? 'flag-sent' : undefined }),
  errorComponent: RouteError,
  component: MyProfile,
})

function MyProfile() {
  const { user } = Route.useRouteContext()
  const { profile, today } = Route.useLoaderData()
  const { status } = Route.useSearch()
  const { companyMember } = Route.useRouteContext()
  const first = today?.topic && today.plan?.playable && !today.role?.preparing ? { topicId: today.topic.id, placement: today.plan.start === 'placement' } : null
  return (
    <TrainingProgress
      profile={profile}
      self
      flag={companyMember}
      status={status === 'flag-sent' ? <p role="status" className="text-body text-ink">Flag sent</p> : undefined}
      trailing={!user?.isAnonymous && (
        <Button asChild variant="ghost" size="icon" className="text-ink focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-brand">
          <Link to="/me/settings" aria-label="Settings"><SlidersHorizontal aria-hidden className="size-6" /></Link>
        </Button>
      )}
      action={first && <StartButton topicId={first.topicId} placement={first.placement} size="lg">Play first session</StartButton>}
    />
  )
}
