import { Check, Shield } from 'lucide-react'
import { percentText, type ConceptStatus, type TopicPath } from '@learnquiz/api/progress'
import { MasteryBar } from '@/components/mastery-bar'
import { HalfDisc } from '@/components/status-icons'
import { Badge } from '@/components/ui/badge'
import { AnsweredQuestions } from './answered-questions'

const statusWord: Record<ConceptStatus, string> = { mastered: 'Mastered', learning: 'Still learning', not_started: 'Not started' }

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
      <div className="flex flex-wrap items-center gap-2">
        {status === 'mastered' ? (
          <Badge className="min-h-7 border-feedback-correct bg-feedback-correct-tint pl-2 text-feedback-correct">
            <Check aria-hidden />
            Mastered
          </Badge>
        ) : status === 'learning' ? (
          <Badge className="min-h-7 border-feedback-learning bg-feedback-learning-tint pl-2 text-feedback-learning">
            <HalfDisc />
            Still learning
          </Badge>
        ) : (
          <Badge className="min-h-7 border-border bg-surface-sunken pl-2 text-ink-muted">
            <span aria-hidden className="size-3 rounded-full border-2 border-dotted border-current" />
            Not started
          </Badge>
        )}
        {concept.critical && (
          <Badge className="min-h-7 pl-2">
            <Shield aria-hidden />
            Critical
          </Badge>
        )}
      </div>
      {concept.answeredCount > 0 && <AnsweredQuestions concept={concept} />}
    </li>
  )
}
