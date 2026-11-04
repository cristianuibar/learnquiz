import { useId } from 'react'
import { formatShortDate, percentText, type Profile } from '@learnquiz/api/progress'
import { profileEmptyView } from '@learnquiz/api/profile-empty'
import { MasteryBar } from '@/components/mastery-bar'

const card = 'flex flex-col gap-4 rounded-md border border-border bg-surface-card p-4'

function proficiencyFact({ achievedAt, projectedAt }: Profile['proficiency']): string | null {
  if (achievedAt !== null) return `Reached ${formatShortDate(achievedAt)}`
  if (projectedAt !== null) return `Projected: ${formatShortDate(projectedAt)}`
  return null
}

export function MasteryCard({ profile }: { profile: Profile }) {
  const id = useId()
  const m = percentText(profile.mastery)
  const b = percentText(profile.benchmark)
  const fact = proficiencyFact(profile.proficiency)
  const { onboarding } = profile
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

export function EmptyMasteryCard({ profile }: { profile: Profile }) {
  const id = useId()
  const view = profileEmptyView(profile)
  return (
    <section aria-labelledby={id} className={card}>
      <h2 id={id} className="sr-only">
        Role mastery
      </h2>
      <p className="text-title-2 tabular-nums">{view.heading}</p>
      <MasteryBar barClassName="h-3" label="Role mastery" value={0} benchmark={profile.benchmark} valueText={view.barValueText} />
      <p className="text-body">{view.body}</p>
    </section>
  )
}
