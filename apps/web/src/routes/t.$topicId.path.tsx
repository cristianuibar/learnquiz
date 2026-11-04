import { useEffect } from 'react'
import { createFileRoute, redirect, useLocation, useRouterState } from '@tanstack/react-router'
import { RouteError } from '@/components/inline-error'
import { ModelTrace } from '@/components/model-trace'
import { PathHeader } from '@/components/path/path-header'
import { UnitRow } from '@/components/path/unit-row'
import { getTopicPath } from '@/server/curriculum'

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
            <UnitRow key={unit.id} topicId={topic.id} unit={unit} index={index} isNext={unit.id === nextUnitId} benchmark={benchmark} />
          ))}
        </ol>
      )}
      <ModelTrace key={topic.id} scope={{ scope: 'topic', topicId: topic.id }} variant="link" />
    </main>
  )
}
