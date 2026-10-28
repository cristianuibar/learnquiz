import { useState } from 'react'
import { Link, createFileRoute, redirect } from '@tanstack/react-router'
import { useServerFn } from '@tanstack/react-start'
import { Check, X } from 'lucide-react'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Working } from '@/components/working'
import { generateConceptItems, getConceptItems, getTopicPath } from '@/server/curriculum'

type Item = Awaited<ReturnType<typeof generateConceptItems>>['items'][number]

export const Route = createFileRoute('/t/$topicId/path')({
  beforeLoad: ({ context }) => {
    if (!context.user) throw redirect({ to: '/' })
  },
  loader: ({ params }) => getTopicPath({ data: { topicId: params.topicId } }),
  errorComponent: ({ error }) => (
    <main className="mx-auto w-full max-w-xl px-4 pt-8">
      <p role="alert" className="font-medium text-wrong">
        {error instanceof Error ? error.message : 'Something went wrong'}
      </p>
      <Button asChild variant="outline" className="mt-6 h-11 px-6">
        <Link to="/start">Start over</Link>
      </Button>
    </main>
  ),
  component: Path,
})

function Path() {
  const { topic, units } = Route.useLoaderData()
  return (
    <main className="mx-auto w-full max-w-2xl px-4 pt-8 pb-16">
      <h1 className="text-3xl font-bold tracking-tight">{topic.title}</h1>
      {topic.goal && <p className="mt-2 text-muted-foreground">{topic.goal}</p>}
      <ol className="mt-10">
        {units.map((unit) => (
          <li key={unit.id} className="relative flex gap-4 pb-10 last:pb-0">
            <span
              aria-hidden
              className="absolute top-10 bottom-0 left-5 -ml-px w-0.5 bg-border last:hidden"
            />
            <span className="z-10 flex size-10 shrink-0 items-center justify-center rounded-full bg-learning font-semibold text-white">
              {unit.order}
            </span>
            <div className="min-w-0 flex-1">
              <h2 className="text-xl font-semibold">{unit.name}</h2>
              <p className="mt-1 text-muted-foreground">{unit.summary}</p>
              <ul className="mt-4 flex flex-col gap-3">
                {unit.concepts.map((concept) => (
                  <Concept key={concept.id} concept={concept} />
                ))}
              </ul>
            </div>
          </li>
        ))}
      </ol>
    </main>
  )
}

function Concept({
  concept,
}: {
  concept: ReturnType<typeof Route.useLoaderData>['units'][number]['concepts'][number]
}) {
  const generate = useServerFn(generateConceptItems)
  const load = useServerFn(getConceptItems)
  const [items, setItems] = useState<Item[]>([])
  const [count, setCount] = useState(concept.itemCount)
  const [working, setWorking] = useState(false)
  const [error, setError] = useState('')

  async function run(fn: typeof generate) {
    setWorking(true)
    setError('')
    try {
      const result = (await fn({ data: { conceptId: concept.id } })).items
      setItems(result)
      setCount(result.length)
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Something went wrong')
    }
    setWorking(false)
  }

  return (
    <li className="rounded-lg border p-4">
      <div className="flex flex-wrap items-center gap-2">
        <h3 className="font-medium">{concept.name}</h3>
        {concept.grounded && <Badge variant="outline">From your material</Badge>}
        <span className="text-sm text-muted-foreground">{count} questions</span>
      </div>
      <p className="mt-1 text-sm text-muted-foreground">{concept.summary}</p>
      {working ? (
        <div className="mt-4">
          <Working label="Writing questions" />
        </div>
      ) : count > 0 ? (
        items.length === 0 && (
          <Button variant="outline" className="mt-4 h-11 px-6" onClick={() => run(load)}>
            Show questions
          </Button>
        )
      ) : (
        <Button variant="outline" className="mt-4 h-11 px-6" onClick={() => run(generate)}>
          Generate questions
        </Button>
      )}
      {error && (
        <p role="alert" className="mt-3 text-sm font-medium text-wrong">
          {error}
        </p>
      )}
      {items.length > 0 && (
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
