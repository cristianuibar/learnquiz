import { Outlet, createFileRoute } from '@tanstack/react-router'
import { StaffRouteError } from '@/components/admin/staff-denied'
import { StaffNav } from '@/components/admin/staff-nav'
import { getStaffSession } from '@/server/admin'

export const Route = createFileRoute('/admin')({
  beforeLoad: async () => ({ staff: await getStaffSession() }),
  errorComponent: StaffRouteError,
  component: () => {
    const { staff } = Route.useRouteContext()
    return (
      <StaffNav failed={staff.failedJobs} name={staff.name}>
        <div className="w-full px-4 pt-8 pb-16">
          <Outlet />
        </div>
      </StaffNav>
    )
  },
})
