import { createFileRoute } from '@tanstack/react-router'
import { serveItemImage } from '@/server/item-media'

export const Route = createFileRoute('/media/items/$itemId')({
  server: { handlers: { GET: ({ params }) => serveItemImage(params.itemId) } },
})
