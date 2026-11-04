import { percentText, type TopicPath } from '@learnquiz/api/progress'
import { MasteryBar } from '@/components/mastery-bar'

export function PathHeader({
  title,
  mastery,
  benchmark,
  onboarding,
}: { title: string } & Pick<TopicPath, 'mastery' | 'benchmark' | 'onboarding'>) {
  return (
    <header className="flex flex-col gap-3">
      <div className="flex flex-col gap-1">
        <h1 tabIndex={-1} className="text-title-1 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-brand">
          {title}
        </h1>
        <p className="text-body text-ink-muted tabular-nums">
          {percentText(mastery)} of {percentText(benchmark)} benchmark
          {onboarding && ` · Day ${onboarding.day} of ${onboarding.days}`}
        </p>
      </div>
      <MasteryBar
        label="Role mastery"
        value={mastery}
        benchmark={benchmark}
        valueText={`${percentText(mastery)}, benchmark ${percentText(benchmark)}`}
      />
    </header>
  )
}
