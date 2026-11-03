import { createServerOnlyFn } from '@tanstack/react-start'
import { and, eq } from 'drizzle-orm'
import { getDb } from '@/db'
import { items, topics } from '@/db/schema'
import type { ItemPayload } from '@/lib/llm/schemas'
import { getEnv } from '@/server/env'
import { getLearnerId } from '@/server/session'
import { learnerCanAccess } from '@/server/topic-access'

const notFound = () => new Response('Image not found', { status: 404 })

// Only the item's own stored image, for learners who can play its topic.
export const serveItemImage = createServerOnlyFn(async (itemId: string): Promise<Response> => {
  const db = getDb()
  const learnerId = await getLearnerId()
  if (!learnerId) return new Response('Sign in first', { status: 401 })
  const [row] = await db.select({ payloadJson: items.payloadJson })
    .from(items).innerJoin(topics, eq(topics.id, items.topicId))
    .where(and(eq(items.id, itemId), learnerCanAccess(db, learnerId)))
  const image = row && (JSON.parse(row.payloadJson) as ItemPayload).image
  if (!image || !/^[\w.-]+$/.test(image.key) || image.key.includes('..')) return notFound()
  const object = await getEnv().MEDIA.get(`items/${itemId}/${image.key}`)
  const type = object?.httpMetadata?.contentType
  if (!object || !type?.startsWith('image/')) return notFound()
  return new Response(object.body, { headers: {
    'content-type': type,
    'cache-control': 'private, max-age=86400',
    'x-content-type-options': 'nosniff',
    'content-security-policy': "default-src 'none'; style-src 'unsafe-inline'; sandbox",
  } })
})
