import type { ReactNode } from 'react'
import type { Profile } from '@learnquiz/api/progress'
import { EmptyMasteryCard, MasteryCard } from '@/components/profile/mastery-card'
import { ProfileHeader } from '@/components/profile/profile-header'
import { WeeklyTrend } from '@/components/profile/weekly-trend'

// The employee's own screen and the partner's read-only view of a member render the same content.
export function TrainingProgress({ profile, self, back, action }: { profile: Profile; self: boolean; back?: ReactNode; action?: ReactNode }) {
  return (
    <main className="mx-auto flex w-full max-w-xl flex-col gap-6 px-4 pt-6 pb-6">
      {back}
      <ProfileHeader name={profile.name} role={profile.role} self={self} />
      {profile.started ? (
        <>
          <MasteryCard profile={profile} />
          <WeeklyTrend profile={profile} />
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
