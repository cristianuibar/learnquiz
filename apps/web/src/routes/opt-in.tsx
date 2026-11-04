import { createFileRoute, redirect } from '@tanstack/react-router'
import { PushOptIn } from '@/components/push-opt-in'
import { getPushSettings } from '@/server/push'

export const Route = createFileRoute('/opt-in')({
  beforeLoad: ({ context }) => {
    if (!context.user) throw redirect({ to: '/sign-in', search: { redirect: '/opt-in' } })
    if (context.user.isAnonymous) throw redirect({ to: '/today' })
  },
  loader: () => getPushSettings(),
  component: OptIn,
})

function OptIn() {
  const settings = Route.useLoaderData()
  return <PushOptIn publicKey={settings.publicKey} endpoints={settings.endpoints} schedule={settings.schedule} />
}
