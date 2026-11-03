import { HeadContent, Link, Outlet, Scripts, createRootRoute, useMatch } from '@tanstack/react-router'
import type { ReactNode } from 'react'
import styles from '../styles.css?url'
import { themeBootstrap } from '../theme'

export const Route = createRootRoute({
  head: ({ matches }) => {
    const title = 'Learn Quiz: onboarding from your own SOPs'
    const description = 'Upload a role’s SOPs. New hires practice them on their phone in five-minute sessions until they reach your benchmark. Every explanation quotes your document.'
    const url = new URL(matches.at(-1)?.pathname ?? '/', 'https://learnquiz.com').href
    const image = 'https://learnquiz.com/og.png'
    const imageAlt = 'The headline “New hires learn the job from your own SOPs.” beside a phone showing the scanner question with “Stop the pick” selected.'

    return {
      meta: [
        { charSet: 'utf-8' },
        { name: 'viewport', content: 'width=device-width, initial-scale=1' },
        { title },
        { name: 'description', content: description },
        { property: 'og:type', content: 'website' },
        { property: 'og:site_name', content: 'Learn Quiz' },
        { property: 'og:title', content: title },
        { property: 'og:description', content: description },
        { property: 'og:url', content: url },
        { property: 'og:image', content: image },
        { property: 'og:image:type', content: 'image/png' },
        { property: 'og:image:width', content: '1200' },
        { property: 'og:image:height', content: '630' },
        { property: 'og:image:alt', content: imageAlt },
        { name: 'twitter:card', content: 'summary_large_image' },
        { name: 'twitter:title', content: title },
        { name: 'twitter:description', content: description },
        { name: 'twitter:image', content: image },
        { name: 'twitter:image:alt', content: imageAlt },
        { name: 'theme-color', media: '(prefers-color-scheme: light)', content: '#F7F6F2' },
        // Meta names are case-insensitive; distinct casing preserves both through Router's name deduplication.
        { name: 'Theme-Color', media: '(prefers-color-scheme: dark)', content: '#121417' },
      ],
      links: [
        { rel: 'stylesheet', href: styles },
        { rel: 'canonical', href: url },
        { rel: 'icon', type: 'image/svg+xml', href: '/favicon.svg' },
        { rel: 'icon', type: 'image/png', sizes: '32x32', href: '/favicon-32.png' },
        { rel: 'apple-touch-icon', href: '/apple-touch-icon.png' },
      ],
    }
  },
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
    <html lang="en" suppressHydrationWarning>
      <head>
        <script dangerouslySetInnerHTML={{ __html: themeBootstrap }} />
        <HeadContent />
      </head>
      <body className="bg-surface-page font-sans text-body text-ink antialiased">
        {children}
        <Scripts />
      </body>
    </html>
  )
}
