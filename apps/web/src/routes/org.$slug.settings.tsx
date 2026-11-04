import { createFileRoute, useRouter } from '@tanstack/react-router'
import { RouteError } from '@/components/inline-error'
import { SettingsForm } from '@/components/portal/settings'
import { getCompanySettings } from '@/server/org-settings'

export const Route = createFileRoute('/org/$slug/settings')({
  loader: ({ params }) => getCompanySettings({ data: { slug: params.slug } }),
  errorComponent: RouteError,
  component: Settings,
})

function Settings() {
  const router = useRouter()
  return <SettingsForm settings={Route.useLoaderData()} onSaved={() => router.invalidate()} />
}
