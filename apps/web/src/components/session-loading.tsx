import { useCallback, useEffect, useRef, useState } from 'react'
import { Link, useNavigate, useRouter } from '@tanstack/react-router'
import { useServerFn } from '@tanstack/react-start'
import { X } from 'lucide-react'
import { loadingTitle, slowAfterMs, startFailed, startSlow } from '@learnquiz/api/system-copy'
import { errorMessage } from '@/components/inline-error'
import { ErrorRow } from '@/components/question/error-row'
import { Button } from '@/components/ui/button'
import { startPlacement, startSession } from '@/server/play'

const preparingStatus = 'Getting your questions ready.'

interface Failure {
  message: string
  retry: boolean
}

// A 4xx carries the server's own sentence and will not change on retry; no response or a 5xx is worth trying again.
function describeFailure(err: unknown): Failure {
  const status = (err as { status?: unknown } | null)?.status
  if (typeof status === 'number' && status >= 400 && status < 500) return { message: errorMessage(err), retry: false }
  return { message: startFailed, retry: true }
}

export function SessionLoading({ topicId, start, unitId }: { topicId: string; start: 'session' | 'placement'; unitId?: string }) {
  const navigate = useNavigate()
  const router = useRouter()
  const runSession = useServerFn(startSession)
  const runPlacement = useServerFn(startPlacement)
  const heading = useRef<HTMLHeadingElement>(null)
  const mounted = useRef(false)
  const started = useRef<number | null>(null)
  // Cancel or Back may still be loading its target while this screen stays mounted; a late start must not override it.
  // Forward back here before that target commits clears the flag, and a start that finished meanwhile opens then.
  const left = useRef(false)
  const finished = useRef<string | null>(null)
  const [attempt, setAttempt] = useState(0)
  const [slow, setSlow] = useState(false)
  const [failure, setFailure] = useState<Failure | null>(null)

  useEffect(() => heading.current?.focus(), [])

  const openSession = useCallback((sessionId: string) => {
    finished.current = sessionId
    if (!mounted.current || left.current) return
    finished.current = null
    void navigate({ to: '/play/$sessionId', params: { sessionId }, replace: true })
  }, [navigate])

  useEffect(() => {
    const offBefore = router.subscribe('onBeforeNavigate', ({ pathChanged }) => { left.current = pathChanged })
    const offResolved = router.subscribe('onResolved', ({ pathChanged }) => {
      if (!pathChanged && finished.current !== null) openSession(finished.current)
    })
    return () => {
      offBefore()
      offResolved()
    }
  }, [router, openSession])

  useEffect(() => {
    // StrictMode replays mount, cleanup, mount; only a real unmount leaves this false.
    mounted.current = true
    const timer = setTimeout(() => setSlow(true), slowAfterMs(start))
    if (started.current !== attempt) {
      started.current = attempt
      const request = start === 'placement'
        ? runPlacement({ data: { topicId } })
        : runSession({ data: unitId === undefined ? { topicId } : { topicId, unitId } })
      request.then(
        ({ sessionId }) => {
          clearTimeout(timer)
          openSession(sessionId)
        },
        (err: unknown) => {
          clearTimeout(timer)
          if (mounted.current) setFailure(describeFailure(err))
        },
      )
    }
    return () => {
      mounted.current = false
      clearTimeout(timer)
    }
  }, [attempt, topicId, start, unitId, runSession, runPlacement, openSession])

  return (
    <main className="mx-auto flex min-h-dvh w-full max-w-xl flex-col px-4">
      <div className="-ml-3 flex h-14 items-center">
        <Link
          to="/today"
          replace
          aria-label="Cancel"
          className="inline-flex size-12 items-center justify-center rounded-md text-ink hover:bg-surface-sunken focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-brand"
        >
          <X className="size-5" aria-hidden />
        </Link>
      </div>
      {!failure && (
        <div className="flex flex-col gap-3 pt-4" aria-hidden>
          <div className="h-6 w-[92%] rounded-md bg-surface-sunken" />
          <div className="h-6 w-[64%] rounded-md bg-surface-sunken" />
          <div className="mt-3 flex flex-col gap-3">
            {[0, 1, 2, 3].map((i) => <div key={i} className="h-14 rounded-md bg-surface-sunken" />)}
          </div>
        </div>
      )}
      <div className="mt-auto flex flex-col gap-3 pb-6 pt-6">
        <h1 ref={heading} tabIndex={-1} className="text-title-2 text-ink text-center focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-brand">{loadingTitle}</h1>
        {failure ? (
          <>
            <ErrorRow message={failure.message} />
            {failure.retry && (
              <Button
                size="lg"
                className="w-full"
                onClick={() => {
                  setFailure(null)
                  setSlow(false)
                  setAttempt((n) => n + 1)
                }}
              >
                Try again
              </Button>
            )}
          </>
        ) : (
          <p role="status" className="text-ink-muted text-center">{slow ? startSlow : preparingStatus}</p>
        )}
      </div>
    </main>
  )
}
