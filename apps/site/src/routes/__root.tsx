import { HeadContent, Link, Outlet, Scripts, createRootRoute, useMatch } from '@tanstack/react-router'
import type { ReactNode } from 'react'
import styles from '../styles.css?url'

export const Route = createRootRoute({
  head: () => ({
    meta: [
      { charSet: 'utf-8' },
      { name: 'viewport', content: 'width=device-width, initial-scale=1' },
      { title: 'Learn Quiz' },
      { name: 'description', content: 'Quiz practice for your training and development.' },
    ],
    links: [
      { rel: 'stylesheet', href: styles },
      { rel: 'icon', type: 'image/svg+xml', href: '/favicon.svg' },
    ],
  }),
  component: RootLayout,
  shellComponent: RootDocument,
})

function RootLayout() {
  const isHome = useMatch({ from: '/', shouldThrow: false })
  if (isHome) return <Outlet />

  return (
    <>
      <main className="mx-auto max-w-2xl px-4 py-12">
        <Outlet />
      </main>
      <footer className="mx-auto max-w-2xl px-4 pb-8">
        <nav aria-label="Site" className="flex flex-wrap gap-6">
          <Link to="/">Learn Quiz</Link>
          <Link to="/privacy">Privacy</Link>
          <Link to="/terms">Terms</Link>
        </nav>
      </footer>
    </>
  )
}

function RootDocument({ children }: { children: ReactNode }) {
  return (
    <html lang="en">
      <head>
        <HeadContent />
      </head>
      <body className="bg-surface-page font-sans text-body text-ink antialiased">
        {children}
        <Scripts />
      </body>
    </html>
  )
}
