import { Link, createFileRoute } from '@tanstack/react-router'
import { RouteError } from '@/components/inline-error'
import { TRAINING_STATUS } from '@/lib/training-status'
import { plural } from '@/lib/utils'
import { getCompany } from '@/server/admin'

export const Route = createFileRoute('/admin/companies_/$slug')({
  loader: ({ params }) => getCompany({ data: { slug: params.slug } }),
  errorComponent: RouteError,
  component: Company,
})

function Company() {
  const company = Route.useLoaderData()
  return (
    <main>
      <h1 className="text-title-1 text-ink">{company.name}</h1>
      <Link to="/org/$slug" params={{ slug: company.slug }} className="mt-4 inline-flex min-h-11 items-center rounded-md underline focus-visible:ring-[3px] focus-visible:ring-ring/50">View company portal (read only)</Link>
      <p className="mt-4">{plural(company.activeLearners, 'active learner', 'active learners')} in the last 30 days · ${company.modelSpend.toFixed(4)} USD lifetime model spend</p>
      <p className="mt-2 text-caption text-ink-muted">Documents belong to the company's roles. Activity and spend are attributed to current members.</p>
      <section className="mt-8">
        <h2 className="text-title-2">Members ({company.members.length})</h2>
        {company.members.length === 0 && <p className="mt-4">No members yet.</p>}
        <ul className="mt-4 flex flex-col gap-3">
          {company.members.map((member) => <li key={member.id} className="rounded-lg border p-4"><p className="font-medium">{member.name} <span className="font-normal text-ink-muted">{member.email}</span></p><p className="text-body">{[member.role, member.jobRole].filter(Boolean).join(' · ')}</p></li>)}
        </ul>
      </section>
      <section className="mt-8">
        <h2 className="text-title-2">Job roles ({company.roles.length})</h2>
        {company.roles.length === 0 && <p className="mt-4">No job roles yet.</p>}
        <ul className="mt-4 flex flex-col gap-3">
          {company.roles.map((role) => <li key={role.id} className="rounded-lg border p-4"><p className="font-medium">{role.name}</p><p className="text-body">{role.status === 'archived' ? 'Archived · ' : ''}{TRAINING_STATUS[role.topicStatus ?? 'draft']} · {Math.round(role.benchmark * 100)}% mastery in {plural(role.onboardingDays, 'day', 'days')}</p></li>)}
        </ul>
      </section>
      <section className="mt-8">
        <h2 className="text-title-2">Role documents ({company.documents.length})</h2>
        {company.documents.length === 0 && <p className="mt-4">No documents yet.</p>}
        <ul className="mt-4 flex flex-col gap-3">
          {company.documents.map((document) => <li key={document.id} className="rounded-lg border p-4"><p className="font-medium">{document.title}</p><p className="text-body">{document.kind} · {document.role}</p></li>)}
        </ul>
      </section>
    </main>
  )
}
