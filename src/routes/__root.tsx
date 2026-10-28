import { useEffect } from 'react'
import { HeadContent, Outlet, Scripts, createRootRoute, useLocation } from '@tanstack/react-router'
import { TanStackRouterDevtoolsPanel } from '@tanstack/react-router-devtools'
import { TanStackDevtools } from '@tanstack/react-devtools'
import { BottomNav } from '@/components/bottom-nav'
import { TopBar } from '@/components/top-bar'
import { getLatestTopicIdFn } from '@/server/latest-topic'
import { getSessionFn } from '@/server/session-fn'

import appCss from '../styles.css?url'

export const Route = createRootRoute({
  beforeLoad: () => getSessionFn(),
  loader: ({ context }) => (context.user ? getLatestTopicIdFn() : null),
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
        content: 'width=device-width, initial-scale=1, viewport-fit=cover, interactive-widget=resizes-content',
      },
      { name: 'theme-color', content: '#00785f' }, // --primary in styles.css
      { name: 'mobile-web-app-capable', content: 'yes' },
      { name: 'apple-mobile-web-app-capable', content: 'yes' },
      { name: 'apple-mobile-web-app-title', content: 'Learn Quiz' },
      { name: 'apple-mobile-web-app-status-bar-style', content: 'default' },
      {
        title: 'Learn Quiz',
      },
    ],
    links: [
      {
        rel: 'stylesheet',
        href: appCss,
      },
      { rel: 'manifest', href: '/manifest.webmanifest' },
      { rel: 'icon', type: 'image/svg+xml', href: '/icons/icon.svg' },
      { rel: 'apple-touch-icon', href: '/icons/apple-touch-icon.png' },
    ],
  }),
  component: Root,
  shellComponent: RootDocument,
})

function Root() {
  const { user } = Route.useRouteContext()
  const latestTopicId = Route.useLoaderData()
  const { pathname } = useLocation()
  const focus = /^\/play\/[^/]+\/?$/.test(pathname) // an active session has no chrome
  const nav = user && !focus && !/^\/(org|admin)(\/|$)/.test(pathname)

  useEffect(() => {
    void navigator.serviceWorker?.register('/sw.js')
  }, [])

  return (
    <>
      {!focus && <TopBar signIn={(!user || user.isAnonymous) && pathname !== '/sign-in'} />}
      <Outlet />
      {nav && <BottomNav topicId={latestTopicId} />}
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
