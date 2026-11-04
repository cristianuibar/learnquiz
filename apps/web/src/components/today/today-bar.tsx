import type { TodayStreak } from '@learnquiz/api/today'
import { LearnQuizMark } from '@/components/learn-quiz-mark'
import { OrgMark } from './org-mark'
import { StreakPill } from './streak-pill'

export function TodayBar({
  org,
  streak,
  streakVariant = 'quiet',
}: {
  org: { name: string; logoUrl: string | null } | null
  streak: TodayStreak | null
  streakVariant?: 'quiet' | 'reward'
}) {
  return (
    <div className="flex min-h-14 items-center justify-between gap-3">
      <h1 tabIndex={-1} className="sr-only">
        Today
      </h1>
      <div className="flex min-w-0 items-center gap-2">
        {org ? (
          <>
            <OrgMark name={org.name} logoUrl={org.logoUrl} branded />
            <span className="truncate text-label text-ink">{org.name}</span>
          </>
        ) : (
          <>
            <LearnQuizMark className="size-8 shrink-0" />
            <span className="text-label text-ink">Learn Quiz</span>
          </>
        )}
      </div>
      {streak && <StreakPill streak={streak} variant={streakVariant} />}
    </div>
  )
}
