import { useEffect, useId, useRef, useState, type ReactNode } from 'react'
import { Link, getRouteApi } from '@tanstack/react-router'
import { useServerFn } from '@tanstack/react-start'
import { Dialog as DialogPrimitive } from 'radix-ui'
import { X } from 'lucide-react'
import { QuestionScreen } from '@/components/question/question-screen'
import { ReadAloudButton } from '@/components/question/read-aloud-button'
import { toAnswer } from '@/components/question/to-answer'
import { ReportSheet } from '@/components/report-sheet'
import { TONE } from '@/components/reveal-sheet'
import { SourceQuote } from '@/components/source-quote'
import { Button } from '@/components/ui/button'
import { stopSpeaking } from '@/lib/speech'
import { cn } from '@/lib/utils'
import { isAnswerReady } from '@learnquiz/api'
import type { Answer, Confidence, ItemView, Reveal, SessionView } from '@learnquiz/api'
import { revealCopy, revealModel } from '@learnquiz/api/reveal'
import { checkFailedMessage } from '@learnquiz/api/system-copy'
import { answerItem, endSession } from '@/server/play'

const rootApi = getRouteApi('__root__')

type Result = { reveal: Reveal; chosen: string; reviewsLeft: number | null }

// Only an answer already stored counts as answered; any other 404 or 409 (a retired question, a moved queue) saved nothing.
export function goneState(err: unknown): 'unavailable' | 'answered' | null {
  const { status, message } = err as { status?: number; message?: string }
  if (status === 409 && /already answered|session has ended/i.test(message ?? '')) return 'answered'
  return status === 404 || status === 409 ? 'unavailable' : null
}

function chosenText(item: ItemView, answer: Answer): string {
  const textOf = (id: string) => item.options.find((o) => o.id === id)?.text
  if (item.format === 'mcq') return (answer.optionId && textOf(answer.optionId)) || ''
  if (item.format === 'multi') return (answer.optionIds ?? []).map(textOf).filter(Boolean).join(', ')
  if (item.format === 'order') return (answer.order ?? []).map(textOf).filter(Boolean).join(' → ')
  return (answer.text ?? '').trim()
}

function leftToday(n: number): string {
  return n <= 0 ? 'none left today' : n === 1 ? '1 left today' : `${n} left today`
}

function Close() {
  return (
    <Link
      to="/today"
      aria-label="Close"
      className="-ml-3 flex size-12 shrink-0 items-center justify-center rounded-md text-ink outline-none hover:bg-surface-sunken focus-visible:ring-2 focus-visible:ring-brand focus-visible:ring-offset-2"
    >
      <X className="size-6" aria-hidden />
    </Link>
  )
}

function Dock({ children }: { children: ReactNode }) {
  return (
    <div className="sticky bottom-0 flex flex-col gap-1 border-t border-border bg-surface-page px-4 pt-3 pb-[calc(12px+env(safe-area-inset-bottom))] -mx-4">
      {children}
    </div>
  )
}

const BackToToday = () => (
  <Button size="lg" className="w-full" asChild>
    <Link to="/today">Back to Today</Link>
  </Button>
)

function Message({ title }: { title: string }) {
  const heading = useRef<HTMLHeadingElement>(null)
  useEffect(() => heading.current?.focus(), [])
  return (
    <>
      <div className="flex h-14 items-center">
        <Close />
      </div>
      <div className="mt-6 flex flex-1 flex-col gap-6 pb-6">
        <h1 ref={heading} tabIndex={-1} className="text-title-2 text-ink outline-none">{title}</h1>
      </div>
      <Dock>
        <BackToToday />
      </Dock>
    </>
  )
}

function ResultView({ item, result }: { item: ItemView; result: Result }) {
  const { branding } = rootApi.useLoaderData()
  const heading = useRef<HTMLHeadingElement>(null)
  const reportLink = useRef<HTMLButtonElement>(null)
  const reportId = useId()
  const [reporting, setReporting] = useState(false)
  const [announcement, setAnnouncement] = useState('')
  const reportPending = useRef(false)
  const { reveal, chosen, reviewsLeft } = result
  const model = revealModel(reveal, { hasCompany: Boolean(branding) })
  const tone = TONE[model.tone]
  const graded = reveal.state !== 'ungraded'
  const miss = graded && !reveal.correct
  const why = reveal.chosenFeedback || reveal.explanation
  const counter = !graded || reviewsLeft === null ? null : reveal.correct ? `1 review cleared · ${leftToday(reviewsLeft)}` : leftToday(reviewsLeft)

  useEffect(() => heading.current?.focus(), [])

  // Runs after the closed dialog has dropped aria-hidden from the page.
  useEffect(() => {
    if (reporting || !reportPending.current) return
    reportPending.current = false
    setAnnouncement('Report sent')
  }, [reporting])

  const row = (label: string, value: string) => (
    <div className="flex flex-col gap-1">
      <span className="text-caption text-ink-muted">{label}</span>
      <div className="text-body-lg">{value}</div>
    </div>
  )

  return (
    <>
      <div className="flex h-14 items-center">
        <Close />
      </div>
      <h1 ref={heading} tabIndex={-1} className="sr-only">Quick question done</h1>
      <div className="mt-6 flex flex-1 flex-col gap-4 pb-6">
        <div role="status" className={cn('-mx-4 flex items-center gap-3 px-4 py-4', tone.ground)}>
          <span className={cn('flex size-8 shrink-0 items-center justify-center rounded-full', tone.disc)}>
            <tone.Icon aria-hidden className="size-5" />
          </span>
          <span className={cn('text-title-2', tone.text)}>{model.heading}</span>
        </div>
        {graded ? (
          miss ? (
            <>
              {row(revealCopy.theAnswer, reveal.correctAnswer)}
              {row(revealCopy.youChose, chosen)}
              {why && <p className="text-body">{why}</p>}
            </>
          ) : (
            <div className="text-body-lg">{reveal.correctAnswer}</div>
          )
        ) : (
          <>
            {row(revealCopy.yourAnswer, chosen)}
            {row(revealCopy.theAnswer, reveal.correctAnswer)}
            {reveal.feedback && <p className="text-body">{reveal.feedback}</p>}
          </>
        )}
        {reveal.sourceQuote !== null && <SourceQuote quote={reveal.sourceQuote} title={reveal.sourceTitle} version={reveal.sourceVersion} />}
        {counter && <p className="text-label text-ink-muted tabular-nums">{counter}</p>}
        <p role="status" className="sr-only">{announcement}</p>
      </div>
      <Dock>
        <BackToToday />
        <Button ref={reportLink} variant="link" className="text-ink-muted" onClick={() => setReporting(true)}>
          {revealCopy.report}
        </Button>
      </Dock>
      {/* Mounted only while open, so its aria-hidden is gone before the effect announces Report sent. */}
      {reporting && (
        <DialogPrimitive.Root open onOpenChange={setReporting}>
          <DialogPrimitive.Portal>
            <DialogPrimitive.Overlay className="fixed inset-0 z-40 bg-scrim" />
            <DialogPrimitive.Content
              aria-labelledby={reportId}
              aria-describedby={undefined}
              onCloseAutoFocus={(e) => { e.preventDefault(); reportLink.current?.focus() }}
              className="fixed inset-x-0 bottom-0 z-50 mx-auto flex max-h-[calc(100dvh-48px)] max-w-md flex-col overflow-hidden rounded-t-lg bg-surface-card text-ink shadow-raised focus:outline-none"
            >
              <ReportSheet
                itemId={item.id}
                attemptId={reveal.attemptId}
                company={branding?.name ?? null}
                headingId={reportId}
                onBack={() => setReporting(false)}
                onSent={() => {
                  reportPending.current = true
                  setReporting(false)
                }}
              />
            </DialogPrimitive.Content>
          </DialogPrimitive.Portal>
        </DialogPrimitive.Root>
      )}
    </>
  )
}

function Question({ view, item, onResult, onGone }: { view: SessionView; item: ItemView; onResult(r: Result): void; onGone(s: 'unavailable' | 'answered'): void }) {
  const check = useServerFn(answerItem)
  const end = useServerFn(endSession)
  const [choice, setChoice] = useState('')
  const [confidence, setConfidence] = useState<Confidence | null>(null)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<{ message: string; retry: () => void } | null>(null)
  const shownAt = useRef(Date.now())
  const heading = useRef<HTMLHeadingElement>(null)
  const ready = isAnswerReady(item.format, toAnswer(item.format, choice), item.options.length) && confidence !== null

  useEffect(() => {
    const h = heading.current
    if (h && !h.closest('form')?.contains(document.activeElement)) h.focus()
  }, [])

  async function submit() {
    if (!ready || busy) return
    stopSpeaking()
    const answer = toAnswer(item.format, choice)
    setBusy(true)
    setError(null)
    try {
      const reveal = await check({ data: { sessionId: view.id, itemId: item.id, answer, confidence, responseMs: Date.now() - shownAt.current } })
      const reviewsLeft = await end({ data: { sessionId: view.id } }).then((s) => s.reviewsLeft, () => null)
      onResult({ reveal, chosen: chosenText(item, answer), reviewsLeft })
    } catch (err) {
      const gone = goneState(err)
      // Nothing was stored, so close the mini session instead of leaving it open.
      if (gone === 'unavailable') void end({ data: { sessionId: view.id } }).catch(() => {})
      if (gone) onGone(gone)
      else {
        setError({ message: checkFailedMessage(false, 'device'), retry: () => void submit() })
        setBusy(false)
      }
    }
  }

  const edit = <T,>(set: (value: T) => void) => (value: T) => {
    setError(null)
    set(value)
  }

  return (
    <>
      <div className="flex h-14 items-center gap-2">
        <Close />
        <span className="flex-1 text-center text-overline text-ink-muted">1 question</span>
        <ReadAloudButton texts={[item.stem, ...item.options.map((o) => o.text)]} />
      </div>
      <QuestionScreen
        item={item}
        sessionId={view.id}
        voiceEnabled={false}
        choice={choice}
        onChoice={edit(setChoice)}
        busy={busy}
        voiceBusy={false}
        onVoiceBusy={() => {}}
        onEnd={() => {}}
        headingRef={heading}
        loading={false}
        confidence={confidence}
        onConfidence={edit(setConfidence)}
        canCheck={ready && !busy}
        error={error}
        onCheck={() => void submit()}
      />
    </>
  )
}

type Props = { status: 'unavailable' | 'answered' } | { status: 'question'; view: SessionView }

export function QuickSession(props: Props) {
  const [state, setState] = useState<{ status: 'gone'; kind: 'unavailable' | 'answered' } | { status: 'done'; result: Result } | null>(null)
  const view = props.status === 'question' ? props.view : null
  const item = view?.item ?? null

  let body: ReactNode
  if (state?.status === 'done' && item) body = <ResultView item={item} result={state.result} />
  else if (state?.status === 'gone' || !view || !item) {
    const kind = state?.status === 'gone' ? state.kind : props.status === 'question' ? 'unavailable' : props.status
    body = <Message title={kind === 'answered' ? 'You already answered this question.' : "This question isn't available any more."} />
  } else {
    body = <Question view={view} item={item} onResult={(result) => setState({ status: 'done', result })} onGone={(kind) => setState({ status: 'gone', kind })} />
  }
  return <main className="mx-auto flex min-h-dvh w-full max-w-xl flex-col px-4">{body}</main>
}
