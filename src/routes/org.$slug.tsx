import { createFileRoute, Link, Outlet, redirect } from '@tanstack/react-router'

export const Route = createFileRoute('/org/$slug')({
  beforeLoad: ({ context, location }) => {
    if (!context.user || context.user.isAnonymous) throw redirect({ to: '/sign-in', search: { redirect: location.href } })
  },
  component: OrgLayout,
})

const linkClass =
  'inline-flex min-h-11 items-center whitespace-nowrap rounded-md px-3 font-medium outline-none focus-visible:ring-[3px] focus-visible:ring-ring/50'

function OrgLayout() {
  const { slug } = Route.useParams()
  const { user } = Route.useRouteContext()
  // Learn Quiz staff get read-only Overview and People; the server 403s them on Roles, Questions and Settings.
  const staff = user?.role === 'admin'
  const params = { slug }
  // TanStack Link already sets aria-current="page" on the active link.
  const active = { className: 'text-foreground underline underline-offset-4' }
  const inactive = { className: 'text-muted-foreground hover:text-foreground' }
  return (
    <>
      <div className="mx-auto w-full max-w-3xl px-4 pt-4">
        <nav aria-label="Company">
          <ul className="-mx-3 flex flex-wrap gap-x-2">
            <li><Link to="/org/$slug" params={params} activeOptions={{ exact: true }} className={linkClass} activeProps={active} inactiveProps={inactive}>Overview</Link></li>
            {!staff && <li><Link to="/org/$slug/roles" params={params} className={linkClass} activeProps={active} inactiveProps={inactive}>Roles</Link></li>}
            <li><Link to="/org/$slug/people" params={params} className={linkClass} activeProps={active} inactiveProps={inactive}>People</Link></li>
            {!staff && <li><Link to="/org/$slug/questions" params={params} className={linkClass} activeProps={active} inactiveProps={inactive}>Question review</Link></li>}
            {!staff && <li><Link to="/org/$slug/settings" params={params} className={linkClass} activeProps={active} inactiveProps={inactive}>Settings</Link></li>}
          </ul>
        </nav>
      </div>
      <Outlet />
    </>
  )
}
