import { useState } from 'react'
import { createFileRoute, Link, redirect, useRouter } from '@tanstack/react-router'
import { useServerFn } from '@tanstack/react-start'
import { ChevronLeft } from 'lucide-react'
import { ErrorRow } from '@/components/question/error-row'
import { Button } from '@/components/ui/button'
import { Label } from '@/components/ui/label'
import { Textarea } from '@/components/ui/textarea'
import { flagResult } from '@/server/flags'

export const Route = createFileRoute('/me/flag')({
  validateSearch: (search: Record<string, unknown>): { conceptId: string } => ({
    conceptId: typeof search.conceptId === 'string' ? search.conceptId : '',
  }),
  beforeLoad: ({ context }) => {
    if (!context.user) throw redirect({ to: '/' })
    if (!context.companyMember) throw redirect({ to: '/me/profile' })
  },
  component: FlagResult,
})

const focusRing = 'focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-brand'
const SEND_ERROR = "Couldn't send. Check your connection and try again."

function FlagResult() {
  const router = useRouter()
  const { conceptId } = Route.useSearch()
  const flag = useServerFn(flagResult)
  const [note, setNote] = useState('')
  const [error, setError] = useState(false)
  const [busy, setBusy] = useState(false)

  async function submit(e: React.FormEvent) {
    e.preventDefault()
    if (busy || !note.trim()) return
    setBusy(true)
    setError(false)
    try {
      await flag({ data: { conceptId, note: note.trim() } })
    } catch {
      setError(true)
      setBusy(false)
      return
    }
    await router.navigate({ to: '/me/profile', search: { status: 'flag-sent' } })
  }

  return (
    <main className="mx-auto flex min-h-dvh w-full max-w-xl flex-col gap-6 bg-surface-page px-4 pt-6">
      <Link to="/me/profile" className={`inline-flex min-h-11 w-fit items-center gap-1 text-label text-brand ${focusRing}`}>
        <ChevronLeft aria-hidden className="size-5" />
        Back to Training progress
      </Link>
      <h1 tabIndex={-1} className={`text-title-1 text-ink ${focusRing}`}>Flag an unfair result</h1>
      <p className="text-body text-ink-muted">Tell your training team what looks wrong. A person reviews every flag.</p>
      <form onSubmit={submit} className="flex flex-col gap-4">
        <div className="flex flex-col gap-2">
          <Label htmlFor="flag-note">Note</Label>
          <Textarea id="flag-note" name="note" maxLength={500} className="min-h-32" value={note} onChange={(e) => setNote(e.target.value)} />
        </div>
        {error && <ErrorRow message={SEND_ERROR} />}
        <Button type="submit" disabled={!note.trim() || busy}>Send</Button>
      </form>
    </main>
  )
}
