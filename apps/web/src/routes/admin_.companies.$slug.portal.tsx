import { createFileRoute, linkOptions, Outlet, redirect, useRouterState } from '@tanstack/react-router'
import { StaffRouteError } from '@/components/admin/staff-denied'
import { PortalNav } from '@/components/portal/portal-nav'
import { PortalProvider } from '@/components/portal/portal-context'
import { RoBand } from '@/components/portal/ro-band'
import { getStaffSession } from '@/server/admin'
import { getPortalShell } from '@/server/org-shell'

// The `_` after "admin" escapes the /admin layout, so the staff nav does not render around the portal.
export const Route = createFileRoute('/admin_/companies/$slug/portal')({
  beforeLoad: async ({ context, location }) => {
    if (!context.user || context.user.isAnonymous) throw redirect({ to: '/sign-in', search: { redirect: location.href } })
    return { staff: await getStaffSession() }
  },
  loader: ({ params }) => getPortalShell({ data: { slug: params.slug } }),
  errorComponent: StaffRouteError,
  component: StaffPortalLayout,
})

function StaffPortalLayout() {
  const notFound = useRouterState({ select: (s) => s.matches.some((m) => m.status === 'notFound') })
  const { slug } = Route.useParams()
  const shell = Route.useLoaderData()
  return (
    <PortalProvider slug={slug} base="staff" readOnly>
      <RoBand company={shell.name} exitTo={linkOptions({ to: '/admin/companies/$slug', params: { slug } })} />
      <PortalNav shell={shell} current={!notFound} readonly>
        <Outlet />
      </PortalNav>
    </PortalProvider>
  )
}
