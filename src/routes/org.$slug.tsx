import { createFileRoute, redirect } from '@tanstack/react-router'

export const Route = createFileRoute('/org/$slug')({
  beforeLoad: ({ context, location }) => {
    if (!context.user || context.user.isAnonymous) throw redirect({ to: '/sign-in', search: { redirect: location.href } })
  },
})
