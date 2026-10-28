import { Link, createFileRoute, redirect } from '@tanstack/react-router'
import { RouteError } from '@/components/inline-error'
import { MasteryBar } from '@/components/mastery-bar'
import { StartButton } from '@/components/start-button'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { endSession } from '@/server/play'

export const Route = createFileRoute('/play/$sessionId/done')({
  beforeLoad: ({ context }) => {
    if (!context.user) throw redirect({ to: '/' })
  },
  loader: ({ params }) => endSession({ data: { sessionId: params.sessionId } }), // idempotent, so reloads work
  errorComponent: RouteError,
  component: Done,
})

const clock = (ms: number) => `${Math.floor(ms / 60000)}:${String(Math.floor(ms / 1000) % 60).padStart(2, '0')}`
const pct = (v: number) => `${Math.round(v * 100)}%`

function Done() {
  const s = Route.useLoaderData()
  const placed = s.kind === 'placement' && s.level !== null
  return (
    <main className="mx-auto w-full max-w-xl px-4 pt-8 pb-16">
      <h1 className="text-3xl font-bold tracking-tight">
        {placed ? `You're at level ${s.level} of 5` : `Session done, ${clock(s.durationMs)}`}
      </h1>
      {placed && s.levelLine && <p className="mt-3 text-lg text-muted-foreground">{s.levelLine}</p>}
      <p className="mt-4 flex flex-wrap gap-x-6 text-lg font-medium">
        <span>
          {s.correct} / {s.total} correct
        </span>
        {s.kind !== 'placement' && (
          <>
            <span>+{s.xp} xp</span>
            <span>streak {s.streak}</span>
          </>
        )}
      </p>
      {s.masteryMoved.length > 0 && (
        <section className="mt-10">
          <h2 className="text-xl font-semibold">Mastery moved</h2>
          <ul className="mt-4 flex flex-col gap-4">
            {s.masteryMoved.map((m) => (
              <li key={m.unitId}>
                <div className="flex justify-between gap-4">
                  <span className="font-medium">{m.unitName}</span>
                  <span className="shrink-0 text-sm font-medium tabular-nums">
                    {pct(m.before)} → {pct(m.after)}
                  </span>
                </div>
                <MasteryBar className="mt-2" label={m.unitName} from={m.before} value={m.after} />
              </li>
            ))}
          </ul>
        </section>
      )}
      {s.mistakes.length > 0 && (
        <section className="mt-10">
          <h2 className="text-xl font-semibold">Your mistakes ({s.mistakes.length})</h2>
          <ul className="mt-4 flex flex-col gap-3">
            {s.mistakes.map((m) => (
              <li key={m.itemId} className="rounded-lg border p-4">
                <div className="flex items-start justify-between gap-3">
                  <p className="font-medium">{m.stem}</p>
                  {m.wasSure && <Badge className="bg-wrong-soft text-wrong">you were sure</Badge>}
                </div>
                <p className="mt-1 text-sm text-muted-foreground">{m.correctAnswer}</p>
              </li>
            ))}
          </ul>
        </section>
      )}
      <p className="mt-10 rounded-lg bg-learning-soft p-4">
        <span className="font-semibold">Coach:</span> {s.nextLine}
      </p>
      <div className="mt-10 flex flex-wrap items-center gap-3">
        {placed ? (
          <Button asChild className="h-11 px-6">
            <Link to="/t/$topicId/path" params={{ topicId: s.topicId }}>
              See your path
            </Link>
          </Button>
        ) : (
          <>
            <StartButton topicId={s.topicId}>Another session</StartButton>
            <Button asChild variant="outline" className="h-11 px-6">
              <Link to="/t/$topicId/path" params={{ topicId: s.topicId }}>
                Your path
              </Link>
            </Button>
          </>
        )}
      </div>
    </main>
  )
}
