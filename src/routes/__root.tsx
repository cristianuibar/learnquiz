import { HeadContent, Outlet, Scripts, createRootRoute } from '@tanstack/react-router'
import { TanStackRouterDevtoolsPanel } from '@tanstack/react-router-devtools'
import { TanStackDevtools } from '@tanstack/react-devtools'
import { TopBar } from '@/components/top-bar'
import { getSessionFn } from '@/server/session-fn'

import appCss from '../styles.css?url'

export const Route = createRootRoute({
  beforeLoad: () => getSessionFn(),
  notFoundComponent: () => (
    <main className="mx-auto w-full max-w-xl px-4 pt-8">
      <p className="text-lg font-medium">Page not found.</p>
    </main>
  ),
  head: () => ({
    meta: [
      {
        charSet: 'utf-8',
      },
      {
        name: 'viewport',
        content: 'width=device-width, initial-scale=1',
      },
      {
        title: 'Learn Quiz',
      },
    ],
    links: [
      {
        rel: 'stylesheet',
        href: appCss,
      },
    ],
  }),
  component: Root,
  shellComponent: RootDocument,
})

function Root() {
  const { user } = Route.useRouteContext()
  return (
    <>
      <TopBar user={user} />
      <Outlet />
    </>
  )
}

function RootDocument({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <head>
        <HeadContent />
      </head>
      <body className="font-sans antialiased [overflow-wrap:anywhere]">
        {children}
        {import.meta.env.DEV && (
          <TanStackDevtools
            config={{
              position: 'bottom-right',
            }}
            plugins={[
              {
                name: 'Tanstack Router',
                render: <TanStackRouterDevtoolsPanel />,
              },
            ]}
          />
        )}
        <Scripts />
      </body>
    </html>
  )
}
