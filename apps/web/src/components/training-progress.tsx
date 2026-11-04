import type { ReactNode } from 'react'
import type { Profile } from '@learnquiz/api/progress'
import { CriticalSteps } from '@/components/profile/critical-steps'
import { EmptyMasteryCard, MasteryCard } from '@/components/profile/mastery-card'
import { ProfileHeader } from '@/components/profile/profile-header'
import { UnitAccordion } from '@/components/profile/unit-accordion'
import { WeeklyTrend } from '@/components/profile/weekly-trend'

// The employee's own screen and the partner's read-only view of a member render the same content.
export function TrainingProgress({ profile, self, back, action, status }: { profile: Profile; self: boolean; back?: ReactNode; action?: ReactNode; status?: ReactNode }) {
  return (
    <main className="mx-auto flex w-full max-w-xl flex-col gap-6 px-4 pt-6 pb-6">
      {back}
      <ProfileHeader name={profile.name} role={profile.role} self={self} />
      {status}
      {profile.started ? (
        <>
          <MasteryCard profile={profile} />
          <WeeklyTrend profile={profile} />
          <UnitAccordion units={profile.units} benchmark={profile.benchmark} />
          <CriticalSteps confidentErrors={profile.confidentErrors} flag={self} />
        </>
      ) : (
        <>
          <EmptyMasteryCard profile={profile} />
          {action}
        </>
      )}
    </main>
  )
}
