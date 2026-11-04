import { percentText, type TopicPath } from '@learnquiz/api/progress'
import { MasteryBar } from '@/components/mastery-bar'
import { ConceptChips, statusWord } from './concept-chips'
import { AnsweredQuestions } from './answered-questions'

export function ConceptRow({ concept, benchmark }: { concept: TopicPath['units'][number]['concepts'][number]; benchmark: number }) {
  const { status } = concept
  return (
    <li className="flex flex-col gap-2 px-4 py-3">
      <div className="flex items-baseline justify-between gap-2">
        <h3 className="text-label-lg">{concept.name}</h3>
        <span className="text-label tabular-nums">{percentText(concept.pKnown)}</span>
      </div>
      <MasteryBar
        label={`${concept.name} mastery`}
        value={concept.pKnown}
        benchmark={benchmark}
        valueText={`${percentText(concept.pKnown)}, ${statusWord[status]}${concept.critical ? ', critical' : ''}, benchmark ${percentText(benchmark)}`}
      />
      <ConceptChips status={status} critical={concept.critical} />
      {concept.answeredCount > 0 && <AnsweredQuestions concept={concept} />}
    </li>
  )
}
