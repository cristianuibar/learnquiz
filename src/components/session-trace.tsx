import { useId, useState } from 'react'
import { useServerFn } from '@tanstack/react-start'
import { InlineError, errorMessage } from '@/components/inline-error'
import { Button } from '@/components/ui/button'
import type { SessionTrace as Trace } from '@/lib/learning/types'
import { getSessionTrace } from '@/server/play'

export function SessionTrace({ sessionId }: { sessionId: string }) {
  const id = useId()
  const getTrace = useServerFn(getSessionTrace)
  const [open, setOpen] = useState(false)
  const [trace, setTrace] = useState<Trace | null>(null)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)

  async function load() {
    setBusy(true)
    setError(null)
    try {
      setTrace(await getTrace({ data: { sessionId } }))
    } catch (err) {
      setError(errorMessage(err))
    } finally {
      setBusy(false)
    }
  }

  return (
    <div className="mt-6 border-t pt-3 text-sm">
      <Button variant="link" className="h-12 px-0" aria-expanded={open} aria-controls={id} onClick={() => {
        setOpen(!open)
        if (!open && !trace && !busy) void load()
      }}>
        Session trace
      </Button>
      <div id={id} hidden={!open} aria-busy={busy}>
        {busy && <p role="status">Loading session trace…</p>}
        {error && <InlineError message={error} onRetry={() => void load()} />}
        {trace && <>
          <p className="font-medium">{trace.planner}</p>
          <ul className="my-3 space-y-1 text-muted-foreground">
            {trace.calls.map((call) => <li key={call.id}>
              {call.purpose} · {call.model} · {call.latencyMs} ms · {call.ok ? 'succeeded' : 'failed'}
            </li>)}
          </ul>
          <ol className="list-decimal space-y-2 pl-5">
            {trace.steps.map((step, i) => <li key={i}>{step.reason}</li>)}
          </ol>
        </>}
      </div>
    </div>
  )
}
