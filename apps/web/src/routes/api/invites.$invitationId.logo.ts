import { createFileRoute } from '@tanstack/react-router'
import { serveInviteLogo } from '@/server/org-logo'

export const Route = createFileRoute('/api/invites/$invitationId/logo')({
  server: { handlers: { GET: ({ params }) => serveInviteLogo(params.invitationId) } },
})
