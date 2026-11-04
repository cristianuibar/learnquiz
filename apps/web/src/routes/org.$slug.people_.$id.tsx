import { createFileRoute, Link } from '@tanstack/react-router'
import { RouteError } from '@/components/inline-error'
import { TrainingProgress } from '@/components/training-progress'
import { getProfile } from '@/server/profile'

// Read-only: a company admin sees exactly the member's own Training progress screen.
export const Route = createFileRoute('/org/$slug/people_/$id')({
  loader: ({ params }) => getProfile({ data: { org: params.slug, learnerId: params.id } }),
  errorComponent: RouteError,
  component: PersonProfile,
})

function PersonProfile() {
  const { slug } = Route.useParams()
  return (
    <TrainingProgress
      profile={Route.useLoaderData()}
      self={false}
      back={<Link to="/org/$slug/people" params={{ slug }} className="inline-flex min-h-11 items-center text-sm font-medium text-primary underline">Back to people</Link>}
    />
  )
}
