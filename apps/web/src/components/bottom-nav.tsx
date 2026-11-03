import { Link, useLocation } from '@tanstack/react-router'
import { House, Route, User } from 'lucide-react'
import type { ReactNode } from 'react'
import { cn } from '@/lib/utils'

const tab = (active: boolean) =>
  cn(
    'flex flex-col items-center justify-center gap-0.5 text-xs/4 font-semibold',
    active ? 'text-brand' : 'text-ink-muted',
  )

// Icon sits in a pill that is tinted when the tab is active.
const pill = (active: boolean, icon: ReactNode, extra?: string) => (
  <span className={cn('flex h-[30px] w-14 items-center justify-center rounded-full', active && 'bg-brand-tint', extra)}>
    {icon}
  </span>
)

// Link directly to the learner screen to avoid redirecting through the landing page.
export function BottomNav({ topicId }: { topicId: string | null }) {
  const { pathname } = useLocation()
  const today = pathname === '/today' || pathname === '/today/'
  const path = pathname.startsWith('/t/')
  const me = pathname === '/me' || pathname.startsWith('/me/')
  return (
    <>
      <div aria-hidden className="h-[calc(4rem+env(safe-area-inset-bottom))]" />
      <nav
        aria-label="Main"
        className="fixed inset-x-0 bottom-0 z-40 border-t border-border bg-surface-card pb-[env(safe-area-inset-bottom)]"
      >
        <div className="mx-auto grid h-16 max-w-xl grid-cols-3">
          <Link to={topicId ? '/today' : '/start'} className={tab(today)} aria-current={today ? 'page' : undefined}>
            {pill(today, <House className="size-6" aria-hidden />)}
            Today
          </Link>
          {topicId ? (
            <Link to="/t/$topicId/path" params={{ topicId }} className={tab(path)} aria-current={path ? 'page' : undefined}>
              {pill(path, <Route className="size-6" aria-hidden />)}
              Path
            </Link>
          ) : (
            <span aria-disabled="true" className={cn(tab(false), 'cursor-not-allowed text-ink-muted')}>
              {pill(false, <Route className="size-6" aria-hidden />, 'border-2 border-dashed border-border-strong bg-surface-sunken')}
              Path
            </span>
          )}
          <Link to="/me" className={tab(me)} aria-current={me ? 'page' : undefined}>
            {pill(me, <User className="size-6" aria-hidden />)}
            Profile
          </Link>
        </div>
      </nav>
    </>
  )
}
