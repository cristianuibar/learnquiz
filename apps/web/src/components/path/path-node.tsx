import { Check, Lock } from 'lucide-react'
import type { UnitState } from '@learnquiz/api/progress'
import { cn } from '@/lib/utils'

const ring = 'border-2 bg-surface-page text-ink'

// Kind only; the bar carries progress. The next unit gets the brand ring.
export function PathNode({ state, number, isNext }: { state: UnitState; number: number; isNext: boolean }) {
  const tone = isNext
    ? 'border-2 border-solid border-brand bg-surface-page text-brand'
    : {
        mastered: 'bg-brand-tint text-brand',
        learning: `${ring} border-solid border-border-strong`,
        estimate: `${ring} border-dashed border-border-strong`,
        not_started: `${ring} border-dotted border-border-strong`,
        locked: 'bg-surface-sunken text-ink-muted',
      }[state]
  const Icon = !isNext && state === 'mastered' ? Check : !isNext && state === 'locked' ? Lock : null
  return (
    <span aria-hidden className={cn('relative inline-flex size-8 shrink-0 items-center justify-center rounded-full', tone)}>
      {Icon ? <Icon className="size-4" /> : <span className="text-label tabular-nums">{number}</span>}
    </span>
  )
}
