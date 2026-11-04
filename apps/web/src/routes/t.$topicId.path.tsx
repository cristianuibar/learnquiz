import { useEffect, useId, useState } from 'react'
import { createFileRoute, redirect, useLocation, useRouterState } from '@tanstack/react-router'
import { useServerFn } from '@tanstack/react-start'
import { Check, X } from 'lucide-react'
import { ConceptDiagram } from '@/components/concept-diagram'
import { InlineError, RouteError, errorMessage } from '@/components/inline-error'
import { ModelLabel } from '@/components/model-label'
import { ModelTrace } from '@/components/model-trace'
import { PathHeader } from '@/components/path/path-header'
import { UnitRow } from '@/components/path/unit-row'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Working } from '@/components/working'
import { getConceptItems, getTopicPath } from '@/server/curriculum'

type Item = Awaited<ReturnType<typeof getConceptItems>>['items'][number]

export const Route = createFileRoute('/t/$topicId/path')({
  beforeLoad: ({ context }) => {
    if (!context.user) throw redirect({ to: '/' })
  },
  loader: ({ params }) => getTopicPath({ data: { topicId: params.topicId } }),
  errorComponent: RouteError,
  component: Path,
})

function Path() {
  const { topic, units, preparing, company, benchmark, onboarding, mastery, nextUnitId } = Route.useLoaderData()
  const [answeredOpen, setAnsweredOpen] = useState(false)
  const href = useRouterState({ select: (s) => s.resolvedLocation?.href })
  const hash = useLocation({ select: (l) => l.hash })
  // The root focuses the first h1 after each navigation (child effects run first), so focus the unit a tick later.
  useEffect(() => {
    if (!hash.startsWith('unit-')) return
    const id = setTimeout(() => document.getElementById(hash)?.focus())
    return () => clearTimeout(id)
  }, [hash, href])
  return (
    <main className="mx-auto flex w-full max-w-2xl flex-col gap-6 px-4 pt-6 pb-6">
      <PathHeader title={topic.title} mastery={mastery} benchmark={benchmark} onboarding={onboarding} />
      {preparing ? (
        <p role="status" className="rounded-md bg-surface-sunken p-4 text-ink-muted">
          {company ? `Your training at ${company} is being prepared` : 'Your training is being prepared'}
        </p>
      ) : (
        <ol className="flex flex-col gap-2">
          {units.map((unit, index) => (
            <UnitRow key={unit.id} unit={unit} index={index} isNext={unit.id === nextUnitId} benchmark={benchmark} />
          ))}
        </ol>
      )}
      <ModelTrace key={topic.id} scope={{ scope: 'topic', topicId: topic.id }} variant="link" />
      {!preparing && (
        <details onToggle={(event) => setAnsweredOpen(event.currentTarget.open)}>
          <summary className="flex min-h-12 cursor-pointer items-center text-label">Answered questions</summary>
          <div className="flex flex-col gap-6">
            {units.map((unit) => (
              <section key={unit.id} className="flex flex-col gap-3">
                <h2 className="text-title-3">{unit.name}</h2>
                <ul className="flex flex-col gap-3">
                  {unit.concepts.map((concept) => (
                    <Concept key={concept.id} concept={concept} showDiagram={answeredOpen} />
                  ))}
                </ul>
              </section>
            ))}
          </div>
        </details>
      )}
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
  const [open, setOpen] = useState(false)
  const listId = useId()

  async function show() {
    setWorking(true)
    setError('')
    try {
      setItems((await load({ data: { conceptId: concept.id } })).items)
      setOpen(true)
    } catch (err) {
      setError(errorMessage(err))
    }
    setWorking(false)
  }

  return (
    <li className="rounded-lg border p-4">
      <div className="flex flex-wrap items-center gap-2">
        <h3 className="font-medium">{concept.name}</h3>
        {concept.grounded && <Badge variant="neutral">From your material</Badge>}
        {concept.answeredCount > 0 && <span className="text-sm text-ink-muted">{concept.answeredCount} answered</span>}
      </div>
      <p className="mt-1 text-sm text-ink-muted">{concept.summary}</p>
      {showDiagram && concept.visual && <ConceptDiagram conceptId={concept.id} />}
      {working ? (
        <div className="mt-4">
          <Working label="Loading answered questions" />
        </div>
      ) : (
        concept.answeredCount > 0 &&
        !error && (
          <Button
            variant="secondary"
            className="mt-4 px-6"
            aria-expanded={open}
            aria-controls={listId}
            onClick={() => (items === null ? void show() : setOpen(!open))}
          >
            {open ? 'Hide answered questions' : 'Show answered questions'}
          </Button>
        )
      )}
      {error && (
        <div className="mt-3">
          <InlineError message={error} onRetry={() => void show()} />
        </div>
      )}
      <div id={listId} hidden={!open}>
        {items?.length === 0 && (
          <p role="status" className="mt-3 text-sm text-ink-muted">
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
      </div>
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
                  ? 'flex items-start gap-2 rounded-md bg-feedback-correct-tint px-3 py-2 text-sm'
                  : 'flex items-start gap-2 rounded-md bg-feedback-wrong-tint px-3 py-2 text-sm'
              }
            >
              {option.is_correct ? (
                <Check className="mt-0.5 size-4 shrink-0 text-feedback-correct" aria-label="Correct" />
              ) : (
                <X className="mt-0.5 size-4 shrink-0 text-feedback-wrong" aria-label="Wrong" />
              )}
              <span>
                {option.text}
                {option.feedback && <span className="block text-ink-muted">{option.feedback}</span>}
              </span>
            </li>
          ))}
        </ul>
      ) : (
        <p className="rounded-md bg-feedback-correct-tint px-3 py-2 text-sm">
          <Check className="mr-2 inline size-4 text-feedback-correct" aria-label="Correct" />
          {item.format === 'cloze' ? payload.accepted_answers.join(' · ') : payload.model_answer}
        </p>
      )}
      <p className="text-sm">{payload.explanation}</p>
      {payload.source_quote && (
        <blockquote className="border-l-2 border-feedback-learning pl-3 text-sm text-ink-muted">
          {payload.source_quote}
        </blockquote>
      )}
    </li>
  )
}
