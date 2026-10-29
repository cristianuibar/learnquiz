import { useState } from 'react'
import { createFileRoute, useRouter } from '@tanstack/react-router'
import { CredentialsForm } from '@/components/credentials-form'
import { RouteError } from '@/components/inline-error'
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
  canceled: 'This invite was cancelled. Ask your company for a new one.',
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
    if (error) throw new Error(error.message ?? 'Could not join')
    await router.navigate({ to: '/welcome' })
    await router.invalidate()
  }

  const message = !invite ? 'This invite link is not valid.' : invite.status !== 'pending' ? closed[invite.status] : ''
  return (
    <main className="mx-auto w-full max-w-xl px-4 pt-8 pb-16">
      <h1 className="mb-8 text-3xl font-bold tracking-tight">{invite ? `Join ${invite.company}` : 'Invite'}</h1>
      {message ? (
        <p role="alert" className="font-medium">
          {message}
        </p>
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
            <Button
              className="h-11 self-end px-6"
              disabled={busy}
              onClick={async () => {
                setBusy(true)
                setError('')
                try {
                  await accept()
                } catch (err) {
                  setError(err instanceof Error ? err.message : 'Could not join')
                  setBusy(false)
                }
              }}
            >
              Join {invite.company}
            </Button>
          </div>
        ) : (
          <CredentialsForm email={invite.email} name={invite.name} onDone={accept} />
        ))
      )}
    </main>
  )
}
