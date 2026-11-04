import { Check, Lock, Shield } from 'lucide-react'
import { percentText, unitAriaLabel, type TopicPath } from '@learnquiz/api/progress'
import { MasteryBar } from '@/components/mastery-bar'
import { Badge } from '@/components/ui/badge'
import { cn } from '@/lib/utils'
import { PathNode } from './path-node'

const muted = 'border-border bg-surface-sunken text-ink-muted'

export function UnitRow({
  unit,
  index,
  isNext,
  benchmark,
}: {
  unit: TopicPath['units'][number]
  index: number
  isNext: boolean
  benchmark: number
}) {
  const estimate = unit.state === 'estimate'
  const dim = estimate || unit.state === 'not_started'
  const chip =
    unit.state === 'mastered' ? (
      <Badge className="min-h-7 border-feedback-correct bg-feedback-correct-tint pl-2 text-feedback-correct">
        <Check aria-hidden />
        Mastered
      </Badge>
    ) : estimate ? (
      <Badge className="min-h-7 border-dashed border-border-strong bg-transparent pl-2 text-ink-muted">Estimate</Badge>
    ) : unit.state === 'not_started' ? (
      <Badge className={cn('min-h-7 pl-2', muted)}>
        <span aria-hidden className="size-3 rounded-full border-2 border-dotted border-current" />
        Not started
      </Badge>
    ) : unit.state === 'locked' ? (
      <Badge className={cn('min-h-7 pl-2', muted)}>
        <Lock aria-hidden />
        Locked
      </Badge>
    ) : null
  return (
    <li
      id={`unit-${unit.id}`}
      tabIndex={-1}
      aria-label={unitAriaLabel(unit, index, isNext)}
      className="group relative flex min-h-12 items-center gap-3 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-brand"
    >
      <span aria-hidden className="absolute top-0 -bottom-2 left-[15px] w-0.5 bg-border group-first:top-1/2 group-last:bottom-1/2" />
      <PathNode state={unit.state} number={index + 1} isNext={isNext} />
      <div className="flex min-w-0 flex-1 flex-col gap-2 rounded-md border border-border bg-surface-card px-4 py-3">
        <div className="flex items-baseline justify-between gap-2">
          <span className="flex min-w-0 items-baseline gap-2">
            <span className="text-label-lg">{unit.name}</span>
            {isNext && <span className="text-caption text-brand">Next</span>}
          </span>
          <span className={cn('text-label tabular-nums', dim && 'text-ink-muted')}>{percentText(unit.mastery, estimate)}</span>
        </div>
        <div aria-hidden>
          <MasteryBar value={unit.mastery} benchmark={benchmark} estimate={estimate} label={`${unit.name} mastery`} />
        </div>
        {(chip || unit.criticalCount > 0) && (
          <div className="flex items-center justify-between gap-2">
            {chip ?? <span />}
            {unit.criticalCount > 0 && (
              <span className="inline-flex items-center gap-1 text-chip tabular-nums">
                <Shield aria-hidden className="size-4" />
                {unit.criticalCount} critical
              </span>
            )}
          </div>
        )}
      </div>
    </li>
  )
}
