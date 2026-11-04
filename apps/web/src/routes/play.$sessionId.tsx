import { useEffect, useRef, useState } from 'react'
import { flushSync } from 'react-dom'
import { createFileRoute, getRouteApi, redirect, useRouter } from '@tanstack/react-router'
import { useServerFn } from '@tanstack/react-start'
import { InlineError, RouteError, errorMessage } from '@/components/inline-error'
import { ProgressHeader } from '@/components/progress-header'
import { ModelLabel } from '@/components/model-label'
import { RevealOverlay } from '@/components/reveal-overlay'
import { RevealedOptions } from '@/components/revealed-options'
import { ModelTrace } from '@/components/model-trace'
import { QuestionScreen } from '@/components/question/question-screen'
import { Working } from '@/components/working'
import { stopSpeaking } from '@/lib/speech'
import { isAnswerReady } from '@learnquiz/api'
import type { Answer, Confidence, ItemFormat, Reveal, SessionView } from '@learnquiz/api'
import { checkFailedMessage } from '@learnquiz/api/system-copy'
import { answerItem, endSession, getSession, nextItem, prepareNextSession } from '@/server/play'

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

const rootApi = getRouteApi('__root__')

function Play({ initial }: { initial: SessionView }) {
  const router = useRouter()
  const { branding } = rootApi.useLoaderData()
  const check = useServerFn(answerItem)
  const next = useServerFn(nextItem)
  const end = useServerFn(endSession)
  const sync = useServerFn(getSession)
  const prepare = useServerFn(prepareNextSession)
  const [view, setView] = useState(initial)
  const [choice, setChoice] = useState('') // option id (mcq), comma-joined option ids (multi, order) or typed text
  const [confidence, setConfidence] = useState<Confidence | null>(null)
  const [reveal, setReveal] = useState<Reveal | null>(null)
  const [announcement, setAnnouncement] = useState('')
  const [busy, setBusy] = useState(false)
  const [voiceBusy, setVoiceBusy] = useState(false)
  // Answer controls stay disabled until the current position is known; the server HTML renders them disabled too.
  const [loading, setLoading] = useState(true)
  // `ending` marks a failed End session, which keeps Check for the answer on screen.
  const [error, setError] = useState<{ message: string; retry: () => void; ending?: boolean } | null>(null)
  const shownAt = useRef(Date.now())
  const questionHeading = useRef<HTMLHeadingElement>(null)
  // Read by the pageshow handler, which is registered once.
  const revealShowing = useRef(false)
  revealShowing.current = Boolean(reveal)

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
    const reload = () => {
      // A reveal on screen is this session's own result; reloading would discard it.
      if (revealShowing.current) return setLoading(false)
      void run(async () => {
        await resync()
        setLoading(false)
      })
    }
    if (openedFromHistory()) reload()
    else setLoading(false)
    const onPageShow = (e: PageTransitionEvent) => {
      if (!e.persisted) return
      // Synchronous, so no keystroke reaches the restored question before the controls lock.
      if (revealShowing.current) return
      flushSync(() => setLoading(true))
      reload()
    }
    window.addEventListener('pageshow', onPageShow)
    return () => window.removeEventListener('pageshow', onPageShow)
  }, [])

  useEffect(() => {
    if (item && !reveal) writeDraft(draftKey(view.id, item.id), choice, confidence)
  }, [view.id, item, reveal, choice, confidence])

  async function run(fn: () => Promise<void>, message: (err: unknown) => string = errorMessage, ending = false) {
    setBusy(true)
    setError(null)
    try {
      await fn()
    } catch (err) {
      setError({ message: message(err), retry: () => run(fn, message, ending), ending })
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
    run(
      async () => {
        stopSpeaking()
        await end({ data: { sessionId: view.id } })
        await router.navigate({ to: '/today' })
      },
      errorMessage,
      true,
    )

  async function resync() {
    const v = await sync({ data: { sessionId: view.id } })
    setView(v)
    if (v.ended) return finish()
    const draft = v.item ? readDraft(draftKey(v.id, v.item.id)) : null
    setChoice(draft?.choice ?? '')
    setConfidence(draft?.confidence ?? null)
    setReveal(null)
    shownAt.current = Date.now()
  }

  function submitCheck() {
    if (!item || !ready || busy || voiceBusy || loading) return
    setAnnouncement('')
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

  function submitNext(why: string) {
    if (busy) return
    void run(async () => {
      const v = await next({ data: { sessionId: view.id, why: why || undefined } })
      setView(v)
      if (v.ended) return finish()
      setChoice('')
      setConfidence(null)
      setReveal(null)
      shownAt.current = Date.now()
    })
  }

  function reportSent(why: string) {
    setAnnouncement('Report sent')
    submitNext(why)
  }

  const revealed = !view.ended && item && reveal ? { item, reveal } : null
  const answer = revealed ? toAnswer(revealed.item.format, choice) : null

  return (
    <main className="mx-auto flex min-h-dvh w-full max-w-xl flex-col px-4">
      {/* The overlay portals out of this wrapper, so only the page behind it goes inert. */}
      <div inert={Boolean(revealed)} className="flex flex-1 flex-col">
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
          <div className="mt-6 flex flex-1 flex-col gap-6 pb-6">
            {revealed && answer ? (
              <>
                <h1 className="text-title-2 text-ink">{revealed.item.stem}</h1>
                {revealed.item.options.length > 0 && <RevealedOptions item={revealed.item} answer={answer} reveal={revealed.reveal} />}
                <ModelLabel model={revealed.item.generatedBy} />
              </>
            ) : (
              (view.ended || !item) && !error && <Working label={placement ? 'Working out your level' : 'Wrapping up'} />
            )}
            {!revealed && error && <InlineError message={error.message} onRetry={error.retry} />}
            {!placement && <ModelTrace key={view.id} scope={{ scope: 'session', sessionId: view.id }} />}
          </div>
        )}
      </div>
      {revealed && answer && (
        <RevealOverlay
          reveal={revealed.reveal}
          item={revealed.item}
          answer={answer}
          hasCompany={Boolean(branding)}
          company={branding?.name ?? null}
          busy={busy}
          error={error?.message ?? null}
          onContinue={submitNext}
          onReportSent={reportSent}
        />
      )}
      <p role="status" className="sr-only">
        {announcement}
      </p>
    </main>
  )
}
