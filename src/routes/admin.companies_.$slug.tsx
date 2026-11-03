import { Link, createFileRoute } from '@tanstack/react-router'
import { RouteError } from '@/components/inline-error'
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
      <h1 className="text-3xl font-bold tracking-tight">{company.name}</h1>
      <Link to="/org/$slug" params={{ slug: company.slug }} className="mt-4 inline-flex min-h-11 items-center rounded-md underline focus-visible:ring-[3px] focus-visible:ring-ring/50">View company portal (read only)</Link>
      <p className="mt-4">{company.activeLearners} active learners in the last 30 days · ${company.modelSpend.toFixed(4)} USD lifetime model spend</p>
      <p className="mt-2 text-sm text-muted-foreground">Documents belong to the company's roles. Activity and spend are attributed to current members.</p>
      <section className="mt-8">
        <h2 className="text-xl font-semibold">Members ({company.members.length})</h2>
        {company.members.length === 0 && <p className="mt-4">No members.</p>}
        <ul className="mt-4 flex flex-col gap-3">
          {company.members.map((member) => <li key={member.id} className="rounded-lg border p-4"><p className="font-medium">{member.name} <span className="font-normal text-muted-foreground">{member.email}</span></p><p className="text-sm">{[member.role, member.jobRole].filter(Boolean).join(' · ')}</p></li>)}
        </ul>
      </section>
      <section className="mt-8">
        <h2 className="text-xl font-semibold">Job roles ({company.roles.length})</h2>
        {company.roles.length === 0 && <p className="mt-4">No job roles.</p>}
        <ul className="mt-4 flex flex-col gap-3">
          {company.roles.map((role) => <li key={role.id} className="rounded-lg border p-4"><p className="font-medium">{role.name}</p><p className="text-sm">{role.status} · {Math.round(role.benchmark * 100)}% mastery in {role.onboardingDays} days</p></li>)}
        </ul>
      </section>
      <section className="mt-8">
        <h2 className="text-xl font-semibold">Role documents ({company.documents.length})</h2>
        {company.documents.length === 0 && <p className="mt-4">No documents.</p>}
        <ul className="mt-4 flex flex-col gap-3">
          {company.documents.map((document) => <li key={document.id} className="rounded-lg border p-4"><p className="font-medium">{document.title}</p><p className="text-sm">{document.kind} · {document.role}</p></li>)}
        </ul>
      </section>
    </main>
  )
}
