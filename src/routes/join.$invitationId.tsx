import { useState } from 'react'
import { createFileRoute, Link, useRouter } from '@tanstack/react-router'
import { CredentialsForm } from '@/components/credentials-form'
import { RouteError, errorMessage } from '@/components/inline-error'
import { Button } from '@/components/ui/button'
import { authClient } from '@/lib/auth-client'
import { getInvite } from '@/server/org'

export const Route = createFileRoute('/join/$invitationId')({
  loader: ({ params }) => getInvite({ data: { id: params.invitationId } }),
  errorComponent: RouteError,
  component: Join,
})

const closed: Record<string, string> = {
  expired: 'This invite has expired. Ask your company for a new one.',
  canceled: 'This invite was revoked. Ask your company for a new one.',
  accepted: 'This invite was already used.',
  rejected: 'This invite was declined. Ask your company for a new one.',
}

function Join() {
  const invite = Route.useLoaderData()
  const { invitationId } = Route.useParams()
  const { user } = Route.useRouteContext()
  const router = useRouter()
  const [error, setError] = useState('')
  const [busy, setBusy] = useState(false)

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

  const message = !invite ? 'This invite link is not valid.' : invite.status !== 'pending' ? closed[invite.status] : ''
  return (
    <main className="mx-auto w-full max-w-xl px-4 pt-8 pb-16">
      <h1 className="mb-8 text-3xl font-bold tracking-tight">{invite ? `Join ${invite.company}` : 'Invite'}</h1>
      {message ? (
        <div className="flex flex-col gap-6">
          <p role="alert" className="font-medium">
            {message}
          </p>
          {invite?.status === 'accepted' &&
            (!user || user.isAnonymous ? (
              <Button className="h-12 self-end px-6" asChild>
                <Link to="/sign-in" search={{ redirect: '/today', email: invite.email }}>
                  Sign in as {invite.email}
                </Link>
              </Button>
            ) : (
              !invite.otherAccount && (
                <Button className="h-12 self-end px-6" asChild>
                  <Link to="/today">Continue to Today</Link>
                </Button>
              )
            ))}
        </div>
      ) : (
        invite &&
        (user && !user.isAnonymous ? (
          <div className="flex flex-col gap-6">
            <p>
              Signed in as {user.name}. This invite is for {invite.email}.
            </p>
            {error && (
              <p role="alert" className="text-sm font-medium text-wrong">
                {error}
              </p>
            )}
            {invite.otherAccount ? (
              <Button
                className="h-12 self-end px-6"
                disabled={busy}
                onClick={async () => {
                  setBusy(true)
                  setError('')
                  const { error } = await authClient.signOut()
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
                className="h-12 self-end px-6"
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
          </div>
        ) : (
          <CredentialsForm email={invite.email} name={invite.name} onDone={accept} />
        ))
      )}
    </main>
  )
}
