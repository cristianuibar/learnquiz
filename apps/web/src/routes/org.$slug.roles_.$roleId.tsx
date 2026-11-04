import { createFileRoute } from '@tanstack/react-router'
import { RouteError } from '@/components/inline-error'
import { RoleDetail } from '@/components/portal/role-detail/role-detail'
import { getRoleDetail } from '@/server/role-detail'

export const Route = createFileRoute('/org/$slug/roles_/$roleId')({
  loader: ({ params }) => getRoleDetail({ data: { slug: params.slug, roleId: params.roleId } }),
  errorComponent: RouteError,
  component: RoleDetailPage,
})

function RoleDetailPage() {
  const detail = Route.useLoaderData()
  return <RoleDetail detail={detail} readOnly={detail.readOnly} />
}
