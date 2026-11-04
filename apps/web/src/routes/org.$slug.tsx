import { createFileRoute, Outlet, redirect } from '@tanstack/react-router'
import { RouteError } from '@/components/inline-error'
import { PortalNav } from '@/components/portal/portal-nav'
import { PortalProvider } from '@/components/portal/portal-context'
import { getPortalShell } from '@/server/org-shell'

export const Route = createFileRoute('/org/$slug')({
  beforeLoad: ({ context, location }) => {
    if (!context.user || context.user.isAnonymous) throw redirect({ to: '/sign-in', search: { redirect: location.href } })
  },
  loader: ({ params }) => getPortalShell({ data: { slug: params.slug } }),
  errorComponent: RouteError,
  component: OrgLayout,
})

function OrgLayout() {
  const { slug } = Route.useParams()
  const shell = Route.useLoaderData()
  return (
    <PortalProvider slug={slug} base="org" readOnly={shell.readOnly}>
      <PortalNav shell={shell}>
        <Outlet />
      </PortalNav>
    </PortalProvider>
  )
}
