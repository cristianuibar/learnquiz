import { createFileRoute, Outlet, redirect, useRouterState } from '@tanstack/react-router'
import { RouteError } from '@/components/inline-error'
import { PortalDenied } from '@/components/portal/denied'
import { PortalNav } from '@/components/portal/portal-nav'
import { PortalProvider } from '@/components/portal/portal-context'
import { getPortalShell } from '@/server/org-shell'

export const Route = createFileRoute('/org/$slug')({
  beforeLoad: ({ context, location }) => {
    if (!context.user || context.user.isAnonymous) throw redirect({ to: '/sign-in', search: { redirect: location.href } })
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
