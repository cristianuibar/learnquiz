import { createFileRoute, useRouter } from '@tanstack/react-router'
import { useEffect } from 'react'
import { RouteError } from '@/components/inline-error'
import { Overview, OverviewLoading } from '@/components/portal/overview'
import { getOrgOverview } from '@/server/org'

export const Route = createFileRoute('/admin_/companies/$slug/portal/')({
  loader: ({ params }) => getOrgOverview({ data: { slug: params.slug } }),
  errorComponent: RouteError,
  pendingComponent: OverviewLoading,
  component: OverviewRoute,
})

function OverviewRoute() {
  const data = Route.useLoaderData()
  const router = useRouter()
  const preparing = data.roles.some((r) => r.preparing)
  useEffect(() => {
    if (!preparing) return
    const id = setInterval(() => void router.invalidate(), 5000)
    return () => clearInterval(id)
  }, [preparing, router])
  return <Overview data={data} readOnly />
}
