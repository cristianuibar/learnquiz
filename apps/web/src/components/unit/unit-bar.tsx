import { percentText, type TopicPath } from '@learnquiz/api/progress'
import { MasteryBar } from '@/components/mastery-bar'

export function UnitBar({ unit, benchmark }: { unit: TopicPath['units'][number]; benchmark: number }) {
  const estimate = unit.state === 'estimate'
  return (
    <section className="flex flex-col gap-3">
      <p className="flex items-baseline gap-2 tabular-nums">
        <span className="text-title-1">{percentText(unit.mastery, estimate)}</span>
        <span className="text-ink-muted">of {percentText(benchmark)} benchmark</span>
      </p>
      <MasteryBar
        label={`${unit.name} mastery`}
        value={unit.mastery}
        benchmark={benchmark}
        estimate={estimate}
        barClassName="h-3"
        className="h-3"
        valueText={`${estimate ? 'about ' : ''}${percentText(unit.mastery)}, benchmark ${percentText(benchmark)}`}
      />
    </section>
  )
}
