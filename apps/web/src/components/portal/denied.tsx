import { useEffect, useRef, useState } from 'react'
import { LearnQuizMark } from '@/components/learn-quiz-mark'
import { useSignOut } from '@/components/inline-error'
import { Button } from '@/components/ui/button'
import { getAccessContext } from '@/server/org-shell'

type Access = { email: string; company?: string | null; owner?: string | null }

// Shown in place of a portal the signed-in person may not open. No navigation: the only way out is another account.
// Without an email (still loading) the paragraph is left out.
export function Denied({ email, company, owner }: { email?: string; company?: string | null; owner?: string | null }) {
  const heading = useRef<HTMLHeadingElement>(null)
  const { busy, error, signOut } = useSignOut()
  useEffect(() => heading.current?.focus(), [])
  return (
    <div className="flex min-h-screen flex-col gap-8 bg-surface-page px-4 py-6 md:px-8">
      <div className="flex items-center gap-2 text-label text-ink">
        <LearnQuizMark className="size-6" />
        <span>Learn Quiz</span>
      </div>
      <main className="flex flex-1 items-start justify-center md:items-center">
        <section aria-labelledby="denied-heading" className="flex w-full max-w-[480px] flex-col gap-4 rounded-md border border-border bg-surface-card p-6 text-ink md:p-8">
          <h1 id="denied-heading" ref={heading} tabIndex={-1} className="text-title-1">No access to this portal</h1>
          {email && (
            <p className="text-body text-ink-muted">
              You're signed in as <strong className="font-semibold text-ink">{email}</strong>.{' '}
              {company ? `Only owners and admins can open ${company}'s portal.` : 'Only owners and admins can open this portal.'}
              {company && owner ? ` Ask ${owner} to make you an admin.` : ''}
            </p>
          )}
          <Button className="min-h-12 w-full" disabled={busy} onClick={() => void signOut()}>
            Sign in with another account
          </Button>
          {error && <p role="alert" className="text-body font-medium text-ink">{error}</p>}
        </section>
      </main>
    </div>
  )
}

// Looks up who the viewer is and who to ask; the card and its way out show before that arrives, and if it fails.
export function PortalDenied({ slug }: { slug: string }) {
  const [access, setAccess] = useState<Access>()
  useEffect(() => {
    let live = true
    getAccessContext({ data: { slug } }).then((a) => live && setAccess(a), () => {})
    return () => { live = false }
  }, [slug])
  return <Denied {...access} />
}
