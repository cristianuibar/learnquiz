import { createFileRoute, Link, redirect } from '@tanstack/react-router'
import { ChevronLeft } from 'lucide-react'
import { RouteError } from '@/components/inline-error'
import { StartButton } from '@/components/start-button'
import { ConceptRow } from '@/components/unit/concept-row'
import { ProcedureDiagram } from '@/components/unit/procedure-diagram'
import { UnitBar } from '@/components/unit/unit-bar'
import { getTopicPath } from '@/server/curriculum'

export const Route = createFileRoute('/t/$topicId/u/$unitId')({
  beforeLoad: ({ context }) => {
    if (!context.user) throw redirect({ to: '/' })
  },
  loader: ({ params }) => getTopicPath({ data: { topicId: params.topicId } }),
  errorComponent: RouteError,
  component: UnitDetail,
})

const focusRing = 'focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-brand'

function UnitDetail() {
  const { topic, units, preparing, benchmark } = Route.useLoaderData()
  const { unitId } = Route.useParams()
  const unit = preparing ? undefined : units.find((u) => u.id === unitId)
  const header = (
    <header className="flex h-14 shrink-0 items-center gap-2 px-2">
      <Link
        to="/t/$topicId/path"
        params={{ topicId: topic.id }}
        hash={`unit-${unitId}`}
        aria-label="Back to Path"
        className={`inline-flex size-12 shrink-0 items-center justify-center rounded-md text-ink hover:bg-surface-sunken ${focusRing}`}
      >
        <ChevronLeft aria-hidden className="size-6" />
      </Link>
      <h1 tabIndex={-1} className={`min-w-0 truncate text-title-2 ${focusRing}`}>
        {unit?.name ?? 'Not found'}
      </h1>
    </header>
  )
  if (!unit) {
    return (
      <main className="mx-auto w-full max-w-2xl">
        {header}
      </main>
    )
  }
  const concepts = [...unit.concepts].sort((a, b) => a.order - b.order)
  return (
    <main className="mx-auto w-full max-w-2xl">
      {header}
      <div className="flex flex-col gap-6 px-4 pt-2">
        <UnitBar unit={unit} benchmark={benchmark} />
        <section className="flex flex-col gap-3">
          <h2 className="text-title-3">Concepts</h2>
          <ul className="divide-y divide-border rounded-md border border-border bg-surface-card">
            {concepts.map((concept) => (
              <ConceptRow key={concept.id} concept={concept} benchmark={benchmark} />
            ))}
          </ul>
        </section>
        <ProcedureDiagram unitId={unit.id} />
        {unit.source && (
          <p className="text-caption text-ink-muted">
            {unit.source.title} · v{unit.source.version}
          </p>
        )}
        <div className="sticky bottom-0 -mx-4 border-t border-border bg-surface-page px-4 pt-3 pb-[max(0.75rem,env(safe-area-inset-bottom))]">
          <StartButton topicId={topic.id} unitId={unit.id} size="lg" className="wrap-anywhere whitespace-normal py-3 sm:w-full" disabled={!unit.canPractice}>
            Practice {unit.name} · 5 min
          </StartButton>
        </div>
      </div>
    </main>
  )
}
