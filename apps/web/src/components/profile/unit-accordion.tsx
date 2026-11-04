import { useId, useState } from 'react'
import { ChevronDown } from 'lucide-react'
import { percentText, type Profile } from '@learnquiz/api/progress'
import { MasteryBar } from '@/components/mastery-bar'
import { Badge } from '@/components/ui/badge'
import { ConceptChips, statusWord } from '@/components/unit/concept-chips'
import { cn } from '@/lib/utils'

type Unit = Profile['units'][number]

function UnitItem({ unit, index, benchmark }: { unit: Unit; index: number; benchmark: number }) {
  const [open, setOpen] = useState(index === 0)
  const panelId = useId()
  const estimate = unit.state === 'estimate'
  const barValue = unit.state === 'mastered' || unit.state === 'learning' || estimate ? unit.mastery : 0
  return (
    <li className="flex flex-col gap-2 pt-1 pb-4">
      <h3>
        <button
          type="button"
          aria-expanded={open}
          aria-controls={panelId}
          onClick={() => setOpen((o) => !o)}
          className="flex w-full min-h-12 items-center gap-3 text-left focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-brand"
        >
          <span className="text-label-lg flex-1">{unit.name}</span>
          <span className={cn('min-w-10 text-right text-label tabular-nums', estimate && 'text-ink-muted')}>
            {percentText(unit.mastery, estimate)}
          </span>
          {estimate && <span className="sr-only">, placement estimate</span>}
          <ChevronDown
            aria-hidden
            className={cn(
              'size-5 shrink-0 text-ink-muted transition-transform duration-fast ease-out motion-reduce:transition-none',
              open && 'rotate-180',
            )}
          />
        </button>
      </h3>
      <div aria-hidden className="mr-7">
        <MasteryBar value={barValue} benchmark={benchmark} estimate={estimate} label={`${unit.name} mastery`} />
      </div>
      {estimate && (
        <Badge aria-hidden className="min-h-7 border-dashed border-border-strong bg-transparent pl-2 text-ink-muted">
          Estimate
        </Badge>
      )}
      <div id={panelId} hidden={!open} className="mt-2 flex flex-col gap-4">
        {estimate && <p className="text-caption text-ink-muted">From your placement check. Not practiced yet.</p>}
        <ul className="flex flex-col gap-4">
          {unit.concepts.map((concept) => (
            <li key={concept.id} className="flex flex-col gap-2">
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
            </li>
          ))}
        </ul>
      </div>
    </li>
  )
}

export function UnitAccordion({ units, benchmark }: { units: Profile['units']; benchmark: number }) {
  const id = useId()
  if (units.length === 0) return null
  return (
    <section aria-labelledby={id} className="flex flex-col gap-3">
      <h2 id={id} className="text-title-3">
        By unit
      </h2>
      <ul className="divide-y divide-border rounded-md border border-border bg-surface-card px-4">
        {units.map((unit, i) => (
          <UnitItem key={unit.id} unit={unit} index={i} benchmark={benchmark} />
        ))}
      </ul>
    </section>
  )
}
