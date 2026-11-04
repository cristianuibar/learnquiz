import { createFileRoute, Outlet, redirect, useRouterState } from '@tanstack/react-router'
import { RouteError } from '@/components/inline-error'
import { PortalDenied } from '@/components/portal/denied'
import { PortalNav } from '@/components/portal/portal-nav'
import { PortalProvider } from '@/components/portal/portal-context'
import { getPortalShell } from '@/server/org-shell'

function staffRedirect(slug: string, pathname: string, search: Record<string, unknown>) {
  const rest = pathname.replace(/\/+$/, '').split('/').slice(3)
  if (rest[0] === 'roles' && rest.length === 1) return redirect({ to: '/admin/companies/$slug/portal/roles', params: { slug } })
  if (rest[0] === 'roles' && rest.length === 2) return redirect({ to: '/admin/companies/$slug/portal/roles/$roleId', params: { slug, roleId: rest[1] } })
  if (rest[0] === 'questions' && rest.length === 1) return redirect({ to: '/admin/companies/$slug/portal/questions', params: { slug }, search })
  if (rest[0] === 'people' && rest.length === 1) return redirect({ to: '/admin/companies/$slug/portal/people', params: { slug } })
  if (rest[0] === 'people' && rest.length === 2) return redirect({ to: '/admin/companies/$slug/portal/people/$id', params: { slug, id: rest[1] } })
  if (rest[0] === 'settings' && rest.length === 1) return redirect({ to: '/admin/companies/$slug/portal/settings', params: { slug } })
  return redirect({ to: '/admin/companies/$slug/portal', params: { slug } })
}

export const Route = createFileRoute('/org/$slug')({
  beforeLoad: ({ context, location, params }) => {
    if (!context.user || context.user.isAnonymous) throw redirect({ to: '/sign-in', search: { redirect: location.href } })
    // Learn Quiz staff who aren't owner/admin of this company get the read-only staff portal instead.
    if (context.user.role === 'admin' && !context.adminCompanies.some((c) => c.slug === params.slug)) throw staffRedirect(params.slug, location.pathname, location.search)
  },
  loader: ({ params }) => getPortalShell({ data: { slug: params.slug } }),
  errorComponent: OrgError,
  component: OrgLayout,
})

function OrgError({ error, reset }: { error: unknown; reset: () => void }) {
  const { slug } = Route.useParams()
  // 401 never gets here: beforeLoad sends signed-out visitors to sign-in.
  if ((error as { status?: unknown } | null)?.status === 403) return <PortalDenied slug={slug} />
  return <RouteError error={error} reset={reset} />
}

function OrgLayout() {
  const notFound = useRouterState({ select: (s) => s.matches.some((m) => m.status === 'notFound') })
  const { slug } = Route.useParams()
  const shell = Route.useLoaderData()
  return (
    <PortalProvider slug={slug} base="org" readOnly={shell.readOnly}>
      <PortalNav shell={shell} current={!notFound}>
        <Outlet />
      </PortalNav>
    </PortalProvider>
  )
}
