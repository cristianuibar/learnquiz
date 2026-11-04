import { useState } from 'react'
import { createFileRoute, useRouter } from '@tanstack/react-router'
import { errorMessage, RouteError } from '@/components/inline-error'
import { Button } from '@/components/ui/button'
import { getContentFlags, resolveFlag } from '@/server/admin'

export const Route = createFileRoute('/admin/flags')({
  loader: () => getContentFlags(),
  errorComponent: RouteError,
  component: Flags,
})

function Flags() {
  const { flags, retired } = Route.useLoaderData()
  const router = useRouter()
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')

  async function resolve(flagId: string) {
    setBusy(true)
    setError('')
    try {
      await resolveFlag({ data: { flagId } })
      await router.invalidate()
    } catch (err) {
      setError(errorMessage(err))
    } finally {
      setBusy(false)
    }
  }

  return (
    <main className="max-w-[1120px]">
      <h1 className="text-title-1 text-ink">Content flags</h1>
      {error && <p role="alert" className="mt-4 font-medium text-wrong">{error}</p>}
      <section aria-labelledby="flags-open" className="mt-8">
        <h2 id="flags-open" className="text-title-2">Open flags</h2>
        {flags.length === 0 && <p className="mt-4">No open flags.</p>}
        <ul className="mt-4 flex flex-col gap-4">
          {flags.map((f) => (
            <li key={f.id} className="rounded-lg border p-4">
              <p className="font-medium">{f.stem}</p>
              <p className="mt-1 text-caption text-ink-muted">{f.concept} · {f.company}</p>
              <p className="mt-1 text-body">Reason: {f.reason}</p>
              {f.note && <p className="mt-1 text-body">{f.note}</p>}
              <p className="mt-1 text-caption text-ink-muted">Reported {new Date(f.createdAt).toLocaleString()}</p>
              <Button className="mt-4" variant="secondary" disabled={busy} onClick={() => void resolve(f.id)} aria-label={`Resolve flag on ${f.stem}`}>Resolve</Button>
            </li>
          ))}
        </ul>
      </section>
      <section aria-labelledby="flags-retired" className="mt-12">
        <h2 id="flags-retired" className="text-title-2">Retired questions</h2>
        {retired.length === 0 && <p className="mt-4">No retired questions.</p>}
        <ul className="mt-4 flex flex-col gap-4">
          {retired.map((q) => (
            <li key={q.id} className="rounded-lg border p-4">
              <p className="font-medium">{q.stem}</p>
              <p className="mt-1 text-caption text-ink-muted">{q.concept} · {q.company}{q.role ? ` · ${q.role}` : ''}</p>
            </li>
          ))}
        </ul>
      </section>
    </main>
  )
}
