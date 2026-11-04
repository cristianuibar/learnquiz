import type { ReactNode } from 'react'
import { Check } from 'lucide-react'
import { DashedCircle, HalfDisc } from '@/components/status-icons'

// Portal row: name, status chip, bar and percentage. Status is never colour alone (icon + text).
// `mastery` is a whole percentage (0..100). Mastered follows the server's proficiency stage, which also requires every critical concept.
export function PortalMasteryBar({ name, label, mastery, stage }: { name: ReactNode; label: string; mastery: number; stage: 'onboarding' | 'proficient' }) {
  const status =
    stage === 'proficient'
      ? { text: 'Mastered', Icon: Check, tone: 'text-feedback-correct bg-feedback-correct-tint' }
      : mastery > 0
        ? { text: 'Still learning', Icon: HalfDisc, tone: 'text-feedback-learning bg-feedback-learning-tint' }
        : { text: 'Not started', Icon: DashedCircle, tone: 'text-ink-muted bg-surface-sunken' }
  return (
    <div className="grid grid-cols-1 gap-2 sm:grid-cols-[minmax(0,1fr)_auto_minmax(6rem,12rem)_3.5rem] sm:items-center sm:gap-4">
      <div className="text-label min-w-0">{name}</div>
      <span className={`text-label inline-flex w-fit items-center gap-1 rounded-full px-2 py-1 ${status.tone}`}>
        <status.Icon className="size-4" />
        {status.text}
      </span>
      <div
        role="progressbar"
        aria-valuenow={mastery}
        aria-valuemin={0}
        aria-valuemax={100}
        aria-label={`${label} mastery`}
        className="h-2 overflow-hidden rounded-full bg-surface-sunken"
      >
        <div className="h-full rounded-full bg-brand" style={{ width: `${mastery}%` }} />
      </div>
      <span className="text-label tabular-nums sm:text-right">{mastery}%</span>
    </div>
  )
}
