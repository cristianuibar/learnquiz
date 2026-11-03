import { createFileRoute } from '@tanstack/react-router'
import { serveCompanyLogo } from '@/server/org-logo'

export const Route = createFileRoute('/api/org/$orgId/logo')({
  server: { handlers: { GET: ({ params }) => serveCompanyLogo(params.orgId) } },
})
