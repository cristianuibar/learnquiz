import { useEffect, useState } from 'react'
import { Link, createFileRoute, redirect, useLocation } from '@tanstack/react-router'
import { RouteError } from '@/components/inline-error'
import { ModelLabel } from '@/components/model-label'
import { ModelTrace } from '@/components/model-trace'
import { CoachLine, MasteryMoved, MistakesDisclosure, RewardChips, scoreLine } from '@/components/session-summary'
import { StartButton } from '@/components/start-button'
import { Button } from '@/components/ui/button'
import { endSession, prepareNextSession } from '@/server/play'
import { getPushSettings } from '@/server/push'

export const Route = createFileRoute('/play/$sessionId_/done')({
  beforeLoad: ({ context }) => {
    if (!context.user) throw redirect({ to: '/' })
  },
  loader: async ({ params, context }) => {
    const summary = await endSession({ data: { sessionId: params.sessionId } }) // idempotent, so reloads work
    const settings = summary.total > 0 && context.user && !context.user.isAnonymous ? await getPushSettings() : null
    // The first finished session on an account with no subscription continues to the push opt-in, once.
    return { ...summary, optIn: Boolean(settings?.canPrompt && settings.endpoints.length === 0) }
  },
  errorComponent: RouteError,
  component: Done,
})

function Done() {
  const s = Route.useLoaderData()
  const placed = s.kind === 'placement' && s.level !== null
  const reportSent = useLocation({ select: (l) => Boolean(l.state.reportSent) })
  const [announcement, setAnnouncement] = useState('')
  // Filled after mount so the live region exists first and the report sent on the last question is read out.
  useEffect(() => setAnnouncement(reportSent ? 'Report sent' : ''), [reportSent])
  useEffect(() => {
    // The frontier is known only once placement ends, so the first session's questions are written here.
    if (placed) prepareNextSession({ data: { sessionId: s.sessionId } }).catch(() => {})
  }, [placed, s.sessionId])
  return (
    <main className="mx-auto flex min-h-dvh w-full max-w-xl flex-col gap-8 px-4 pt-8">
      <p role="status" className="sr-only">
        {announcement}
      </p>
      <div className="flex flex-col gap-4">
        <div className="flex flex-col gap-1">
          <h1 tabIndex={-1} className="text-title-1 text-ink">
            {placed ? `You're at level ${s.level} of 5` : 'Session done'}
          </h1>
          <p className="text-body-lg text-ink-muted tabular-nums">{scoreLine(s)}</p>
        </div>
        {placed && s.levelLine && <p className="text-body-lg text-ink">{s.levelLine}</p>}
        {placed && s.levelLine && <ModelLabel model={s.levelLineModel} />}
        {s.kind === 'placement' && s.endedEarly && (
          <p className="text-ink-muted">Placement stopped early: it had enough answers to place you.</p>
        )}
        {s.kind !== 'placement' && <RewardChips xp={s.xp} streak={s.streak} />}
        {s.nextLine && <CoachLine>{s.nextLine}</CoachLine>}
      </div>
      <MasteryMoved rows={s.masteryMoved} benchmark={s.benchmark} />
      <MistakesDisclosure mistakes={s.mistakes} />
      <ModelTrace key={s.sessionId} scope={{ scope: 'session', sessionId: s.sessionId }} variant="link" />
      <div className="sticky bottom-0 -mx-4 mt-auto flex flex-col gap-1 border-t border-border bg-surface-page px-4 pt-3 pb-[max(0.75rem,env(safe-area-inset-bottom))]">
        <Button asChild size="lg" className="w-full">
          <Link to={s.optIn ? '/opt-in' : '/today'}>Continue</Link>
        </Button>
        <StartButton topicId={s.topicId} variant="link" className="self-center">
          Another session
        </StartButton>
      </div>
    </main>
  )
}
