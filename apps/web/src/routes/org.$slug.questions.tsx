import { createFileRoute } from '@tanstack/react-router'
import { RouteError } from '@/components/inline-error'
import { QuestionReview, type ReviewSearch } from '@/components/portal/questions/question-review'
import { getQuestionReview } from '@/server/question-review'

export const Route = createFileRoute('/org/$slug/questions')({
  validateSearch: (search: Record<string, unknown>): ReviewSearch => {
    const on = (v: unknown) => v === true || v === 1 || v === '1' || v === 'true'
    const q = typeof search.q === 'string' ? search.q.trim().slice(0, 200) : ''
    return {
      role: typeof search.role === 'string' ? search.role : undefined,
      item: typeof search.item === 'string' ? search.item : undefined,
      q: q || undefined,
      unreviewed: on(search.unreviewed) ? true : undefined,
      flagged: on(search.flagged) ? true : undefined,
      critical: on(search.critical) ? true : undefined,
      status: search.status === 'live' || search.status === 'retired' || search.status === 'rejected' ? search.status : undefined,
    }
  },
  loaderDeps: ({ search }) => ({ roleId: search.role }),
  loader: ({ params, deps }) => getQuestionReview({ data: { slug: params.slug, roleId: deps.roleId } }),
  errorComponent: RouteError,
  component: Questions,
})

function Questions() {
  const data = Route.useLoaderData()
  const { slug } = Route.useParams()
  const search = Route.useSearch()
  return <QuestionReview data={data} slug={slug} search={search} />
}
