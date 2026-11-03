import { useState } from 'react'
import { createFileRoute, redirect } from '@tanstack/react-router'
import { useServerFn } from '@tanstack/react-start'
import { Check, X } from 'lucide-react'
import { ConceptDiagram } from '@/components/concept-diagram'
import { InlineError, RouteError, errorMessage } from '@/components/inline-error'
import { MasteryBar } from '@/components/mastery-bar'
import { ModelLabel } from '@/components/model-label'
import { ModelTrace } from '@/components/model-trace'
import { StartButton } from '@/components/start-button'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Working } from '@/components/working'
import { cn } from '@/lib/utils'
import { getConceptItems, getTopicPath } from '@/server/curriculum'

type Item = Awaited<ReturnType<typeof getConceptItems>>['items'][number]

const LEVELS = ['novice', 'beginner', 'intermediate', 'advanced', 'fluent']

export const Route = createFileRoute('/t/$topicId/path')({
  beforeLoad: ({ context }) => {
    if (!context.user) throw redirect({ to: '/' })
  },
  loader: ({ params }) => getTopicPath({ data: { topicId: params.topicId } }),
  errorComponent: RouteError,
  component: Path,
})

function Path() {
  const { topic, units, learner } = Route.useLoaderData()
  const [expandedUnits, setExpandedUnits] = useState<Set<string>>(() => new Set())
  return (
    <main className="mx-auto w-full max-w-2xl px-4 pt-8 pb-4">
      <h1 className="text-3xl font-bold tracking-tight">{topic.title}</h1>
      <ModelLabel model={topic.generatedBy} />
      <ModelTrace key={topic.id} scope={{ scope: 'topic', topicId: topic.id }} />
      {learner.placed ? (
        <>
          <p className="mt-2 text-lg font-medium">
            Level {learner.level} of 5 · {LEVELS[learner.level - 1]}
          </p>
          {learner.levelLine && (
            <div>
              <blockquote className="mt-2 border-l-2 border-learning pl-3 text-muted-foreground">{learner.levelLine}</blockquote>
              <ModelLabel model={learner.levelLineModel} />
            </div>
          )}
        </>
      ) : (
        topic.goal && <p className="mt-2 text-muted-foreground">{topic.goal}</p>
      )}
      <ol className="mt-10">
        {units.map((unit) => (
          <li key={unit.id} className="relative flex gap-4 pb-10 last:pb-0">
            <span
              aria-hidden
              className="absolute top-10 bottom-0 left-5 -ml-px w-0.5 bg-border last:hidden"
            />
            <span
              className={cn(
                'z-10 flex size-10 shrink-0 items-center justify-center rounded-full font-semibold',
                unit.unlocked ? 'bg-learning text-white' : 'bg-muted text-muted-foreground',
              )}
            >
              {unit.order + 1}
            </span>
            <div className="min-w-0 flex-1">
              <h2 className={cn('text-xl font-semibold', !unit.unlocked && 'text-muted-foreground')}>{unit.name}</h2>
              <p className="mt-1 text-muted-foreground">{unit.summary}</p>
              <div className="mt-3 flex items-center gap-3">
                <MasteryBar className="flex-1" label={`${unit.name} mastery`} value={unit.unlocked ? unit.mastery : 0} />
                <span className="w-14 text-right text-sm font-medium tabular-nums text-muted-foreground">
                  {unit.unlocked ? `${Math.round(unit.mastery * 100)}%` : 'locked'}
                </span>
              </div>
              <details className="mt-2" onToggle={(event) => {
                const open = event.currentTarget.open
                setExpandedUnits((current) => {
                  const next = new Set(current)
                  if (open) next.add(unit.id)
                  else next.delete(unit.id)
                  return next
                })
              }}>
                <summary className="flex min-h-12 cursor-pointer items-center text-sm font-medium">
                  {unit.concepts.length} concepts
                </summary>
                <ul className="mt-2 flex flex-col gap-3">
                  {unit.concepts.map((concept) => (
                    <Concept key={concept.id} concept={concept} showDiagram={expandedUnits.has(unit.id)} />
                  ))}
                </ul>
              </details>
            </div>
          </li>
        ))}
      </ol>
      <div className="sticky bottom-[calc(3.5rem+env(safe-area-inset-bottom))] z-20 -mx-4 mt-8 border-t bg-background px-4 py-4">
        <StartButton topicId={topic.id} placement={!learner.placed}>
          {learner.placed ? 'Start session' : 'Find my level'}
        </StartButton>
      </div>
    </main>
  )
}

function Concept({
  concept,
  showDiagram,
}: {
  concept: ReturnType<typeof Route.useLoaderData>['units'][number]['concepts'][number]
  showDiagram: boolean
}) {
  const load = useServerFn(getConceptItems)
  const [items, setItems] = useState<Item[] | null>(null)
  const [working, setWorking] = useState(false)
  const [error, setError] = useState('')

  async function show() {
    setWorking(true)
    setError('')
    try {
      setItems((await load({ data: { conceptId: concept.id } })).items)
    } catch (err) {
      setError(errorMessage(err))
    }
    setWorking(false)
  }

  return (
    <li className="rounded-lg border p-4">
      <div className="flex flex-wrap items-center gap-2">
        <h3 className="font-medium">{concept.name}</h3>
        {concept.grounded && <Badge variant="outline">From your material</Badge>}
        {concept.itemCount > 0 && <span className="text-sm text-muted-foreground">{concept.itemCount} questions</span>}
      </div>
      <p className="mt-1 text-sm text-muted-foreground">{concept.summary}</p>
      {showDiagram && concept.visual && <ConceptDiagram conceptId={concept.id} />}
      {working ? (
        <div className="mt-4">
          <Working label="Loading answered questions" />
        </div>
      ) : (
        concept.itemCount > 0 &&
        items === null &&
        !error && (
          <Button variant="outline" className="mt-4 h-12 px-6" onClick={show}>
            Show answered questions
          </Button>
        )
      )}
      {error && (
        <div className="mt-3">
          <InlineError message={error} onRetry={() => void show()} />
        </div>
      )}
      {items?.length === 0 && (
        <p role="status" className="mt-3 text-sm text-muted-foreground">
          No answered questions to review yet.
        </p>
      )}
      {items && items.length > 0 && (
        <ol className="mt-4 flex flex-col gap-4 border-t pt-4">
          {items.map((item) => (
            <ItemView key={item.id} item={item} />
          ))}
        </ol>
      )}
    </li>
  )
}

function ItemView({ item }: { item: Item }) {
  const { payload } = item
  return (
    <li className="flex flex-col gap-3">
      <p className="font-medium">{payload.stem}</p>
      <ModelLabel model={item.generatedBy} />
      {item.format === 'mcq' ? (
        <ul className="flex flex-col gap-2">
          {payload.options.map((option) => (
            <li
              key={option.id}
              className={
                option.is_correct
                  ? 'flex items-start gap-2 rounded-md bg-correct-soft px-3 py-2 text-sm'
                  : 'flex items-start gap-2 rounded-md bg-wrong-soft px-3 py-2 text-sm'
              }
            >
              {option.is_correct ? (
                <Check className="mt-0.5 size-4 shrink-0 text-correct" aria-label="Correct" />
              ) : (
                <X className="mt-0.5 size-4 shrink-0 text-wrong" aria-label="Wrong" />
              )}
              <span>
                {option.text}
                {option.feedback && <span className="block text-muted-foreground">{option.feedback}</span>}
              </span>
            </li>
          ))}
        </ul>
      ) : (
        <p className="rounded-md bg-correct-soft px-3 py-2 text-sm">
          <Check className="mr-2 inline size-4 text-correct" aria-label="Correct" />
          {item.format === 'cloze' ? payload.accepted_answers.join(' · ') : payload.model_answer}
        </p>
      )}
      <p className="text-sm">{payload.explanation}</p>
      {payload.source_quote && (
        <blockquote className="border-l-2 border-learning pl-3 text-sm text-muted-foreground">
          {payload.source_quote}
        </blockquote>
      )}
    </li>
  )
}
