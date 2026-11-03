import { createFileRoute, Link, redirect } from '@tanstack/react-router'
import { RouteError } from '@/components/inline-error'
import { TrainingProgress } from '@/components/training-progress'
import { getProfile } from '@/server/profile'

export const Route = createFileRoute('/me/profile')({
  beforeLoad: ({ context }) => {
    if (!context.user) throw redirect({ to: '/' })
  },
  loader: () => getProfile({ data: {} }),
  errorComponent: RouteError,
  component: () => (
    <TrainingProgress
      profile={Route.useLoaderData()}
      back={<Link to="/me" className="inline-flex min-h-11 items-center text-sm font-medium text-primary underline">Back to profile</Link>}
    />
  ),
})
