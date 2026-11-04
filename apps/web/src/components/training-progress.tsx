import type { ReactNode } from 'react'
import { Link } from '@tanstack/react-router'
import { MasteryBar } from '@/components/mastery-bar'
import { Badge } from '@/components/ui/badge'
import { plural } from '@/lib/utils'
import type { getProfile } from '@/server/profile'

type Profile = Awaited<ReturnType<typeof getProfile>>

const percent = (value: number) => `${Math.round(value * 100)}%`
const date = (at: number) => new Date(at).toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric', timeZone: 'UTC' })

// The employee's own screen and the partner's read-only view of a member render the same content.
export function TrainingProgress({ profile, back }: { profile: Profile; back: ReactNode }) {
  const { topic, role, benchmark, units, proficiency, confidentErrors, weeks, sessionCounts } = profile
  // Spread the weeks evenly across the chart; a lone week sits in the middle.
  const weekX = (i: number) => (weeks.length > 1 ? 12 + (i * 264) / (weeks.length - 1) : 144)
  return (
    <main className="mx-auto w-full max-w-xl space-y-8 px-4 pt-6 pb-8">
      <header>
        {back}
        <h1 className="text-title-1 text-ink">Training progress</h1>
        <p className="mt-2 font-medium">{profile.name}</p>
        {topic ? <p className="mt-2 text-muted-foreground">{topic.title}{role && ` · ${role}`}</p> : (
          <p className="mt-2 text-muted-foreground">Choose a topic to begin tracking your training. <Link to="/start" className="font-medium text-primary underline">Start learning</Link></p>
        )}
      </header>

      <section aria-labelledby="mastery-heading" className="space-y-4">
        <div>
          <h2 id="mastery-heading" className="text-xl font-semibold">Concept mastery</h2>
          <p className="mt-1 text-sm text-muted-foreground">{role ? 'Role benchmark' : 'Benchmark'}: {percent(benchmark)} per concept.</p>
        </div>
        {units.length ? units.map((unit) => (
          <div key={unit.id} className="space-y-4 rounded-lg border p-4">
            <h3 className="font-semibold">{unit.name}</h3>
            <ul className="space-y-4">
              {unit.concepts.map((concept) => (
                <li key={concept.id} className="space-y-2">
                  <div className="flex flex-wrap items-center gap-2 text-sm">
                    <span className="font-medium">{concept.name}</span>
                    {concept.critical && <Badge variant="neutral">Critical</Badge>}
                    <span className="ml-auto tabular-nums">{percent(concept.pKnown)}</span>
                  </div>
                  <MasteryBar value={concept.pKnown} label={`${concept.name} mastery; benchmark ${percent(benchmark)}`} />
                  <p className="text-xs text-muted-foreground">{concept.pKnown >= benchmark ? 'Benchmark reached' : 'Below benchmark'}</p>
                </li>
              ))}
            </ul>
          </div>
        )) : <p className="text-sm text-muted-foreground">Your concepts will appear here.</p>}
      </section>

      <section aria-labelledby="proficiency-heading" className="rounded-lg border p-4">
        <h2 id="proficiency-heading" className="text-xl font-semibold">Time to proficiency</h2>
        {proficiency.achievedAt !== null ? (
          <p className="mt-2">Benchmark reached in <strong>{plural(proficiency.days ?? 0, 'day', 'days')}</strong> · {date(proficiency.achievedAt)}</p>
        ) : proficiency.projectedAt !== null ? (
          <>
            <p className="mt-2">About <strong>{plural(proficiency.estimatedDays ?? 0, 'more day', 'more days')}</strong> · {date(proficiency.projectedAt)}</p>
            <p className="mt-1 text-sm text-muted-foreground">Estimate from your mastery gains this week. Your pace may change.</p>
          </>
        ) : <p className="mt-2 text-sm text-muted-foreground">Keep practicing across several days to see a projection.</p>}
      </section>

      <section aria-labelledby="errors-heading" className="space-y-3">
        <h2 id="errors-heading" className="text-xl font-semibold">Confident errors</h2>
        <p className="text-sm text-muted-foreground">Questions answered incorrectly when you felt sure. A later correct answer marks a correction.</p>
        {confidentErrors.length ? (
          <ul className="divide-y rounded-lg border px-4">
            {confidentErrors.map((error) => (
              <li key={error.id} className="py-3 text-sm">
                <p className="font-medium">{error.concept}</p>
                <p className="mt-1 text-muted-foreground">Error: {date(error.at)}</p>
                <p>{error.correctedAt === null ? 'Awaiting correction' : `Corrected: ${date(error.correctedAt)}`}</p>
              </li>
            ))}
          </ul>
        ) : <p className="text-sm text-muted-foreground">No confident errors recorded.</p>}
      </section>

      <section aria-labelledby="week-heading" className="space-y-3">
        <h2 id="week-heading" className="text-xl font-semibold">This week</h2>
        <p className="text-sm">{plural(sessionCounts.week, 'completed session', 'completed sessions')} this week · {sessionCounts.total} total</p>
        {weeks.length ? (
          <figure className="rounded-lg border p-4">
            <svg viewBox="0 0 288 112" role="img" aria-label="Average concept mastery for each of the last weeks" className="w-full text-primary">
              <line x1="12" y1="100" x2="276" y2="100" className="stroke-border" />
              <line x1="12" y1={100 - benchmark * 88} x2="276" y2={100 - benchmark * 88} className="stroke-muted-foreground" strokeDasharray="4 4" />
              <polyline points={weeks.map((w, i) => `${weekX(i)},${100 - w.mastery * 88}`).join(' ')} fill="none" stroke="currentColor" strokeWidth="2" />
              {weeks.map((w, i) => <circle key={w.start} cx={weekX(i)} cy={100 - w.mastery * 88} r="3" fill="currentColor" />)}
            </svg>
            <figcaption className="text-xs text-muted-foreground">Weeks of {date(weeks[0].start)} – {date(weeks[weeks.length - 1].start)} (UTC). Dashed line: {percent(benchmark)} benchmark.</figcaption>
            <div className="sr-only">
              <table>
                <caption>Weekly training activity</caption>
                <thead><tr><th>Week of (UTC)</th><th>Average mastery</th><th>Completed sessions</th></tr></thead>
                <tbody>{weeks.map((w) => <tr key={w.start}><th scope="row">{date(w.start)}</th><td>{percent(w.mastery)}</td><td>{w.sessions}</td></tr>)}</tbody>
              </table>
            </div>
          </figure>
        ) : <p className="text-sm text-muted-foreground">No weekly mastery recorded yet.</p>}
      </section>
    </main>
  )
}
