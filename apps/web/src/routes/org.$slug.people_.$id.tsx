import { createFileRoute, Link, notFound } from '@tanstack/react-router'
import { RouteError } from '@/components/inline-error'
import { TrainingProgress } from '@/components/training-progress'
import { PortalNotFound } from '@/components/portal/not-found'
import { usePortalLinks } from '@/components/portal/portal-context'
import { getProfile } from '@/server/profile'

// Read-only: a company admin sees exactly the member's own Training progress screen.
export const Route = createFileRoute('/org/$slug/people_/$id')({
  loader: ({ params }) =>
    getProfile({ data: { org: params.slug, learnerId: params.id } }).catch((err: unknown) => {
      if ((err as { status?: unknown } | null)?.status === 404) throw notFound({ data: { what: 'person' } })
      throw err
    }),
  notFoundComponent: () => <PortalNotFound what="person" />,
  errorComponent: RouteError,
  component: PersonProfile,
})

function PersonProfile() {
  const links = usePortalLinks()
  return (
    <TrainingProgress
      profile={Route.useLoaderData()}
      self={false}
      back={<Link {...links.people} className="inline-flex min-h-11 items-center text-body font-medium text-primary underline">Back to people</Link>}
    />
  )
}
