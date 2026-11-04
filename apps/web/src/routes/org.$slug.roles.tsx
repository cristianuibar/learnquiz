import { createFileRoute } from '@tanstack/react-router'
import { RouteError } from '@/components/inline-error'
import { Roles } from '@/components/portal/roles/roles'
import { listRoles } from '@/server/org'

export const Route = createFileRoute('/org/$slug/roles')({
  loader: ({ params }) => listRoles({ data: { slug: params.slug } }),
  errorComponent: RouteError,
  component: () => <Roles org={Route.useLoaderData()} />,
})
