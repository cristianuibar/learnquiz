import { useRef, useState } from 'react'
import { createFileRoute, redirect, useRouter } from '@tanstack/react-router'
import { useServerFn } from '@tanstack/react-start'
import { ChoiceGroup } from '@/components/choice-group'
import { ConfidencePicker } from '@/components/confidence-picker'
import { InlineError, RouteError, errorMessage } from '@/components/inline-error'
import { ProgressHeader } from '@/components/progress-header'
import { RevealCard } from '@/components/reveal-card'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Working } from '@/components/working'
import type { Confidence, Reveal, SessionView } from '@/lib/learning/types'
import { answerItem, endSession, getSession, nextItem, reportItem } from '@/server/play'

export const Route = createFileRoute('/play/$sessionId')({
  beforeLoad: ({ context }) => {
    if (!context.user) throw redirect({ to: '/' })
  },
  loader: async ({ params }) => {
    const view = await getSession({ data: { sessionId: params.sessionId } })
    if (view.ended) throw redirect({ to: '/play/$sessionId/done', params })
    return view
  },
  errorComponent: RouteError,
  component: () => {
    const view = Route.useLoaderData()
    return <Play key={view.id} initial={view} />
  },
})

function isAnswerConflict(err: unknown): boolean {
  const e = err as { status?: number; message?: string }
  return (
    e?.status === 409 ||
    ['Already answered', 'This session has ended', 'That is not the current question'].some((m) => e?.message?.includes(m))
  )
}

function Play({ initial }: { initial: SessionView }) {
  const router = useRouter()
  const check = useServerFn(answerItem)
  const next = useServerFn(nextItem)
  const end = useServerFn(endSession)
  const report = useServerFn(reportItem)
  const sync = useServerFn(getSession)
  const [view, setView] = useState(initial)
  const [choice, setChoice] = useState('') // option id (mcq) or typed text
  const [confidence, setConfidence] = useState<Confidence | null>(null)
  const [reveal, setReveal] = useState<Reveal | null>(null)
  const [why, setWhy] = useState('')
  const [reported, setReported] = useState(false)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<{ message: string; retry: () => void } | null>(null)
  const shownAt = useRef(Date.now())

  const { item, progress } = view
  const placement = view.kind === 'placement'
  const ready = choice.trim() !== '' && confidence !== null

  async function run(fn: () => Promise<void>) {
    setBusy(true)
    setError(null)
    try {
      await fn()
    } catch (err) {
      setError({ message: errorMessage(err), retry: () => run(fn) })
    }
    setBusy(false)
  }

  const finish = () =>
    run(async () => {
      await end({ data: { sessionId: view.id } })
      await router.navigate({ to: '/play/$sessionId/done', params: { sessionId: view.id } })
    })

  async function resync() {
    const v = await sync({ data: { sessionId: view.id } })
    setView(v)
    if (v.ended) return finish()
    setChoice('')
    setConfidence(null)
    setReveal(null)
    setWhy('')
    setReported(false)
    shownAt.current = Date.now()
  }

  function submitCheck() {
    if (!item || !ready || busy) return
    const responseMs = Date.now() - shownAt.current
    void run(async () => {
      const answer = item.format === 'mcq' ? { optionId: choice } : { text: choice.trim() }
      try {
        setReveal(await check({ data: { sessionId: view.id, itemId: item.id, answer, confidence, responseMs } }))
      } catch (err) {
        if (!isAnswerConflict(err)) throw err
        // The answer already landed (its response was lost): resync instead of replaying it.
        try {
          await resync()
        } catch (syncErr) {
          setError({ message: errorMessage(syncErr), retry: () => void run(resync) })
        }
      }
    })
  }

  function submitNext() {
    if (busy) return
    void run(async () => {
      const v = await next({ data: { sessionId: view.id, why: why.trim() || undefined } })
      setView(v)
      if (v.ended) return finish()
      setChoice('')
      setConfidence(null)
      setReveal(null)
      setWhy('')
      setReported(false)
      shownAt.current = Date.now()
    })
  }

  const chosen = item?.options.find((o) => o.id === choice)?.text ?? (item?.format === 'mcq' ? null : choice.trim())

  return (
    <main className="mx-auto w-full max-w-xl px-4 pt-4 pb-16">
      <ProgressHeader topicId={view.topicId} position={progress.position} total={progress.total} placement={placement} />
      <div className="mt-8 flex flex-col gap-6">
        {view.ended || !item ? (
          !error && <Working label={placement ? 'Working out your level' : 'Wrapping up'} />
        ) : reveal ? (
          <>
            <p className="text-xl font-semibold">{item.stem}</p>
            <form
              className="flex flex-col gap-4"
              onSubmit={(e) => {
                e.preventDefault()
                submitNext()
              }}
            >
              <RevealCard reveal={reveal} chosen={chosen} why={why} onWhy={setWhy} />
              <Button type="submit" autoFocus disabled={busy} className="h-11 self-end px-6">
                {reveal.state === 'D' ? 'Got it' : 'Continue'}
              </Button>
            </form>
            {reported ? (
              <p className="text-sm text-muted-foreground">Reported</p>
            ) : (
              <Button
                variant="link"
                className="h-11 self-start px-0 text-muted-foreground"
                disabled={busy}
                onClick={() =>
                  void run(async () => {
                    await report({ data: { itemId: item.id } })
                    setReported(true)
                  })
                }
              >
                Report this question
              </Button>
            )}
          </>
        ) : (
          <form
            className="flex flex-col gap-6"
            onSubmit={(e) => {
              e.preventDefault()
              submitCheck()
            }}
          >
            {item.format === 'mcq' ? (
              <ChoiceGroup
                name="answer"
                legend={item.stem}
                legendClassName="mb-4 text-xl font-semibold"
                options={item.options}
                value={choice}
                onChange={setChoice}
                className="flex flex-col gap-2"
              />
            ) : (
              <div className="flex flex-col gap-4">
                <Label htmlFor="answer" className="text-xl leading-snug font-semibold">
                  {item.stem}
                </Label>
                <Input
                  id="answer"
                  className="h-11"
                  value={choice}
                  onChange={(e) => setChoice(e.target.value)}
                  maxLength={500}
                  autoComplete="off"
                  autoFocus
                />
              </div>
            )}
            <ConfidencePicker value={confidence} onChange={setConfidence} />
            <Button type="submit" disabled={!ready || busy} className="h-11 self-end px-6">
              Check
            </Button>
          </form>
        )}
        {error && <InlineError message={error.message} onRetry={error.retry} />}
      </div>
    </main>
  )
}
