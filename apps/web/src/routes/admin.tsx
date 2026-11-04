import { Outlet, createFileRoute, useRouteContext } from '@tanstack/react-router'
import { StaffDenied } from '@/components/admin/staff-denied'
import { StaffNav } from '@/components/admin/staff-nav'
import { RouteError } from '@/components/inline-error'
import { getStaffSession } from '@/server/admin'

function AdminError(props: { error: unknown; reset: () => void }) {
  const { user, adminCompanies } = useRouteContext({ from: '__root__' })
  if ((props.error as { status?: unknown } | null)?.status !== 403) return <RouteError {...props} />
  // The first company the person owns or administers, by membership date.
  const first = adminCompanies[0]
  return <StaffDenied email={user?.email ?? ''} home={first ? `/org/${first.slug}` : '/today'} />
}

export const Route = createFileRoute('/admin')({
  beforeLoad: async () => ({ staff: await getStaffSession() }),
  errorComponent: AdminError,
  component: () => {
    const { staff } = Route.useRouteContext()
    return (
      <StaffNav failed={staff.failedJobs} name={staff.name}>
        <div className="mx-auto w-full max-w-[1120px] px-4 pt-8 pb-16">
          <Outlet />
        </div>
      </StaffNav>
    )
  },
})
