import { createFileRoute } from '@tanstack/react-router'
import { serveConceptDiagram } from '@/server/diagrams'

export const Route = createFileRoute('/media/concepts/$conceptId')({
  server: { handlers: { GET: ({ params }) => serveConceptDiagram(params.conceptId) } },
})
