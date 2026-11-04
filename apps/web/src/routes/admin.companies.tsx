import { Link, createFileRoute } from '@tanstack/react-router'
import { RouteError } from '@/components/inline-error'
import { getCompanies } from '@/server/admin'

export const Route = createFileRoute('/admin/companies')({
  loader: () => getCompanies(),
  errorComponent: RouteError,
  component: Companies,
})

function Companies() {
  const companies = Route.useLoaderData()
  return (
    <main>
      <h1 className="text-title-1 text-ink">Companies</h1>
      <p className="mt-4 text-body text-ink-muted">Documents belong to the company's roles. Activity and lifetime model spend are attributed to current members. Active learners started a session in the last 30 days.</p>
      {companies.length === 0 && <p className="mt-8">No companies have signed up yet.</p>}
      <ul className="mt-8 flex flex-col gap-4">
        {companies.map((company) => (
          <li key={company.id} className="rounded-lg border p-4">
            <Link to="/admin/companies/$slug" params={{ slug: company.slug }} className="inline-flex min-h-11 items-center rounded-md text-title-3 underline focus-visible:ring-[3px] focus-visible:ring-ring/50">{company.name}</Link>
            <dl className="mt-4 grid grid-cols-2 gap-4 sm:grid-cols-5">
              <div><dt className="text-caption text-ink-muted">Members</dt><dd>{company.members}</dd></div>
              <div><dt className="text-caption text-ink-muted">Job roles</dt><dd>{company.roles}</dd></div>
              <div><dt className="text-caption text-ink-muted">Documents</dt><dd>{company.documents}</dd></div>
              <div><dt className="text-caption text-ink-muted">Active learners</dt><dd>{company.activeLearners}</dd></div>
              <div><dt className="text-caption text-ink-muted">Model spend (USD)</dt><dd>${company.modelSpend.toFixed(4)}</dd></div>
            </dl>
          </li>
        ))}
      </ul>
    </main>
  )
}
