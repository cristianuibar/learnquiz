import { Link, createFileRoute } from '@tanstack/react-router'
import { RouteError } from '@/components/inline-error'
import { getOrgOverview } from '@/server/org'

export const Route = createFileRoute('/org/$slug/')({
  loader: ({ params }) => getOrgOverview({ data: { slug: params.slug } }),
  errorComponent: RouteError,
  component: Overview,
})

function Overview() {
  const org = Route.useLoaderData()
  return (
    <main className="mx-auto w-full max-w-3xl px-4 pt-8 pb-16">
      <h1 className="text-3xl font-bold tracking-tight">{org.name}</h1>
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
      <Link
        to="/org/$slug/people"
        params={{ slug: org.slug }}
        className="mt-10 inline-flex h-11 items-center rounded-md font-medium underline outline-none focus-visible:ring-[3px] focus-visible:ring-ring/50"
      >
        People
      </Link>
    </main>
  )
}
