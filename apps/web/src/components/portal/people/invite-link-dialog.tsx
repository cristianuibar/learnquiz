import { useEffect, useId, useRef, useState } from 'react'
import { useRouter } from '@tanstack/react-router'
import { Copy } from 'lucide-react'
import { renderSVG } from 'uqr'
import { Banner } from '@/components/admin/banner'
import { Button } from '@/components/ui/button'
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { authClient } from '@/lib/auth-client'

export type InviteLink = { invitationId: string; name: string; email: string; jobRoleId: string; jobRole: string | null; expiresAt: number }

type InviteFields = Pick<InviteLink, 'name' | 'email' | 'jobRoleId' | 'jobRole'>
type CreateResult = { invite: InviteLink; error?: undefined } | { invite?: undefined; error: { code?: string; message?: string } }

// shortcut: no email service, so invites are links the partner copies or shows as a QR code.
export async function createInvite(organizationId: string, p: InviteFields): Promise<CreateResult> {
  const { data, error } = await authClient.organization.inviteMember({ organizationId, email: p.email, role: 'member', inviteeName: p.name, jobRoleId: p.jobRoleId })
  if (error || !data) return { error: error ?? { message: 'Could not create the invite' } }
  const created = data as { id: string; expiresAt: string | number | Date }
  return { invite: { invitationId: created.id, name: p.name, email: p.email, jobRoleId: p.jobRoleId, jobRole: p.jobRole, expiresAt: new Date(created.expiresAt).getTime() } }
}

const monthDay = (at: number) => new Date(at).toLocaleDateString('en-US', { month: 'short', day: 'numeric', timeZone: 'UTC' })

export function InviteLinkDialog({ invites, organizationId, baseUrl, onClose, onCloseAutoFocus }: {
  invites: InviteLink[] | null
  organizationId: string
  baseUrl: string
  onClose: () => void
  onCloseAutoFocus?: (e: Event) => void
}) {
  const router = useRouter()
  const linkId = useId()
  const titleRef = useRef<HTMLHeadingElement>(null)
  const copyRef = useRef<HTMLButtonElement>(null)
  const undoRef = useRef<HTMLButtonElement>(null)
  // Where focus goes after the next render: the heading on each step, Undo after Revoke, Copy link after Undo.
  const focusNext = useRef<'copy' | 'undo' | null>(null)
  const [source, setSource] = useState(invites)
  const [list, setList] = useState<InviteLink[]>(invites ?? [])
  const [index, setIndex] = useState(0)
  const [revoked, setRevoked] = useState<Record<number, boolean>>({})
  const [copied, setCopied] = useState(false)
  const [error, setError] = useState('')
  if (source !== invites) {
    setSource(invites)
    // Keep the last person while the dialog animates closed.
    if (invites) setList(invites)
    setIndex(0)
    setRevoked({})
    setCopied(false)
    setError('')
  }
  const open = invites !== null && invites.length > 0
  const invite = list[index]
  const isRevoked = !!revoked[index]
  useEffect(() => {
    if (!open) return
    const to = focusNext.current
    focusNext.current = null
    const target = to === 'copy' ? copyRef : to === 'undo' ? undoRef : titleRef
    target.current?.focus()
  }, [index, open, invite?.invitationId, isRevoked])

  if (!invite) return null
  const link = `${baseUrl}/join/${invite.invitationId}`
  const step = (to: number) => {
    setIndex(to)
    setCopied(false)
    setError('')
  }

  async function revoke() {
    focusNext.current = 'undo'
    setRevoked((r) => ({ ...r, [index]: true }))
    setCopied(false)
    setError('')
    const { error } = await authClient.organization.cancelInvitation({ invitationId: invite.invitationId })
    if (error) {
      setRevoked((r) => ({ ...r, [index]: false }))
      return setError(error.message ?? 'Could not revoke the link')
    }
    void router.invalidate()
  }

  async function undo() {
    setError('')
    const res = await createInvite(organizationId, invite)
    if (res.error) return setError(res.error.message ?? 'Could not create the invite')
    focusNext.current = 'copy'
    setList((l) => l.map((x, i) => (i === index ? res.invite : x)))
    setRevoked((r) => ({ ...r, [index]: false }))
    setCopied(false)
    void router.invalidate()
  }

  async function copy() {
    if (isRevoked) return
    setError('')
    try {
      await navigator.clipboard.writeText(link)
      setCopied(true)
    } catch {
      setError('Could not copy the link. Select it and copy it yourself.')
    }
  }

  return (
    <Dialog open={open} onOpenChange={(o) => !o && onClose()}>
      <DialogContent size="wide" aria-describedby={undefined} initialFocus={titleRef} onCloseAutoFocus={onCloseAutoFocus}>
        <DialogHeader>
          <DialogTitle ref={titleRef} tabIndex={-1} className="focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-brand">
            Invite link for {invite.name}
          </DialogTitle>
        </DialogHeader>
        <div className="flex flex-row flex-wrap items-start gap-6">
          <div className="inline-block flex-none rounded-md border border-border bg-surface-card p-4 leading-none">
            <img
              src={`data:image/svg+xml,${encodeURIComponent(renderSVG(link))}`}
              alt={`QR code for the invite link of ${invite.name}`}
              width={288}
              height={288}
              className={`size-[288px] max-w-full motion-safe:transition-opacity ${isRevoked ? 'opacity-15' : ''}`}
            />
          </div>
          <div className="flex flex-[1_1_260px] flex-col gap-4">
            <div className="flex flex-col gap-2">
              <Label htmlFor={linkId}>Invite link</Label>
              <Input id={linkId} readOnly className="bg-surface-sunken" value={link} onFocus={(e) => e.currentTarget.select()} />
            </div>
            <div className="flex flex-wrap items-center gap-3">
              <Button ref={copyRef} variant="primary" aria-disabled={isRevoked || undefined} className="aria-disabled:cursor-not-allowed aria-disabled:opacity-50" onClick={copy}>
                <Copy aria-hidden className="size-4" />
                Copy link
              </Button>
              <p role="status" className="text-body text-ink">
                {copied && !isRevoked ? 'Link copied' : ''}
              </p>
            </div>
            <p className="text-caption text-ink-muted">
              Joins as {invite.jobRole ?? 'No job role'} · Expires {monthDay(invite.expiresAt)} · Works once
            </p>
            {error && <Banner kind="alert">{error}</Banner>}
          </div>
        </div>
        <DialogFooter className="items-center">
          <div role="status" className="mr-auto flex items-center gap-2">
            {isRevoked ? (
              <>
                <span className="text-body text-ink">Link revoked</span>
                <span aria-hidden className="text-ink-muted">·</span>
                <Button ref={undoRef} variant="link" onClick={undo}>
                  Undo
                </Button>
              </>
            ) : (
              <Button variant="ghost" onClick={revoke}>
                Revoke link
              </Button>
            )}
          </div>
          {list.length > 1 && (
            <>
              <p className="text-caption text-ink-muted">
                {index + 1} of {list.length}
              </p>
              <Button variant="secondary" disabled={index === 0} onClick={() => step(index - 1)}>
                Previous
              </Button>
              <Button variant="secondary" disabled={index === list.length - 1} onClick={() => step(index + 1)}>
                Next
              </Button>
            </>
          )}
          <Button variant="secondary" onClick={onClose}>
            Done
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
