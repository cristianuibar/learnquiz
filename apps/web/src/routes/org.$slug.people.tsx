import { createFileRoute } from '@tanstack/react-router'
import { RouteError } from '@/components/inline-error'
import { People } from '@/components/portal/people/people'
import { getPeople } from '@/server/people'

export const Route = createFileRoute('/org/$slug/people')({
  loader: ({ params }) => getPeople({ data: { slug: params.slug } }),
  errorComponent: RouteError,
  component: () => <People org={Route.useLoaderData()} />,
})
