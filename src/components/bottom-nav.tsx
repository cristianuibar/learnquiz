import { Link, useLocation } from '@tanstack/react-router'
import { CalendarCheck, Route, User } from 'lucide-react'
import { cn } from '@/lib/utils'

const tab = (active: boolean) =>
  cn(
    'flex min-h-14 flex-1 flex-col items-center justify-center gap-0.5 text-xs font-medium outline-none focus-visible:ring-[3px] focus-visible:ring-inset focus-visible:ring-ring/50',
    active ? 'text-primary' : 'text-muted-foreground',
  )

// Today is "/", which sends signed-in learners on to /start.
export function BottomNav({ topicId }: { topicId: string | null }) {
  const { pathname } = useLocation()
  const today = pathname === '/' || pathname === '/start' || pathname.startsWith('/play')
  const path = pathname.startsWith('/t/')
  const me = pathname.startsWith('/me')
  return (
    <>
      <div aria-hidden className="h-[calc(3.5rem+env(safe-area-inset-bottom))]" />
      <nav
        aria-label="Main"
        className="fixed inset-x-0 bottom-0 z-40 border-t bg-background pb-[env(safe-area-inset-bottom)]"
      >
        <div className="mx-auto flex max-w-xl">
          <Link to="/" className={tab(today)} aria-current={today ? 'page' : undefined}>
            <CalendarCheck className="size-6" aria-hidden />
            Today
          </Link>
          {topicId ? (
            <Link to="/t/$topicId/path" params={{ topicId }} className={tab(path)} aria-current={path ? 'page' : undefined}>
              <Route className="size-6" aria-hidden />
              Path
            </Link>
          ) : (
            <span aria-disabled="true" className={cn(tab(false), 'opacity-50')}>
              <Route className="size-6" aria-hidden />
              Path
            </span>
          )}
          <Link to="/me" className={tab(me)} aria-current={me ? 'page' : undefined}>
            <User className="size-6" aria-hidden />
            Profile
          </Link>
        </div>
      </nav>
    </>
  )
}
