import { useEffect, useId, useRef, useState } from 'react'
import { Plus } from 'lucide-react'
import { Banner } from '@/components/admin/banner'
import { FieldError, fieldProps } from '@/components/admin/field-error'
import { useFocusInvalid } from '@/components/inline-error'
import { Button } from '@/components/ui/button'
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Select } from '@/components/ui/select'
import { createInvite, type InviteLink } from './invite-link-dialog'

type Role = { id: string; name: string }
type Draft = { key: number; name: string; email: string; jobRoleId: string }
type Errors = Record<number, { name?: string; email?: string }>

const ALREADY = ['USER_IS_ALREADY_INVITED_TO_THIS_ORGANIZATION', 'USER_IS_ALREADY_A_MEMBER_OF_THIS_ORGANIZATION']

export function InviteDialog({ open, onOpenChange, organizationId, roles, onCreated, onCloseAutoFocus }: {
  open: boolean
  onOpenChange: (open: boolean) => void
  organizationId: string
  roles: Role[]
  onCreated: (invites: InviteLink[]) => void
  onCloseAutoFocus?: (e: Event) => void
}) {
  const uid = useId()
  const nextKey = useRef(1)
  const pending = useRef(false)
  const created = useRef<InviteLink[]>([])
  const focusKey = useRef<number | null>(null)
  const firstName = useRef<HTMLInputElement>(null)
  const blank = (key: number): Draft => ({ key, name: '', email: '', jobRoleId: roles[0]?.id ?? '' })
  const [people, setPeople] = useState<Draft[]>(() => [blank(0)])
  const [errors, setErrors] = useState<Errors>({})
  const [banner, setBanner] = useState('')
  const [busy, setBusy] = useState(false)
  const formRef = useFocusInvalid(errors as Record<string, never>)

  useEffect(() => {
    if (!open) return
    nextKey.current = 1
    created.current = []
    setPeople([blank(0)])
    setErrors({})
    setBanner('')
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open])

  // Focus a freshly added person's Name once it has rendered.
  useEffect(() => {
    if (focusKey.current === null) return
    document.getElementById(`${uid}-${focusKey.current}-name`)?.focus()
    focusKey.current = null
  }, [people, uid])

  const id = (key: number, field: string) => `${uid}-${key}-${field}`
  const edit = (key: number, patch: Partial<Draft>) => setPeople((ps) => ps.map((p) => (p.key === key ? { ...p, ...patch } : p)))

  function add() {
    const key = nextKey.current++
    focusKey.current = key
    setPeople((ps) => [...ps, blank(key)])
  }

  async function submit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault()
    if (pending.current) return
    setBanner('')
    const missing: Errors = {}
    for (const p of people) {
      const m: { name?: string; email?: string } = {}
      if (!p.name.trim()) m.name = 'Enter a name'
      if (!p.email.trim()) m.email = 'Enter an email'
      if (m.name || m.email) missing[p.key] = m
    }
    setErrors(missing)
    if (Object.keys(missing).length) return
    pending.current = true
    setBusy(true)
    const failed: Draft[] = []
    const failures: Errors = {}
    let message = ''
    for (const p of people) {
      const res = await createInvite(organizationId, { name: p.name.trim(), email: p.email.trim(), jobRoleId: p.jobRoleId, jobRole: roles.find((r) => r.id === p.jobRoleId)?.name ?? null })
      if (res.invite) { created.current.push(res.invite); continue }
      failed.push(p)
      if (res.error.code && ALREADY.includes(res.error.code)) failures[p.key] = { email: res.error.message ?? 'This email is already invited' }
      else message ||= res.error.message ?? 'Could not create the invite'
    }
    pending.current = false
    setBusy(false)
    if (!failed.length) return onCreated(created.current)
    setPeople(failed)
    setErrors(failures)
    setBanner(message)
    // Email errors are focused by useFocusInvalid; a banner-only failure falls back to the first Name.
    if (!Object.keys(failures).length) setTimeout(() => document.getElementById(id(failed[0].key, 'name'))?.focus())
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent size="wide" aria-describedby={undefined} initialFocus={firstName} onCloseAutoFocus={onCloseAutoFocus}>
        <DialogHeader><DialogTitle>Invite people</DialogTitle></DialogHeader>
        <form ref={formRef} noValidate onSubmit={submit} className="flex flex-col gap-6">
          {people.map((p, i) => {
            const e = errors[p.key] ?? {}
            return (
              <fieldset key={p.key} className={i > 0 ? 'grid gap-4 border-t border-border pt-4 sm:grid-cols-3' : 'grid gap-4 sm:grid-cols-3'}>
                <legend className="sr-only">Person {i + 1}</legend>
                <div className="flex flex-col gap-2">
                  <Label htmlFor={id(p.key, 'name')}>Name</Label>
                  <Input ref={i === 0 ? firstName : undefined} id={id(p.key, 'name')} maxLength={80} value={p.name} onChange={(ev) => edit(p.key, { name: ev.target.value })} {...fieldProps(id(p.key, 'name'), e.name)} />
                  {e.name && <FieldError id={id(p.key, 'name')}>{e.name}</FieldError>}
                </div>
                <div className="flex flex-col gap-2">
                  <Label htmlFor={id(p.key, 'email')}>Email</Label>
                  <Input id={id(p.key, 'email')} type="email" value={p.email} onChange={(ev) => edit(p.key, { email: ev.target.value })} {...fieldProps(id(p.key, 'email'), e.email)} />
                  {e.email && <FieldError id={id(p.key, 'email')}>{e.email}</FieldError>}
                </div>
                <div className="flex flex-col gap-2">
                  <Label htmlFor={id(p.key, 'role')}>Job role</Label>
                  <Select id={id(p.key, 'role')} value={p.jobRoleId} onChange={(ev) => edit(p.key, { jobRoleId: ev.target.value })}>
                    {roles.map((r) => <option key={r.id} value={r.id}>{r.name}</option>)}
                  </Select>
                </div>
              </fieldset>
            )
          })}
          <Button type="button" variant="ghost" className="self-start" onClick={add}>
            <Plus aria-hidden />
            Add another person
          </Button>
          {banner && <Banner kind="alert">{banner}</Banner>}
          <DialogFooter>
            <Button type="button" variant="secondary" onClick={() => onOpenChange(false)}>Cancel</Button>
            <Button type="submit" aria-disabled={busy || undefined} className="aria-disabled:cursor-not-allowed aria-disabled:opacity-50">Create invite links</Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  )
}
