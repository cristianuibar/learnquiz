import { useId, useState } from 'react'
import { useServerFn } from '@tanstack/react-start'
import { Check, X } from 'lucide-react'
import type { TopicPath } from '@learnquiz/api/progress'
import { ConceptDiagram } from '@/components/concept-diagram'
import { InlineError, errorMessage } from '@/components/inline-error'
import { ModelLabel } from '@/components/model-label'
import { Button } from '@/components/ui/button'
import { Working } from '@/components/working'
import { getConceptItems } from '@/server/curriculum'

type Item = Awaited<ReturnType<typeof getConceptItems>>['items'][number]

export function AnsweredQuestions({ concept }: { concept: TopicPath['units'][number]['concepts'][number] }) {
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
    <div>
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
      {open && concept.visual && <ConceptDiagram conceptId={concept.id} />}
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
    </div>
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
