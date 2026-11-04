import { createFileRoute } from '@tanstack/react-router'
import { RouteError } from '@/components/inline-error'
import { QuestionReview } from '@/components/portal/questions/question-review'
import { validateReviewSearch } from '@/components/portal/questions/review-toolbar'
import { getQuestionReview } from '@/server/question-review'

export const Route = createFileRoute('/admin_/companies/$slug/portal/questions')({
  validateSearch: validateReviewSearch,
  loaderDeps: ({ search }) => ({ roleId: search.role }),
  loader: ({ params, deps }) => getQuestionReview({ data: { slug: params.slug, roleId: deps.roleId } }),
  errorComponent: RouteError,
  component: Questions,
})

function Questions() {
  const data = Route.useLoaderData()
  const { slug } = Route.useParams()
  const search = Route.useSearch()
  return <QuestionReview data={data} slug={slug} search={search} readOnly />
}
