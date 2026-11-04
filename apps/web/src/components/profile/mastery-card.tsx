import { useId } from 'react'
import { formatShortDate, percentText, type Profile } from '@learnquiz/api/progress'
import { profileEmptyView } from '@learnquiz/api/profile-empty'
import { Check } from 'lucide-react'
import { MasteryBar } from '@/components/mastery-bar'
import { StatusChip } from '@/components/admin/status-chip'

const card = 'flex flex-col gap-4 rounded-md border border-border bg-surface-card p-4'

function proficiencyFact({ achievedAt, projectedAt }: Profile['proficiency']): string | null {
  if (achievedAt !== null) return `Reached ${formatShortDate(achievedAt)}`
  if (projectedAt !== null) return `Projected: ${formatShortDate(projectedAt)}`
  return null
}

function plural(n: number, word: string) {
  return `${n} ${word}${n === 1 ? '' : 's'}`
}

// `portal` is the company admin's read-only view: a larger bar and a wrapping facts row with session counts.
export function MasteryCard({ profile, portal = false }: { profile: Profile; portal?: boolean }) {
  const id = useId()
  const m = percentText(profile.mastery)
  const b = percentText(profile.benchmark)
  const fact = proficiencyFact(profile.proficiency)
  const { onboarding, proficiency, sessionCounts } = profile
  if (portal) {
    return (
      <section aria-labelledby={id} className={card}>
        <h2 id={id} className="sr-only">
          Role mastery
        </h2>
        <p className="flex flex-wrap items-baseline gap-2">
          <span className="text-display tabular-nums">{m}</span>
          <span className="text-body text-ink-muted">of {b} benchmark</span>
        </p>
        <MasteryBar barClassName="h-4" label="Role mastery" value={profile.mastery} benchmark={profile.benchmark} valueText={`${m}, benchmark ${b}`} />
        <ul className="m-0 flex list-none flex-wrap items-center gap-x-8 gap-y-2 border-t border-border p-0 pt-4 text-label tabular-nums">
          {onboarding && <li>Day {onboarding.day} of {onboarding.days}</li>}
          {proficiency.achievedAt !== null ? (
            <li className="flex flex-wrap items-center gap-2">
              <StatusChip tone="mastered" icon={Check}>Proficient</StatusChip>
              <span>
                Reached {formatShortDate(proficiency.achievedAt)}
                {proficiency.days !== null && ` · in ${plural(proficiency.days, 'day')}`}
              </span>
            </li>
          ) : (
            proficiency.projectedAt !== null && <li>Projected: {formatShortDate(proficiency.projectedAt)}</li>
          )}
          <li>Sessions: {sessionCounts.week} this week · {sessionCounts.total} total</li>
        </ul>
      </section>
    )
  }
  return (
    <section aria-labelledby={id} className={card}>
      <h2 id={id} className="sr-only">
        Role mastery
      </h2>
      <p className="flex flex-wrap items-baseline gap-2">
        <span className="text-display tabular-nums">{m}</span>
        <span className="text-body text-ink-muted">of {b} benchmark</span>
      </p>
      <MasteryBar barClassName="h-3" label="Role mastery" value={profile.mastery} benchmark={profile.benchmark} valueText={`${m}, benchmark ${b}`} />
      {(onboarding || fact) && (
        <div className="grid grid-cols-2 gap-4 border-t border-border pt-4">
          {onboarding && (
            <p className="text-label tabular-nums">
              Day {onboarding.day} of {onboarding.days}
            </p>
          )}
          {fact && <p className="text-label tabular-nums">{fact}</p>}
        </div>
      )}
    </section>
  )
}

// `portal` shows the heading and a body about someone else, with `name` as who.
export function EmptyMasteryCard({ profile, portal }: { profile: Profile; portal?: { firstName: string } }) {
  const id = useId()
  const view = profileEmptyView(profile)
  return (
    <section aria-labelledby={id} className={card}>
      {portal ? (
        <h2 id={id} className="text-title-2 tabular-nums">{view.heading}</h2>
      ) : (
        <>
          <h2 id={id} className="sr-only">
            Role mastery
          </h2>
          <p className="text-title-2 tabular-nums">{view.heading}</p>
        </>
      )}
      <MasteryBar barClassName="h-3" label="Role mastery" value={0} benchmark={profile.benchmark} valueText={view.barValueText} />
      <p className="text-body">{portal ? `Progress shows after ${portal.firstName}'s first session.` : view.body}</p>
    </section>
  )
}
