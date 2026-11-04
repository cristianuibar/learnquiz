import type { ReactNode } from 'react'
import type { Profile } from '@learnquiz/api/progress'
import { CriticalSteps } from '@/components/profile/critical-steps'
import { EmptyMasteryCard, MasteryCard } from '@/components/profile/mastery-card'
import { ProfileHeader } from '@/components/profile/profile-header'
import { UnitAccordion } from '@/components/profile/unit-accordion'
import { WeeklyTrend } from '@/components/profile/weekly-trend'
import { cn } from '@/lib/utils'

// The employee's own screen and the partner's read-only view of a member render the same content.
export function TrainingProgress({ profile, self, flag = false, back, action, status, trailing }: { profile: Profile; self: boolean; flag?: boolean; back?: ReactNode; action?: ReactNode; status?: ReactNode; trailing?: ReactNode }) {
  const dockAction = !profile.started && !!action
  const content = (
    <>
      {back}
      <ProfileHeader name={profile.name} role={profile.role} self={self} trailing={trailing} />
      {status}
      {profile.started ? (
        <>
          <MasteryCard profile={profile} />
          <WeeklyTrend profile={profile} />
          <UnitAccordion units={profile.units} benchmark={profile.benchmark} />
          <CriticalSteps confidentErrors={profile.confidentErrors} flag={flag} />
        </>
      ) : (
        <EmptyMasteryCard profile={profile} />
      )}
    </>
  )
  return (
    <main className={cn('mx-auto flex w-full max-w-xl flex-col gap-6 px-4 pt-2 pb-6', dockAction && 'h-[calc(100dvh-4rem-env(safe-area-inset-bottom))] gap-0 pb-0')}>
      {dockAction ? (
        <>
          <div className="-mx-4 flex min-h-0 flex-1 flex-col gap-6 overflow-y-auto px-4 pb-6">
            {content}
          </div>
          <div className="-mx-4 flex shrink-0 flex-col border-t border-border bg-surface-page px-4 py-3">
            {action}
          </div>
        </>
      ) : content}
    </main>
  )
}
