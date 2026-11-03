import { createFileRoute } from '@tanstack/react-router'
import { RouteError } from '@/components/inline-error'
import { getOrgOverview } from '@/server/org'

export const Route = createFileRoute('/org/$slug/')({
  loader: ({ params }) => getOrgOverview({ data: { slug: params.slug } }),
  errorComponent: RouteError,
  component: Overview,
})

function Overview() {
  const org = Route.useLoaderData()
  const t = org.training
  return (
    <main className="mx-auto w-full max-w-3xl px-4 pt-8 pb-16">
      <h1 className="text-3xl font-bold tracking-tight">{org.name}</h1>
      {org.readOnly && <p className="mt-4 text-muted-foreground">Staff view · Read only</p>}
      <section className="mt-10" aria-labelledby="training-progress">
        <h2 id="training-progress" className="text-xl font-semibold">Training progress</h2>
        <dl className="mt-4 grid grid-cols-1 gap-3 sm:grid-cols-2">
          {[
            ['Employees', t.employees],
            ['Proficient', t.proficientEmployees],
            ['Average days to proficiency', t.daysToProficiency],
            ['Critical-step errors this week', t.criticalErrorsThisWeek],
            ['Documents waiting for review', t.documentsToReview],
          ].map(([label, value]) => (
            <div key={label} className="rounded-lg border p-4">
              <dt className="text-sm text-muted-foreground">{label}</dt>
              <dd className="text-2xl font-semibold">{value ?? '-'}</dd>
            </div>
          ))}
        </dl>
      </section>
      <section className="mt-10">
        <h2 className="text-xl font-semibold">Job roles</h2>
        <ul className="mt-4 flex flex-col gap-2">
          {org.roles.map((r) => (
            <li key={r.id} className="font-medium">
              {r.name}
            </li>
          ))}
        </ul>
      </section>
    </main>
  )
}
