import { useId, useState, type ReactNode } from 'react'
import { Check, ChevronDown, CircleDashed, Shield } from 'lucide-react'
import { percentText, type Profile } from '@learnquiz/api/progress'
import { StatusChip } from '@/components/admin/status-chip'
import { MasteryBar } from '@/components/mastery-bar'
import { HalfDisc } from '@/components/status-icons'
import { Badge } from '@/components/ui/badge'
import { ConceptChips, statusWord } from '@/components/unit/concept-chips'
import { cn } from '@/lib/utils'

type Unit = Profile['units'][number]

const portalStatus = {
  mastered: { tone: 'mastered', icon: Check, word: statusWord.mastered },
  learning: { tone: 'learning', icon: HalfDisc, word: statusWord.learning },
  estimate: { tone: 'settled', icon: CircleDashed, word: 'Placement estimate' },
  not_started: { tone: 'muted', icon: CircleDashed, word: statusWord.not_started },
} as const

function PortalProgress({ name, value, state, benchmark, critical = false, disclosure }: {
  name: string
  value: number | null
  state: Unit['state']
  benchmark: number
  critical?: boolean
  disclosure?: ReactNode
}) {
  const estimate = state === 'estimate'
  const status = portalStatus[state === 'locked' ? 'not_started' : state]
  return (
    <>
      <span className="flex min-w-0 flex-[1_1_240px] flex-wrap items-center gap-2 break-words">
        <span className={disclosure ? 'text-label-lg' : 'text-body'}>{name}</span>
        {critical && <StatusChip tone="critical" icon={Shield}>Critical</StatusChip>}
      </span>
      <span className="flex min-w-0 flex-[0_1_460px] items-center gap-3">
        <span aria-hidden={disclosure ? true : undefined} className="min-w-8 flex-[1_1_200px]">
          {value !== null && (
            <MasteryBar
              label={`${name} mastery`}
              value={value}
              benchmark={benchmark}
              estimate={estimate}
              valueText={`${percentText(value, estimate)}, ${status.word}${critical ? ', critical' : ''}, benchmark ${percentText(benchmark)}`}
            />
          )}
        </span>
        <span className={cn('w-12 shrink-0 text-right text-label tabular-nums', estimate && 'text-ink-muted')}>
          {value !== null && percentText(value, estimate)}
        </span>
        <span className="flex w-39 shrink-0">
          <StatusChip tone={status.tone} icon={status.icon}>{status.word}</StatusChip>
        </span>
        {disclosure ?? <span aria-hidden className="w-5 shrink-0" />}
      </span>
    </>
  )
}

function UnitItem({ unit, index, benchmark, portal }: { unit: Unit; index: number; benchmark: number; portal: boolean }) {
  const [open, setOpen] = useState(index === 0)
  const panelId = useId()
  const estimate = unit.state === 'estimate'
  const barValue = unit.state === 'mastered' || unit.state === 'learning' || estimate ? unit.mastery : 0
  const chevron = (
    <ChevronDown
      aria-hidden
      className={cn(
        'size-5 shrink-0 text-ink-muted transition-transform duration-fast ease-out motion-reduce:transition-none',
        open && 'rotate-180',
      )}
    />
  )
  return (
    <li className={cn('flex flex-col gap-2 pt-1 pb-4', portal && 'gap-0 py-0')}>
      <h3>
        <button
          type="button"
          aria-expanded={open}
          aria-controls={panelId}
          onClick={() => setOpen((o) => !o)}
          className={cn('flex w-full min-h-12 items-center gap-3 text-left focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-brand', portal && 'min-h-16 flex-wrap gap-y-2 py-3')}
        >
          {portal ? (
            <PortalProgress name={unit.name} value={unit.state === 'not_started' || unit.state === 'locked' ? null : barValue} state={unit.state} benchmark={benchmark} disclosure={chevron} />
          ) : (
            <>
              <span className="text-label-lg flex-1">{unit.name}</span>
              <span className={cn('min-w-10 text-right text-label tabular-nums', estimate && 'text-ink-muted')}>
                {percentText(unit.mastery, estimate)}
              </span>
              {estimate && <span className="sr-only">, placement estimate</span>}
              {chevron}
            </>
          )}
        </button>
      </h3>
      {!portal && (
        <div aria-hidden className="mr-7">
          <MasteryBar value={barValue} benchmark={benchmark} estimate={estimate} label={`${unit.name} mastery`} />
        </div>
      )}
      {!portal && estimate && (
        <Badge aria-hidden className="min-h-7 border-dashed border-border-strong bg-transparent pl-2 text-ink-muted">
          Estimate
        </Badge>
      )}
      <div id={panelId} hidden={!open} className={cn('mt-2 flex flex-col gap-4', portal && 'mt-0')}>
        {!portal && estimate && <p className="text-caption text-ink-muted">From your placement check. Not practiced yet.</p>}
        <ul className={cn('flex flex-col gap-4', portal && 'gap-0')}>
          {unit.concepts.map((concept) => (
            <li key={concept.id} className={cn('flex flex-col gap-2', portal && 'min-h-13 flex-row flex-wrap items-center gap-x-3 border-t border-border py-3')}>
              {portal ? (
                <PortalProgress
                  name={concept.name}
                  value={concept.measured || estimate || concept.pKnown > 0 ? concept.pKnown : null}
                  state={!concept.measured && (estimate || concept.pKnown > 0) ? 'estimate' : concept.status}
                  benchmark={benchmark}
                  critical={concept.critical}
                />
              ) : (
                <>
                  <p className="text-body">{concept.name}</p>
                  {concept.measured && (
                    <div className="flex items-center gap-3">
                      <MasteryBar
                        className="flex-1"
                        label={concept.name}
                        value={concept.pKnown}
                        benchmark={benchmark}
                        valueText={`${percentText(concept.pKnown)}, ${statusWord[concept.status]}${concept.critical ? ', critical' : ''}, benchmark ${percentText(benchmark)}`}
                      />
                      <span className="min-w-10 text-right text-label tabular-nums">{percentText(concept.pKnown)}</span>
                    </div>
                  )}
                  <ConceptChips status={concept.status} critical={concept.critical} />
                </>
              )}
            </li>
          ))}
        </ul>
      </div>
    </li>
  )
}

// `portal` (company admin view) shows unmeasured concepts with a placement value as a dashed estimate bar.
export function UnitAccordion({ units, benchmark, portal = false }: { units: Profile['units']; benchmark: number; portal?: boolean }) {
  const id = useId()
  if (units.length === 0) return null
  return (
    <section aria-labelledby={id} className="flex flex-col gap-3">
      <h2 id={id} className="text-title-3">
        By unit
      </h2>
      <ul className="divide-y divide-border rounded-md border border-border bg-surface-card px-4">
        {units.map((unit, i) => (
          <UnitItem key={unit.id} unit={unit} index={i} benchmark={benchmark} portal={portal} />
        ))}
      </ul>
    </section>
  )
}
