import { createFileRoute, notFound } from '@tanstack/react-router'
import { RouteError } from '@/components/inline-error'
import { PortalNotFound } from '@/components/portal/not-found'
import { Person } from '@/components/portal/person'
import { getMemberFlags, getProfile } from '@/server/profile'

// Read-only: a company admin sees the member's Training progress plus the flags they raised.
export const Route = createFileRoute('/admin_/companies/$slug/portal/people_/$id')({
  loader: async ({ params }) => {
    const data = { org: params.slug, learnerId: params.id }
    try {
      const [profile, { flags }] = await Promise.all([getProfile({ data }), getMemberFlags({ data })])
      return { profile, flags }
    } catch (err) {
      if ((err as { status?: unknown } | null)?.status === 404) throw notFound({ data: { what: 'person' } })
      throw err
    }
  },
  notFoundComponent: () => <PortalNotFound what="person" />,
  errorComponent: RouteError,
  component: PersonProfile,
})

function PersonProfile() {
  const { profile, flags } = Route.useLoaderData()
  return <Person profile={profile} flags={flags} />
}
