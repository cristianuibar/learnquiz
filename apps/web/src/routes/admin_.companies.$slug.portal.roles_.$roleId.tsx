import { createFileRoute, notFound } from '@tanstack/react-router'
import { RouteError } from '@/components/inline-error'
import { PortalNotFound } from '@/components/portal/not-found'
import { RoleDetail } from '@/components/portal/role-detail/role-detail'
import { getRoleDetail } from '@/server/role-detail'

export const Route = createFileRoute('/admin_/companies/$slug/portal/roles_/$roleId')({
  loader: ({ params }) =>
    getRoleDetail({ data: { slug: params.slug, roleId: params.roleId } }).catch((err: unknown) => {
      if ((err as { status?: unknown } | null)?.status === 404) throw notFound({ data: { what: 'role' } })
      throw err
    }),
  notFoundComponent: () => <PortalNotFound what="role" />,
  errorComponent: RouteError,
  component: RoleDetailPage,
})

function RoleDetailPage() {
  const detail = Route.useLoaderData()
  return <RoleDetail detail={detail} readOnly />
}
