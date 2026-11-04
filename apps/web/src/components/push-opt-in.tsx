import { useState, useSyncExternalStore } from 'react'
import { useNavigate } from '@tanstack/react-router'
import { Share, SquarePlus } from 'lucide-react'
import { describeWindow, type PushSchedule } from '@learnquiz/api/schedule'
import { errorMessage } from '@/components/inline-error'
import { LearnQuizMark } from '@/components/learn-quiz-mark'
import { ErrorRow } from '@/components/question/error-row'
import { Button } from '@/components/ui/button'
import { enableWebPush, needsHomeScreen } from '@/lib/web-push'

const FAILED = 'Couldn’t turn on questions. Try again.'
// Shown when no question is ready yet; says what will arrive without inventing an assigned question.
const EXAMPLE = 'Your first question will show up here once it’s ready.'

function pushSupported() {
  return 'serviceWorker' in navigator && 'PushManager' in window && 'Notification' in window
}

// Read on the first client render so an iPhone never paints the Turn on screen first; null while server-rendering.
const noSubscribe = () => () => {}
function usePushEnv() {
  const env = useSyncExternalStore(noSubscribe, () => (needsHomeScreen() ? 'ios' : pushSupported() ? 'push' : 'unsupported'), () => null)
  return env && { ios: env === 'ios', supported: env === 'push' }
}

export function PushOptIn({ publicKey, endpoints, schedule }: { publicKey: string | null; endpoints: string[]; schedule: PushSchedule }) {
  const navigate = useNavigate()
  const env = usePushEnv()
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')

  const toToday = () => void navigate({ to: '/today' })

  async function turnOn() {
    if (busy || !publicKey) return
    setBusy(true)
    setError('')
    try {
      await enableWebPush(publicKey, endpoints)
    } catch (err) {
      setError(errorMessage(err, FAILED))
      setBusy(false)
      return
    }
    toToday()
  }

  const canTurnOn = Boolean(publicKey) && Boolean(env?.supported)

  return (
    <main className="mx-auto flex min-h-dvh w-full max-w-xl flex-col bg-surface-page px-4 pt-12">
      <div className="flex flex-1 flex-col gap-6 pb-4">
        {env && (env.ios ? <IosSteps /> : <Facts schedule={schedule} canTurnOn={canTurnOn} />)}
      </div>
      <div className="sticky bottom-0 -mx-4 flex flex-col gap-3 bg-surface-page px-4 pt-3 pb-[max(0.75rem,env(safe-area-inset-bottom))]">
        {env && !env.ios && error && <ErrorRow message={error} />}
        {env?.ios ? (
          <Button size="lg" className="w-full" onClick={toToday}>
            I’ve added it
          </Button>
        ) : (
          canTurnOn && (
            <Button size="lg" className="w-full" onClick={turnOn} disabled={busy}>
              Turn on questions
            </Button>
          )
        )}
        <Button variant="ghost" className="w-full" onClick={toToday} disabled={busy}>
          Not now
        </Button>
      </div>
    </main>
  )
}

function Facts({ schedule, canTurnOn }: { schedule: PushSchedule; canTurnOn: boolean }) {
  const facts = [
    schedule.phase === 'steady'
      ? `Up to ${schedule.steadyCap} a day.`
      : `Up to ${schedule.dailyCap} a day while you’re onboarding, then ${schedule.steadyCap}.`,
    `Only ${describeWindow(schedule.window)}.`,
    'Skip any. Nothing is lost.',
  ]
  return (
    <>
      <h1 tabIndex={-1} className="text-title-1 text-ink">
        Get a question during your shift?
      </h1>
      <div
        role="img"
        aria-label={schedule.preview ? `Preview of a notification from Learn Quiz: ${schedule.preview}` : `Example notification from Learn Quiz: ${EXAMPLE}`}
        className="flex flex-col gap-2 rounded-2xl bg-os-card p-4 text-os-ink"
      >
        <div aria-hidden className="flex items-center gap-2">
          <LearnQuizMark className="size-5 shrink-0" />
          <span className="text-caption text-os-ink-muted">{schedule.preview ? 'Learn Quiz · now' : 'Learn Quiz · example'}</span>
        </div>
        <p aria-hidden className="text-body font-semibold">
          {schedule.preview ?? EXAMPLE}
        </p>
      </div>
      {!canTurnOn && <p className="text-body text-ink-muted">This browser can’t send questions right now.</p>}
      <ul aria-label="How questions work" className="flex flex-col gap-3">
        {facts.map((fact) => (
          <li key={fact} className="text-body-lg text-ink">
            {fact}
          </li>
        ))}
      </ul>
    </>
  )
}

function IosSteps() {
  const circle = 'flex size-8 shrink-0 items-center justify-center rounded-full border-2 border-border-strong text-label text-ink tabular-nums'
  const icon = 'inline size-5 align-text-bottom'
  return (
    <>
      <p className="text-overline text-ink-muted">
        <span className="sr-only">Step </span>1 of 2
      </p>
      <h1 tabIndex={-1} className="text-title-1 text-ink">
        Add Learn Quiz to your Home Screen
      </h1>
      <p className="text-body-lg text-ink">iPhone only sends questions to apps on the Home Screen.</p>
      <ol aria-label="Steps" className="flex flex-col gap-4">
        <li className="flex items-center gap-4">
          <span aria-hidden className={circle}>1</span>
          <span className="text-body-lg text-ink">
            Tap Share <Share className={icon} aria-label="Share icon" role="img" /> in Safari’s toolbar
          </span>
        </li>
        <li className="flex items-center gap-4">
          <span aria-hidden className={circle}>2</span>
          <span className="text-body-lg text-ink">
            Choose Add to Home Screen <SquarePlus className={icon} aria-label="Add icon" role="img" />
          </span>
        </li>
        <li className="flex items-center gap-4">
          <span aria-hidden className={circle}>3</span>
          <span className="text-body-lg text-ink">Open Learn Quiz from your Home Screen</span>
        </li>
      </ol>
    </>
  )
}
