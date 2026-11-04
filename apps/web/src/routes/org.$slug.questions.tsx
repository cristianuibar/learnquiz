import { createFileRoute } from '@tanstack/react-router'
import { RouteError } from '@/components/inline-error'
import { QuestionReview } from '@/components/portal/questions/question-review'
import { getQuestionReview } from '@/server/question-review'

export const Route = createFileRoute('/org/$slug/questions')({
  validateSearch: (search: Record<string, unknown>): { role?: string; item?: string } => ({
    role: typeof search.role === 'string' ? search.role : undefined,
    item: typeof search.item === 'string' ? search.item : undefined,
  }),
  loaderDeps: ({ search }) => ({ roleId: search.role }),
  loader: ({ params, deps }) => getQuestionReview({ data: { slug: params.slug, roleId: deps.roleId } }),
  errorComponent: RouteError,
  component: Questions,
})

function Questions() {
  const data = Route.useLoaderData()
  const { slug } = Route.useParams()
  const { item } = Route.useSearch()
  return <QuestionReview data={data} slug={slug} item={item} />
}
