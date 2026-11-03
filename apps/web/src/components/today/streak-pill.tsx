import type { TodayStreak } from '@learnquiz/api/today'
import { cn } from '@/lib/utils'

export function StreakPill({ streak, variant = 'quiet' }: { streak: TodayStreak; variant?: 'quiet' | 'reward' }) {
  return (
    <span
      className={cn(
        'inline-flex min-h-8 items-center gap-1 whitespace-nowrap rounded-full py-1 pl-2 pr-3 text-label tabular-nums',
        variant === 'reward' ? 'bg-accent text-on-accent motion-safe:animate-pop-in' : 'border border-border bg-surface-card text-ink',
      )}
    >
      <svg width={20} height={20} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
        <path d="M8.5 14.5A2.5 2.5 0 0 0 11 12c0-1.38-.5-2-1-3-1.072-2.143-.224-4.054 2-6 .5 2.5 2 4.9 4 6.5 2 1.6 3 3.5 3 5.5a7 7 0 1 1-14 0c0-1.153.433-2.294 1-3a2.5 2.5 0 0 0 2.5 2.5z" />
      </svg>
      <span>
        {streak.text}
        <span className="sr-only"> in a row</span>
      </span>
    </span>
  )
}
