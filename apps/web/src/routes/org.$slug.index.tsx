import { createFileRoute, Link } from '@tanstack/react-router'
import { RouteError } from '@/components/inline-error'
import { getOrgOverview } from '@/server/org'
import { Page, PageHeader } from '@/components/admin/page'
import { usePortalLinks } from '@/components/portal/portal-context'

export const Route = createFileRoute('/org/$slug/')({
  loader: ({ params }) => getOrgOverview({ data: { slug: params.slug } }),
  errorComponent: RouteError,
  component: Overview,
})

function Overview() {
  const org = Route.useLoaderData()
  const t = org.training
  const links = usePortalLinks()
  return (
    <Page>
      <PageHeader title={org.name} />
      {org.readOnly && <p className="text-body text-ink-muted">Staff view · Read only</p>}
      <section aria-labelledby="training-progress">
        <h2 id="training-progress" className="text-title-2">Training progress</h2>
        <dl className="mt-4 grid grid-cols-1 gap-3 sm:grid-cols-2">
          {[
            ['Employees', t.employees],
            ['Proficient', t.proficientEmployees],
            ['Average days to proficiency', t.daysToProficiency],
            ['Critical-step errors this week', t.criticalErrorsThisWeek],
            ['Documents waiting for review', t.documentsToReview],
          ].map(([label, value]) => (
            <div key={label} className="rounded-lg border p-4">
              <dt className="text-caption text-ink-muted">{label}</dt>
              <dd className="text-title-2 tabular-nums">{value ?? '-'}</dd>
            </div>
          ))}
        </dl>
      </section>
      <section>
        <h2 className="text-title-2">Job roles</h2>
        {org.roles.length === 0 ? (
          <p className="mt-4 text-body text-ink-muted">
            {org.readOnly ? 'No job roles yet.' : (
              <Link {...links.roles} className="inline-flex min-h-11 items-center text-brand underline outline-none focus-visible:ring-[3px] focus-visible:ring-ring/50">Create your first job role.</Link>
            )}
          </p>
        ) : (
        <ul className="mt-4 flex flex-col gap-2">
          {org.roles.map((r) => (
            <li key={r.id} className="font-medium">
              {r.name}
            </li>
          ))}
        </ul>
        )}
      </section>
    </Page>
  )
}
