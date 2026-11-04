import { createFileRoute } from '@tanstack/react-router'
import { RouteError } from '@/components/inline-error'
import { SettingsForm } from '@/components/portal/settings'
import { getCompanySettings } from '@/server/org-settings'

export const Route = createFileRoute('/admin_/companies/$slug/portal/settings')({
  loader: ({ params }) => getCompanySettings({ data: { slug: params.slug } }),
  errorComponent: RouteError,
  component: Settings,
})

function Settings() {
  return <SettingsForm settings={Route.useLoaderData()} readOnly />
}
