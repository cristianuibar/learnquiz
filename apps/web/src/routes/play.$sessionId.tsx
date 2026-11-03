import { useEffect, useRef, useState } from 'react'
import { flushSync } from 'react-dom'
import { createFileRoute, redirect, useRouter } from '@tanstack/react-router'
import { useServerFn } from '@tanstack/react-start'
import { InlineError, RouteError, errorMessage } from '@/components/inline-error'
import { ProgressHeader } from '@/components/progress-header'
import { ModelLabel } from '@/components/model-label'
import { RevealCard } from '@/components/reveal-card'
import { ModelTrace } from '@/components/model-trace'
import { QuestionScreen } from '@/components/question/question-screen'
import { Button } from '@/components/ui/button'
import { Working } from '@/components/working'
import { stopSpeaking } from '@/lib/speech'
import { isAnswerReady } from '@learnquiz/api'
import type { Answer, Confidence, ItemFormat, Reveal, SessionView } from '@learnquiz/api'
import { checkFailedMessage } from '@learnquiz/api/system-copy'
import { answerItem, endSession, getSession, nextItem, prepareNextSession, reportItem } from '@/server/play'

export const Route = createFileRoute('/play/$sessionId')({
  beforeLoad: ({ context }) => {
    if (!context.user) throw redirect({ to: '/' })
  },
  loader: async ({ params }) => {
    const view = await getSession({ data: { sessionId: params.sessionId } })
    if (view.ended) throw redirect({ to: '/play/$sessionId/done', params })
    return view
  },
  // Answering moves the position on the client only, so cached loader data is stale; Back then Forward must load the current question.
  gcTime: 0,
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
    ['Already answered', 'This session has ended', 'That is not the current question', 'This question has been retired'].some((m) => e?.message?.includes(m))
  )
}

// A dropped connection, a timeout or a 5xx can succeed on retry; the answer is kept as a draft.
function isRetryableCheckError(err: unknown): boolean {
  const e = err as { status?: number; name?: string }
  if (typeof e?.status === 'number') return e.status >= 500
  return (typeof navigator !== 'undefined' && navigator.onLine === false) || err instanceof TypeError || e?.name === 'AbortError' || e?.name === 'TimeoutError'
}

function toAnswer(format: ItemFormat, choice: string): Answer {
  const ids = choice ? choice.split(',') : []
  switch (format) {
    case 'mcq': return { optionId: choice }
    case 'multi': return { optionIds: ids }
    case 'order': return { order: ids }
    case 'cloze':
    case 'short': return { text: choice.trim() }
  }
}

// Unsent answers survive a reload; storage can be unavailable (private mode, quota), so failures are ignored.
const draftKey = (sessionId: string, itemId: string) => `learnquiz:draft:${sessionId}:${itemId}`

function readDraft(key: string): { choice: string; confidence: Confidence | null } | null {
  try {
    const draft = JSON.parse(sessionStorage.getItem(key) ?? 'null')
    if (typeof draft?.choice !== 'string') return null
    return { choice: draft.choice.slice(0, 1000), confidence: ['sure', 'unsure', 'guess'].includes(draft.confidence) ? draft.confidence : null }
  } catch {
    return null
  }
}

function writeDraft(key: string, choice: string, confidence: Confidence | null) {
  try {
    if (choice === '' && confidence === null) sessionStorage.removeItem(key)
    else sessionStorage.setItem(key, JSON.stringify({ choice, confidence }))
  } catch {
    // Keep answering without persistence.
  }
}

// Only a document's first screen can be replayed from the history cache with an old question.
let documentChecked = false
function openedFromHistory() {
  if (documentChecked) return false
  documentChecked = true
  const nav = performance.getEntriesByType?.('navigation')[0] as PerformanceNavigationTiming | undefined
  return nav?.type === 'back_forward'
}

function Play({ initial }: { initial: SessionView }) {
  const router = useRouter()
  const check = useServerFn(answerItem)
  const next = useServerFn(nextItem)
  const end = useServerFn(endSession)
  const report = useServerFn(reportItem)
  const sync = useServerFn(getSession)
  const prepare = useServerFn(prepareNextSession)
  const [view, setView] = useState(initial)
  const [choice, setChoice] = useState('') // option id (mcq), comma-joined option ids (multi, order) or typed text
  const [confidence, setConfidence] = useState<Confidence | null>(null)
  const [reveal, setReveal] = useState<Reveal | null>(null)
  const [why, setWhy] = useState('')
  const [reported, setReported] = useState(false)
  const [busy, setBusy] = useState(false)
  const [voiceBusy, setVoiceBusy] = useState(false)
  // Answer controls stay disabled until the current position is known; the server HTML renders them disabled too.
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<{ message: string; retry: () => void } | null>(null)
  const shownAt = useRef(Date.now())
  const questionHeading = useRef<HTMLHeadingElement>(null)

  const { item, progress } = view
  const placement = view.kind === 'placement'
  const ready = Boolean(item && isAnswerReady(item.format, toAnswer(item.format, choice), item.options.length)) && confidence !== null

  useEffect(() => {
    // Writes the next session's questions while this one (placement included) is played; the open request outlives waitUntil's window.
    prepare({ data: { sessionId: initial.id } }).catch(() => {})
  }, [initial.id])

  useEffect(() => {
    const heading = questionHeading.current
    // A format that autofocuses its field (cloze) keeps that focus.
    if (heading && document.activeElement !== heading && heading.closest('form')?.contains(document.activeElement)) return
    heading?.focus()
  }, [item?.id, progress.position])

  // Restored after mount so the server render and hydration match.
  useEffect(() => {
    if (!initial.item) return
    const draft = readDraft(draftKey(initial.id, initial.item.id))
    if (!draft) return
    setChoice(draft.choice)
    setConfidence(draft.confidence)
  }, [initial])

  // Back then Forward can restore a page showing an earlier question: reload the session before answering resumes.
  useEffect(() => {
    const reload = () =>
      void run(async () => {
        await resync()
        setLoading(false)
      })
    if (openedFromHistory()) reload()
    else setLoading(false)
    const onPageShow = (e: PageTransitionEvent) => {
      if (!e.persisted) return
      // Synchronous, so no keystroke reaches the restored question before the controls lock.
      flushSync(() => setLoading(true))
      reload()
    }
    window.addEventListener('pageshow', onPageShow)
    return () => window.removeEventListener('pageshow', onPageShow)
  }, [])

  useEffect(() => {
    if (item && !reveal) writeDraft(draftKey(view.id, item.id), choice, confidence)
  }, [view.id, item, reveal, choice, confidence])

  async function run(fn: () => Promise<void>, message: (err: unknown) => string = errorMessage) {
    setBusy(true)
    setError(null)
    try {
      await fn()
    } catch (err) {
      setError({ message: message(err), retry: () => run(fn, message) })
    }
    setBusy(false)
  }

  const finish = () =>
    run(async () => {
      await end({ data: { sessionId: view.id } })
      await router.navigate({ to: '/play/$sessionId/done', params: { sessionId: view.id } })
    })

  // Answered items stay recorded; the learner returns to Today.
  const leave = () =>
    run(async () => {
      stopSpeaking()
      await end({ data: { sessionId: view.id } })
      await router.navigate({ to: '/today' })
    })

  async function resync() {
    const v = await sync({ data: { sessionId: view.id } })
    setView(v)
    if (v.ended) return finish()
    const draft = v.item ? readDraft(draftKey(v.id, v.item.id)) : null
    setChoice(draft?.choice ?? '')
    setConfidence(draft?.confidence ?? null)
    setReveal(null)
    setWhy('')
    setReported(false)
    shownAt.current = Date.now()
  }

  function submitCheck() {
    if (!item || !ready || busy || voiceBusy || loading) return
    const responseMs = Date.now() - shownAt.current
    stopSpeaking()
    void run(async () => {
      const answer = toAnswer(item.format, choice)
      try {
        setReveal(await check({ data: { sessionId: view.id, itemId: item.id, answer, confidence, responseMs } }))
        writeDraft(draftKey(view.id, item.id), '', null)
      } catch (err) {
        if (!isAnswerConflict(err)) throw err
        // The session changed or the answer already landed: resync instead of replaying it.
        try {
          await resync()
        } catch (syncErr) {
          setError({ message: errorMessage(syncErr), retry: () => void run(resync) })
        }
      }
    }, (err) => (isRetryableCheckError(err) ? checkFailedMessage(true, 'device') : errorMessage(err)))
  }

  // Changing the answer after a failed check offers Check again.
  const edit = <T,>(set: (value: T) => void) => (value: T) => {
    setError(null)
    set(value)
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

  const chosen = item?.options.find((o) => o.id === choice)?.text ?? (item?.format === 'cloze' || item?.format === 'short' ? choice.trim() : null)

  return (
    <main className="mx-auto flex min-h-dvh w-full max-w-xl flex-col px-4">
      <ProgressHeader
        position={progress.position}
        total={progress.total}
        onEnd={leave}
        endDisabled={busy}
        readAloud={item && !reveal && !loading ? [item.stem, ...item.options.map((o) => o.text)] : null}
      />
      {!view.ended && item && !reveal ? (
        <QuestionScreen
          item={item}
          sessionId={view.id}
          voiceEnabled={Boolean(view.voiceEnabled)}
          choice={choice}
          onChoice={edit(setChoice)}
          busy={busy}
          voiceBusy={voiceBusy}
          onVoiceBusy={setVoiceBusy}
          onEnd={leave}
          headingRef={questionHeading}
          loading={loading}
          confidence={confidence}
          onConfidence={edit(setConfidence)}
          canCheck={ready && !busy && !voiceBusy && !loading}
          error={error}
          onCheck={submitCheck}
        />
      ) : (
        <>
          <div className="mt-6 flex flex-1 flex-col gap-6 pb-6">
            {view.ended || !item ? (
              !error && <Working label={placement ? 'Working out your level' : 'Wrapping up'} />
            ) : (
              <>
                <p className="text-xl font-semibold">{item.stem}</p>
                <form
                  id="play"
                  onSubmit={(e) => {
                    e.preventDefault()
                    submitNext()
                  }}
                >
                  <RevealCard reveal={reveal!} chosen={chosen} why={why} onWhy={setWhy} model={item.generatedBy} />
                </form>
                {reported ? (
                  <p className="text-sm text-muted-foreground">Reported</p>
                ) : (
                  <Button
                    variant="link"
                    className="self-start px-0 text-muted-foreground"
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
                <ModelLabel model={item.generatedBy} />
              </>
            )}
            {error && <InlineError message={error.message} onRetry={error.retry} />}
            {!placement && <ModelTrace key={view.id} scope={{ scope: 'session', sessionId: view.id }} />}
          </div>
          {!view.ended && item && reveal && (
            // Pinned to the bottom edge so the thumb reaches it; autoFocus lands on Continue after a check.
            <div className="sticky bottom-0 -mx-4 border-t bg-background px-4 pt-3 pb-[max(0.75rem,env(safe-area-inset-bottom))]">
              <Button type="submit" form="play" autoFocus disabled={busy} className="w-full px-6">
                {reveal.state === 'D' ? 'Got it' : 'Continue'}
              </Button>
            </div>
          )}
        </>
      )}
    </main>
  )
}
