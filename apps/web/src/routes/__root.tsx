import { useEffect, type CSSProperties } from 'react'
import { HeadContent, Outlet, Scripts, createRootRoute, redirect, useLocation } from '@tanstack/react-router'
import { TanStackRouterDevtoolsPanel } from '@tanstack/react-router-devtools'
import { TanStackDevtools } from '@tanstack/react-devtools'
import { BottomNav } from '@/components/bottom-nav'
import { RouteError } from '@/components/inline-error'
import { TopBar } from '@/components/top-bar'
import { getLatestTopicIdFn } from '@/server/latest-topic'
import { getSessionFn } from '@/server/session-fn'
import { getCompanyBranding } from '@/server/org-settings'

import appCss from '../styles.css?url'

export const Route = createRootRoute({
  beforeLoad: async ({ location }) => {
    const session = await getSessionFn()
    // A company member must see the disclosure before any other screen.
    if (session.needsDisclosure && location.pathname !== '/welcome') throw redirect({ to: '/welcome', search: { redirect: location.href } })
    return session
  },
  loader: async ({ context }) => {
    const [latestTopicId, branding] = context.user ? await Promise.all([getLatestTopicIdFn(), getCompanyBranding()]) : [null, null]
    return { latestTopicId, branding }
  },
  errorComponent: RouteError,
  notFoundComponent: () => (
    <main className="mx-auto w-full max-w-xl px-4 pt-8">
      <p className="text-lg font-medium">Page not found.</p>
    </main>
  ),
  head: ({ loaderData }) => ({
    meta: [
      {
        charSet: 'utf-8',
      },
      {
        name: 'viewport',
        content: 'width=device-width, initial-scale=1, viewport-fit=cover, interactive-widget=resizes-content',
      },
      { name: 'theme-color', content: loaderData?.branding?.accent ?? '#00785f' },
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
  const { latestTopicId, branding } = Route.useLoaderData()
  const { pathname } = useLocation()
  const focus = /^\/play\/(?:quick\/)?[^/]+\/?$/.test(pathname) // an active session has no chrome
  const nav = user && !focus && !/^\/(org|admin|welcome|join|sign-in)(\/|$)/.test(pathname)

  useEffect(() => {
    void navigator.serviceWorker?.register('/sw.js')
  }, [])

  return (
    <>
      {!focus && <TopBar branding={branding} home={user ? '/today' : '/'} signIn={(!user || user.isAnonymous) && pathname !== '/sign-in'} />}
      <Outlet />
      {nav && <BottomNav topicId={latestTopicId} />}
    </>
  )
}

function RootDocument({ children }: { children: React.ReactNode }) {
  const data = Route.useLoaderData()
  const accent = data?.branding?.accent
  const style = accent ? { '--primary': accent, '--ring': accent, '--accent': `color-mix(in srgb, ${accent} 10%, white)`, '--accent-foreground': 'var(--foreground)' } as CSSProperties : undefined
  return (
    <html lang="en">
      <head>
        <HeadContent />
      </head>
      <body className="font-sans antialiased [overflow-wrap:anywhere]" style={style}>
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
