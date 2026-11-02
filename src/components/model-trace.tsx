import { useState } from 'react'
import { useServerFn } from '@tanstack/react-start'
import { InlineError, errorMessage } from '@/components/inline-error'
import { Button } from '@/components/ui/button'
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle, DialogTrigger } from '@/components/ui/dialog'
import { getModelTrace } from '@/server/model-trace'

type Scope = { scope: 'session'; sessionId: string } | { scope: 'topic'; topicId: string }
type Trace = Awaited<ReturnType<typeof getModelTrace>>
const usd = (cost: number) => cost.toLocaleString('en-US', { style: 'currency', currency: 'USD', minimumFractionDigits: 2, maximumFractionDigits: 8 })

export function ModelTrace({ scope }: { scope: Scope }) {
  const load = useServerFn(getModelTrace)
  const [trace, setTrace] = useState<Trace | null>(null)
  const [error, setError] = useState('')
  const [busy, setBusy] = useState(false)

  async function refresh() {
    setBusy(true)
    setError('')
    setTrace(null)
    try {
      setTrace(await load({ data: scope }))
    } catch (err) {
      setError(errorMessage(err))
    } finally {
      setBusy(false)
    }
  }

  return (
    <Dialog onOpenChange={(open) => { if (open) void refresh() }}>
      <DialogTrigger asChild>
        <Button variant="outline" className="mt-4 h-12 px-6">Model trace</Button>
      </DialogTrigger>
      <DialogContent className="top-0 right-0 left-auto flex h-dvh max-w-full translate-x-0 translate-y-0 flex-col gap-6 overflow-y-auto rounded-none sm:max-w-xl [&>[data-slot=dialog-close]]:size-12 [&>[data-slot=dialog-close]]:top-2 [&>[data-slot=dialog-close]]:right-2 [&>[data-slot=dialog-close]]:flex [&>[data-slot=dialog-close]]:items-center [&>[data-slot=dialog-close]]:justify-center">
        <DialogHeader className="pr-10 text-left">
          <DialogTitle>Model trace</DialogTitle>
          <DialogDescription>
            {scope.scope === 'session' ? 'Every model call made for this session, including question generation and retries.' : 'Calls used to generate this topic and its questions, including retries.'}
          </DialogDescription>
        </DialogHeader>
        {busy && <p role="status">Loading model calls…</p>}
        {error && <InlineError message={error} onRetry={() => void refresh()} />}
        {trace && (
          <>
            <p className="text-lg font-semibold tabular-nums">
              {scope.scope === 'session' ? 'Session total' : 'Generation total'}: {usd(trace.totalCostUsd)}
            </p>
            <p className="text-sm text-muted-foreground">USD costs are the logged estimates. Output tokens include reasoning tokens.</p>
            {trace.planning && (
              <section aria-label="Session plan">
                <h2 className="font-semibold">{trace.planning.planner}</h2>
                <ol className="mt-3 list-decimal space-y-2 pl-5 text-sm">
                  {trace.planning.steps.map((step, i) => <li key={i}>{step.reason}</li>)}
                </ol>
              </section>
            )}
            {trace.calls.length === 0 ? <p>No model calls recorded for this {scope.scope}.</p> : (
              <ol className="flex flex-col gap-4">
                {trace.calls.map((call) => (
                  <li key={call.id} className="rounded-lg border p-4">
                    <div className="flex flex-wrap justify-between gap-2 font-medium">
                      <span>{call.purpose.replaceAll('_', ' ')}</span>
                      <span>{call.ok ? 'Succeeded' : 'Failed'}</span>
                    </div>
                    <p className="mt-1 break-words text-sm text-muted-foreground">{call.model}</p>
                    <dl className="mt-3 grid grid-cols-2 gap-x-4 gap-y-1 text-sm tabular-nums">
                      <dt>Latency</dt><dd className="text-right">{call.latencyMs.toLocaleString()} ms</dd>
                      <dt>Input tokens</dt><dd className="text-right">{call.promptTokens.toLocaleString()}</dd>
                      <dt>Output tokens</dt><dd className="text-right">{call.completionTokens.toLocaleString()}</dd>
                      <dt>Reasoning tokens</dt><dd className="text-right">{call.reasoningTokens.toLocaleString()}</dd>
                      <dt>Cost (USD)</dt><dd className="text-right">{usd(call.costUsd)}</dd>
                    </dl>
                  </li>
                ))}
              </ol>
            )}
          </>
        )}
      </DialogContent>
    </Dialog>
  )
}
