import { useState } from 'react'
import { createFileRoute, useRouter } from '@tanstack/react-router'
import { errorMessage, RouteError } from '@/components/inline-error'
import { Button } from '@/components/ui/button'
import { getGenerationJobs, retryJobConcept } from '@/server/admin'

export const Route = createFileRoute('/admin/jobs')({
  loader: () => getGenerationJobs(),
  errorComponent: RouteError,
  component: Jobs,
})

function when(ms: number | null) {
  return ms === null ? '—' : new Date(ms).toLocaleString()
}

function Jobs() {
  const { concepts, roles } = Route.useLoaderData()
  const router = useRouter()
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')

  async function retry(conceptId: string) {
    setBusy(true)
    setError('')
    try {
      await retryJobConcept({ data: { conceptId } })
      await router.invalidate()
    } catch (err) {
      setError(errorMessage(err))
    } finally {
      setBusy(false)
    }
  }

  return (
    <main>
      <h1 className="text-3xl font-bold tracking-tight">Generation jobs</h1>
      <p className="mt-4 text-muted-foreground">A pending concept showing the company-cap message waits for the next UTC day.</p>
      {error && <p role="alert" className="mt-4 font-medium text-wrong">{error}</p>}
      <section aria-labelledby="jobs-concepts" className="mt-8">
        <h2 id="jobs-concepts" className="text-2xl font-semibold">Concepts not ready</h2>
        {concepts.length === 0 && <p className="mt-4">No concepts waiting or failed.</p>}
        <ul className="mt-4 flex flex-col gap-4">
          {concepts.map((c) => (
            <li key={c.id} className="rounded-lg border p-4">
              <p className="font-medium">{c.concept}</p>
              <p className="mt-1 text-sm text-muted-foreground">{c.company}{c.role ? ` · ${c.role}` : ''}</p>
              <p className="mt-1 text-sm">Status: {c.status} · Claimed: {when(c.startedAt)}</p>
              {c.error && <p className="mt-2 text-sm">{c.error}</p>}
              {c.status === 'failed' && <Button className="mt-4" variant="secondary" disabled={busy} onClick={() => void retry(c.id)} aria-label={`Retry ${c.concept}`}>Retry</Button>}
            </li>
          ))}
        </ul>
      </section>
      <section aria-labelledby="jobs-roles" className="mt-12">
        <h2 id="jobs-roles" className="text-2xl font-semibold">Role curricula</h2>
        {roles.length === 0 && <p className="mt-4">No role curricula generating or failed.</p>}
        <ul className="mt-4 flex flex-col gap-4">
          {roles.map((r) => (
            <li key={r.id} className="rounded-lg border p-4">
              <p className="font-medium">{r.role}</p>
              <p className="mt-1 text-sm text-muted-foreground">{r.company}</p>
              <p className="mt-1 text-sm">Status: {r.status} · Started: {when(r.startedAt)}</p>
            </li>
          ))}
        </ul>
      </section>
    </main>
  )
}
