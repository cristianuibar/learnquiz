import { useEffect, useRef } from 'react'
import { brandCss } from '@learnquiz/tokens'
import { HeadContent, Outlet, Scripts, createRootRoute, redirect, useLocation, useRouter, useRouterState } from '@tanstack/react-router'
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
      { name: 'theme-color', content: loaderData?.branding?.accent ?? '#0E5A73' },
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
      { rel: 'icon', type: 'image/svg+xml', href: '/brand/learnquiz-mark.svg', media: '(prefers-color-scheme: light)' },
      { rel: 'icon', type: 'image/svg+xml', href: '/brand/learnquiz-mark-dark.svg', media: '(prefers-color-scheme: dark)' },
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
  const bare = /^\/(?:join\/.*|welcome|sign-in|today|me\/profile|me\/flag|me\/settings|play(?:\/.*)?|opt-in|t\/.*|org\/.*|admin(?:\/.*)?)\/?$/.test(pathname) // screens that bring their own header
  const nav = user && /^\/(?:today|t\/[^/]+\/path|me|me\/profile)\/?$/.test(pathname) // the four bottom-nav screens
  const resolved = useRouterState({ select: (s) => s.resolvedLocation?.pathname })
  const router = useRouter()
  const previousPath = useRef(pathname)

  // After a navigation, move focus to the new page's heading (not on first load).
  useEffect(() => {
    // Initial resolution and StrictMode effect replay are not page changes.
    if (!resolved || resolved === previousPath.current) return
    previousPath.current = resolved
    const key = router.state.resolvedLocation?.state.focus
    const control = key && document.querySelector<HTMLElement>(`[data-focus="${key}"]`)
    if (control) {
      control.focus()
      return
    }
    const h1 = document.querySelector('h1')
    if (!h1) return
    if (!h1.hasAttribute('tabindex')) h1.tabIndex = -1
    h1.focus()
  }, [resolved])

  useEffect(() => {
    void navigator.serviceWorker?.register('/sw.js')
  }, [])

  return (
    <>
      {!bare && <TopBar branding={branding} home={user ? '/today' : '/'} signIn={(!user || user.isAnonymous) && pathname !== '/sign-in'} />}
      <Outlet />
      {nav && <BottomNav topicId={latestTopicId} />}
    </>
  )
}

// Applies the stored appearance (absent = system) before first paint.
const THEME_SCRIPT = "try{var t=localStorage.getItem('lq-theme');if(t==='light'||t==='dark')document.documentElement.dataset.theme=t}catch(e){}"

function RootDocument({ children }: { children: React.ReactNode }) {
  const data = Route.useLoaderData()
  const accent = data?.branding?.accent
  const css = accent ? brandCss(accent) : ''
  return (
    <html lang="en" suppressHydrationWarning>
      <head>
        <script dangerouslySetInnerHTML={{ __html: THEME_SCRIPT }} />
        <HeadContent />
        {css && <style dangerouslySetInnerHTML={{ __html: css }} />}
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
