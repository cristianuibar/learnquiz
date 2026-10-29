import { useState } from 'react'
import { createFileRoute, useRouter } from '@tanstack/react-router'
import { renderSVG } from 'uqr'
import { RouteError } from '@/components/inline-error'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { authClient } from '@/lib/auth-client'
import { getPeople } from '@/server/org'

export const Route = createFileRoute('/org/$slug/people')({
  loader: ({ params }) => getPeople({ data: { slug: params.slug } }),
  errorComponent: RouteError,
  component: People,
})

type Invite = ReturnType<typeof Route.useLoaderData>['invites'][number]

function InviteRow({ invite, link, onCancel }: { invite: Invite; link: string; onCancel: () => void }) {
  const [copied, setCopied] = useState(false)
  const [qr, setQr] = useState(false)
  return (
    <li className="flex flex-col gap-2 rounded-lg border p-4">
      <p className="font-medium">
        {invite.name} <span className="font-normal text-muted-foreground">{invite.email}</span>
      </p>
      <p className="text-sm">
        {invite.jobRole} · {invite.expired ? 'Expired' : 'Invited'}
      </p>
      {!invite.expired && <p className="text-sm break-all text-muted-foreground">{link}</p>}
      <div className="flex flex-wrap gap-2">
        {!invite.expired && (
          <>
            <Button
              variant="outline"
              className="h-11 px-4"
              onClick={async () => {
                await navigator.clipboard.writeText(link)
                setCopied(true)
              }}
            >
              {copied ? 'Copied' : 'Copy link'}
            </Button>
            <Button variant="outline" className="h-11 px-4" aria-expanded={qr} onClick={() => setQr(!qr)}>
              QR code
            </Button>
          </>
        )}
        <Button variant="ghost" className="h-11 px-4" onClick={onCancel}>
          Cancel
        </Button>
      </div>
      {qr && <img alt={`QR code for the invite link of ${invite.name}`} className="size-56" src={`data:image/svg+xml,${encodeURIComponent(renderSVG(link))}`} />}
    </li>
  )
}

function People() {
  const org = Route.useLoaderData()
  const router = useRouter()
  const [error, setError] = useState('')
  const [busy, setBusy] = useState(false)

  async function invite(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault()
    const form = e.currentTarget
    const f = new FormData(form)
    setBusy(true)
    setError('')
    // shortcut: no email service, so invites are links the partner copies or shows as a QR code; add magic links and invite emails when an email provider is chosen.
    const { error } = await authClient.organization.inviteMember({
      organizationId: org.id,
      email: String(f.get('email')).trim(),
      role: 'member',
      inviteeName: String(f.get('name')).trim(),
      jobRoleId: String(f.get('role')),
    })
    setBusy(false)
    if (error) return setError(error.message ?? 'Could not create the invite')
    form.reset()
    await router.invalidate()
  }

  async function cancel(invitationId: string) {
    const { error } = await authClient.organization.cancelInvitation({ invitationId })
    if (error) return setError(error.message ?? 'Could not cancel the invite')
    await router.invalidate()
  }

  return (
    <main className="mx-auto w-full max-w-3xl px-4 pt-8 pb-16">
      <h1 className="text-3xl font-bold tracking-tight">People at {org.name}</h1>
      <form className="mt-8 flex flex-col gap-6" onSubmit={invite}>
        <div className="flex flex-col gap-2">
          <Label htmlFor="name">Name</Label>
          <Input id="name" name="name" className="h-11" maxLength={80} required />
        </div>
        <div className="flex flex-col gap-2">
          <Label htmlFor="email">Email</Label>
          <Input id="email" name="email" type="email" className="h-11" required />
        </div>
        <div className="flex flex-col gap-2">
          <Label htmlFor="role">Job role</Label>
          <select
            id="role"
            name="role"
            className="h-11 w-full rounded-md border border-input bg-transparent px-3 text-base shadow-xs outline-none focus-visible:border-ring focus-visible:ring-[3px] focus-visible:ring-ring/50 md:text-sm"
            required
          >
            {org.roles.map((r) => (
              <option key={r.id} value={r.id}>
                {r.name}
              </option>
            ))}
          </select>
        </div>
        {error && (
          <p role="alert" className="text-sm font-medium text-wrong">
            {error}
          </p>
        )}
        <Button type="submit" className="h-11 self-end px-6" disabled={busy}>
          Create invite link
        </Button>
      </form>
      {org.invites.length > 0 && (
        <section className="mt-10">
          <h2 className="text-xl font-semibold">Invited</h2>
          <ul className="mt-4 flex flex-col gap-3">
            {org.invites.map((i) => (
              <InviteRow key={i.id} invite={i} link={`${org.baseUrl}/join/${i.id}`} onCancel={() => cancel(i.id)} />
            ))}
          </ul>
        </section>
      )}
      <section className="mt-10">
        <h2 className="text-xl font-semibold">Members</h2>
        <ul className="mt-4 flex flex-col gap-3">
          {org.members.map((m) => (
            <li key={m.id} className="rounded-lg border p-4">
              <p className="font-medium">
                {m.name} <span className="font-normal text-muted-foreground">{m.email}</span>
              </p>
              <p className="text-sm">{[m.role, m.jobRole].filter(Boolean).join(' · ')}</p>
            </li>
          ))}
        </ul>
      </section>
    </main>
  )
}
