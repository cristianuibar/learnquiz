import { useEffect, useRef, useState } from 'react'
import { createFileRoute, Link, useRouter } from '@tanstack/react-router'
import { renderSVG } from 'uqr'
import { RouteError, useFocusInvalid } from '@/components/inline-error'
import { Button } from '@/components/ui/button'
import { Dialog, DialogClose, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle, DialogTrigger } from '@/components/ui/dialog'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { authClient } from '@/lib/auth-client'
import { plural } from '@/lib/utils'
import { getPeople } from '@/server/org'

export const Route = createFileRoute('/org/$slug/people')({
  loader: ({ params }) => getPeople({ data: { slug: params.slug } }),
  errorComponent: RouteError,
  component: People,
})

const date = (at: number) => new Date(at).toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric', timeZone: 'UTC' })

type Invite = ReturnType<typeof Route.useLoaderData>['invites'][number]

function InviteRow({ invite, link, isNew, onRevoke }: { invite: Invite; link: string; isNew: boolean; onRevoke: () => Promise<void> }) {
  const [copied, setCopied] = useState(false)
  const [qr, setQr] = useState(false)
  const rowRef = useRef<HTMLLIElement>(null)
  const copyRef = useRef<HTMLButtonElement>(null)
  const qrRef = useRef<HTMLImageElement>(null)
  // Bring a just-created invite's sharing controls into view and hand focus to Copy link.
  useEffect(() => {
    if (!isNew) return
    rowRef.current?.scrollIntoView({ block: 'nearest' })
    copyRef.current?.focus({ preventScroll: true })
  }, [isNew])
  useEffect(() => {
    if (qr) qrRef.current?.scrollIntoView({ block: 'nearest' })
  }, [qr])
  return (
    <li ref={rowRef} className="scroll-m-4 flex flex-col gap-2 rounded-lg border p-4">
      <p className="font-medium">
        {invite.name} <span className="font-normal text-ink-muted">{invite.email}</span>
      </p>
      <p className="text-body">
        {invite.jobRole} · {invite.expired ? 'Expired' : 'Invited'}
      </p>
      {!invite.expired && <p className="text-caption break-all text-ink-muted">{link}</p>}
      <div className="flex flex-wrap gap-2">
        {!invite.expired && (
          <>
            <Button
              ref={copyRef}
              variant="secondary"
              className="px-4"
              onClick={async () => {
                await navigator.clipboard.writeText(link)
                setCopied(true)
              }}
            >
              {copied ? 'Copied' : 'Copy link'}
            </Button>
            <Button variant="secondary" className="px-4" aria-expanded={qr} onClick={() => setQr(!qr)}>
              QR code
            </Button>
          </>
        )}
        <Dialog>
          <DialogTrigger asChild>
            <Button variant="ghost" className="px-4">
              Revoke invite
            </Button>
          </DialogTrigger>
          <DialogContent>
            <DialogHeader>
              <DialogTitle>Revoke invite?</DialogTitle>
              <DialogDescription>The link stops working for {invite.email}.</DialogDescription>
            </DialogHeader>
            <DialogFooter>
              <DialogClose asChild>
                <Button variant="secondary" className="px-4">
                  Keep invite
                </Button>
              </DialogClose>
              <DialogClose asChild>
                <Button variant="secondary" className="px-4" onClick={onRevoke}>
                  Revoke invite
                </Button>
              </DialogClose>
            </DialogFooter>
          </DialogContent>
        </Dialog>
      </div>
      {qr && <img ref={qrRef} alt={`QR code for the invite link of ${invite.name}`} className="size-56 scroll-m-4" src={`data:image/svg+xml,${encodeURIComponent(renderSVG(link))}`} />}
    </li>
  )
}

function People() {
  const org = Route.useLoaderData()
  const router = useRouter()
  const [error, setError] = useState('')
  const [busy, setBusy] = useState(false)
  const [fields, setFields] = useState<Record<string, string>>({})
  const [newInviteId, setNewInviteId] = useState('')
  const formRef = useFocusInvalid(fields)

  async function invite(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault()
    const form = e.currentTarget
    const f = new FormData(form)
    const name = String(f.get('name')).trim()
    const email = String(f.get('email')).trim()
    setError('')
    const missing: Record<string, string> = {}
    if (!name) missing.name = 'Enter a name'
    if (!email) missing.email = 'Enter an email'
    setFields(missing)
    if (Object.keys(missing).length) return
    setBusy(true)
    // shortcut: no email service, so invites are links the partner copies or shows as a QR code; add magic links and invite emails when an email provider is chosen.
    const { data, error } = await authClient.organization.inviteMember({
      organizationId: org.id,
      email,
      role: 'member',
      inviteeName: name,
      jobRoleId: String(f.get('role')),
    })
    setBusy(false)
    if (error?.code === 'USER_IS_ALREADY_INVITED_TO_THIS_ORGANIZATION' || error?.code === 'USER_IS_ALREADY_A_MEMBER_OF_THIS_ORGANIZATION') {
      return setFields({ email: error.message ?? 'This email is already invited' })
    }
    if (error) return setError(error.message ?? 'Could not create the invite')
    form.reset()
    await router.invalidate()
    setNewInviteId(data.id)
  }

  async function revoke(invitationId: string) {
    const { error } = await authClient.organization.cancelInvitation({ invitationId })
    if (error) return setError(error.message ?? 'Could not revoke the invite')
    await router.invalidate()
  }

  return (
    <main className="mx-auto w-full max-w-[1120px] px-4 pt-8 pb-16">
      <h1 className="text-title-1 text-ink">People at {org.name}</h1>
      {org.readOnly && <p className="mt-4 text-body text-ink-muted">Staff view · Read only</p>}
      {!org.readOnly && <form className="mt-8 flex max-w-xl flex-col gap-6" ref={formRef} onSubmit={invite}>
        <div className="flex flex-col gap-2">
          <Label htmlFor="name">Name</Label>
          <Input id="name" name="name" maxLength={80} required aria-invalid={!!fields.name || undefined} aria-describedby={fields.name ? 'name-error' : undefined} />
          {fields.name && <p id="name-error" role="alert" className="text-body font-medium text-wrong">{fields.name}</p>}
        </div>
        <div className="flex flex-col gap-2">
          <Label htmlFor="email">Email</Label>
          <Input id="email" name="email" type="email" required aria-invalid={!!fields.email || undefined} aria-describedby={fields.email ? 'email-error' : undefined} />
          {fields.email && <p id="email-error" role="alert" className="text-body font-medium text-wrong">{fields.email}</p>}
        </div>
        <div className="flex flex-col gap-2">
          <Label htmlFor="role">Job role</Label>
          <select
            id="role"
            name="role"
            className="min-h-12 w-full rounded-md border-2 border-border-strong bg-surface-card px-4 text-body-lg"
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
          <p role="alert" className="text-body font-medium text-wrong">
            {error}
          </p>
        )}
        <Button type="submit" className="self-end px-6" disabled={busy}>
          Create invite link
        </Button>
      </form>}
      {org.invites.length > 0 && (
        <section className="mt-8">
          <h2 className="text-title-2">Invited</h2>
          <ul className="mt-4 flex flex-col gap-3">
            {org.invites.map((i) => (
              <InviteRow key={i.id} invite={i} link={`${org.baseUrl}/join/${i.id}`} isNew={i.id === newInviteId} onRevoke={() => revoke(i.id)} />
            ))}
          </ul>
        </section>
      )}
      <section className="mt-8">
        <h2 className="text-title-2">Members</h2>
        {org.members.length === 0 && <p className="mt-4 text-body text-ink-muted">{org.readOnly ? 'No members yet.' : 'Invite your first employee.'}</p>}
        <ul className="mt-4 flex flex-col gap-3">
          {org.members.map((m) => (
            <li key={m.id} className="rounded-lg border p-4">
              <p className="font-medium">
                {org.readOnly ? m.name : (
                  <Link to="/org/$slug/people/$id" params={{ slug: org.slug, id: m.userId }} className="inline-flex min-h-11 items-center text-primary underline focus-visible:outline-2">
                    {m.name}
                  </Link>
                )}{' '}
                <span className="font-normal text-ink-muted">{m.email}</span>
              </p>
              <p className="text-body">{[m.role, m.jobRole].filter(Boolean).join(' · ')}</p>
              <p className="mt-2 text-body">
                {!m.training ? 'Active' : m.training.stage === 'proficient' ? 'Proficient' : m.training.progress > 0 ? 'Still learning' : 'Not started'}
                {m.training?.daysToProficiency != null && ` · ${plural(m.training.daysToProficiency, 'day', 'days')} to proficiency`}
              </p>
              {m.training && (
                <>
                  <div className="mt-2 flex items-center gap-3 text-body">
                    <progress className="h-2 w-40" value={m.training.progress} max={1} aria-label="Progress toward benchmark" />
                    <span>{Math.round(m.training.progress * 100)}% of benchmark</span>
                  </div>
                  {m.training.criticalConfidentErrors > 0 && (
                    <p className="mt-1 text-body font-medium text-wrong">
                      {plural(m.training.criticalConfidentErrors, 'confident error', 'confident errors')} on a critical step
                    </p>
                  )}
                </>
              )}
              <p className="mt-1 text-caption text-ink-muted">Last active: {m.lastActiveAt === null ? '-' : date(m.lastActiveAt)}</p>
            </li>
          ))}
        </ul>
      </section>
    </main>
  )
}
