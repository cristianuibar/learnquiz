import { useEffect, useRef } from 'react'
import { Link, useRouteContext } from '@tanstack/react-router'
import { RouteError } from '@/components/inline-error'
import { LearnQuizMark } from '@/components/learn-quiz-mark'
import { Button } from '@/components/ui/button'

// Shown in place of the staff admin when a signed-in non-staff account opens it; the URL stays.
export function StaffDenied({ email, home }: { email: string; home: string }) {
  const heading = useRef<HTMLHeadingElement>(null)
  useEffect(() => heading.current?.focus(), [])
  return (
    <div className="flex min-h-screen flex-col">
      <header className="flex min-h-[72px] items-center gap-2 px-8">
        <LearnQuizMark className="size-8 shrink-0" />
        <span className="text-label text-ink">Learn Quiz</span>
      </header>
      <main className="flex flex-1 flex-col items-center justify-center px-4 pt-6 pb-24">
        <section aria-labelledby="staff-denied-title" className="flex w-full max-w-[480px] flex-col gap-6 rounded-md border border-border bg-surface-card p-8">
          <div className="flex flex-col gap-3">
            <h1 id="staff-denied-title" ref={heading} tabIndex={-1} className="text-title-1 text-ink outline-none">No access to the staff admin</h1>
            <p className="text-body text-ink">Only Learn Quiz staff can open it. You're signed in as <strong>{email}</strong>.</p>
          </div>
          <Button asChild className="w-full">
            <Link to={home}>Go to your portal</Link>
          </Button>
        </section>
      </main>
    </div>
  )
}

// Route error boundary for staff-only routes: 403 shows the denied page, anything else the usual error.
export function StaffRouteError(props: { error: unknown; reset: () => void }) {
  const { user, adminCompanies } = useRouteContext({ from: '__root__' })
  if ((props.error as { status?: unknown } | null)?.status !== 403) return <RouteError {...props} />
  // The first company the person owns or administers, by membership date.
  const first = adminCompanies[0]
  return <StaffDenied email={user?.email ?? ''} home={first ? `/org/${first.slug}` : '/today'} />
}
