import { useEffect, useRef, useState } from 'react'
import { createFileRoute, Link, useRouter } from '@tanstack/react-router'
import { initials, roleHeadline } from '@learnquiz/api/invite'
import { CredentialsForm } from '@/components/credentials-form'
import { RouteError, errorMessage } from '@/components/inline-error'
import { LearnQuizMark } from '@/components/learn-quiz-mark'
import { ErrorRow } from '@/components/question/error-row'
import { Button } from '@/components/ui/button'
import { authClient } from '@/lib/auth-client'
import { getInvite } from '@/server/org'

export const Route = createFileRoute('/join/$invitationId')({
  loader: ({ params }) => getInvite({ data: { id: params.invitationId } }),
  errorComponent: RouteError,
  component: Join,
})

const closed: Record<string, string> = {
  expired: 'This invite has expired',
  canceled: 'This invite was revoked',
  rejected: 'This invite was declined',
}

function Join() {
  const invite = Route.useLoaderData()
  const { invitationId } = Route.useParams()
  const { user, facebookEnabled } = Route.useRouteContext()
  const router = useRouter()
  const [error, setError] = useState('')
  const [busy, setBusy] = useState(false)
  const [android, setAndroid] = useState(false)
  const headingRef = useRef<HTMLHeadingElement>(null)

  useEffect(() => {
    setAndroid(/Android/i.test(navigator.userAgent))
  }, [])

  async function accept() {
    const { error } = await authClient.organization.acceptInvitation({ invitationId })
    if (error) {
      const failure = new Error(error.message ?? 'Could not join')
      setError(failure.message)
      await router.invalidate()
      throw failure
    }
    await router.navigate({ to: '/welcome' })
    await router.invalidate()
  }

  const signedIn = !!user && !user.isAnonymous
  const pending = invite?.status === 'pending'
  const headline = !invite
    ? "This invite link isn't valid"
    : pending
      ? roleHeadline(invite.roleName, invite.company)
      : invite.status === 'accepted'
        ? 'This invite was already used'
        : (closed[invite.status] ?? 'This invite has expired')

  useEffect(() => {
    headingRef.current?.focus()
  }, [headline])

  return (
    <main className="mx-auto flex min-h-dvh w-full max-w-xl flex-col px-4">
      <div className="flex flex-1 flex-col gap-6 pt-8 pb-4">
        <header className="flex flex-col gap-4">
          {invite && (
            <div className="flex items-center gap-3">
              {invite.logoUrl ? (
                <img src={invite.logoUrl} alt="" className="size-14 rounded-[12px] object-cover" />
              ) : (
                <div aria-hidden className="flex size-14 items-center justify-center rounded-[12px] bg-brand text-title-2 text-on-brand">
                  {initials(invite.company)}
                </div>
              )}
              <span className="text-label text-ink">{invite.company}</span>
            </div>
          )}
          <h1
            ref={headingRef}
            tabIndex={-1}
            className="text-title-1 text-ink focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-brand"
          >
            {headline}
          </h1>
        </header>

        {!invite && <p className="text-body text-ink-muted">Ask your company to send it again.</p>}
        {invite && !pending && invite.status !== 'accepted' && <p className="text-body text-ink-muted">Ask your company for a new one.</p>}

        {invite?.status === 'accepted' &&
          (!signedIn ? (
            <Button size="lg" className="w-full" asChild>
              <Link to="/sign-in" search={{ redirect: '/today', email: invite.email }}>
                Sign in as {invite.email}
              </Link>
            </Button>
          ) : (
            !invite.otherAccount && (
              <Button size="lg" className="w-full" asChild>
                <Link to="/today">Continue to Today</Link>
              </Button>
            )
          ))}

        {invite && pending && (
          <div className="flex flex-col gap-4">
            {!signedIn ? (
              <CredentialsForm
                email={invite.email}
                name={invite.name}
                onDone={accept}
                social={
                  facebookEnabled ? (
                    <Button
                      type="button"
                      variant="secondary"
                      size="lg"
                      className="w-full"
                      onClick={() => authClient.signIn.social({ provider: 'facebook', callbackURL: `/join/${invitationId}` })}
                    >
                      Continue with Facebook
                    </Button>
                  ) : undefined
                }
              />
            ) : (
              <>
                {invite.otherAccount && (
                  <p className="text-body text-ink">
                    You're signed in as {user.name}. This invite is for {invite.email}.
                  </p>
                )}
                {error && <ErrorRow message={error} />}
                {invite.otherAccount ? (
                  <Button
                    size="lg"
                    className="w-full"
                    disabled={busy}
                    onClick={async () => {
                      setBusy(true)
                      setError('')
                      const { error } = await authClient.signOut().catch(() => ({ error: { message: 'Could not sign out' } }))
                      if (error) {
                        setError(error.message ?? 'Could not sign out')
                        setBusy(false)
                        return
                      }
                      await router.invalidate()
                      await router.navigate({ to: '/sign-in', search: { redirect: `/join/${invitationId}`, email: invite.email } })
                    }}
                  >
                    Sign in as {invite.email}
                  </Button>
                ) : (
                  <Button
                    size="lg"
                    className="w-full"
                    disabled={busy}
                    onClick={async () => {
                      setBusy(true)
                      setError('')
                      try {
                        await accept()
                      } catch (err) {
                        setError(errorMessage(err, 'Could not join'))
                        setBusy(false)
                      }
                    }}
                  >
                    Join {invite.company}
                  </Button>
                )}
              </>
            )}
            {android && (
              <Button asChild variant="link" className="w-full">
                <a href={`learnquiz://join/${invitationId}`}>Open in the app</a>
              </Button>
            )}
          </div>
        )}
      </div>
      <footer className="flex items-center justify-center gap-2 py-3">
        <LearnQuizMark className="size-5" />
        <span className="text-caption text-ink-muted">Training by Learn Quiz</span>
      </footer>
    </main>
  )
}
