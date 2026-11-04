import { createFileRoute } from '@tanstack/react-router'
import { handleRoleDocumentPost } from '@/server/role-document-upload'

export const Route = createFileRoute('/api/org/$orgId/roles/$roleId/documents')({
  server: { handlers: { POST: ({ request, params }) => handleRoleDocumentPost(request, params) } },
})
