import { createServerOnlyFn } from '@tanstack/react-start'
import { and, eq } from 'drizzle-orm'
import { getDb } from '@/db'
import { items, jobRoles, topics } from '@/db/schema'
import type { ItemPayload } from '@/lib/llm/schemas'
import { getEnv } from '@/server/env'
import { checkMembership } from '@/server/authz'
import { getLearnerId } from '@/server/session'
import { learnerCanAccess } from '@/server/topic-access'

const notFound = () => new Response('Image not found', { status: 404 })

// Only the item's own stored image, for its learners or its company's portal admins.
export const serveItemImage = createServerOnlyFn(async (itemId: string): Promise<Response> => {
  const db = getDb()
  const learnerId = await getLearnerId()
  if (!learnerId) return new Response('Sign in first', { status: 401 })
  let [row] = await db.select({ payloadJson: items.payloadJson })
    .from(items).innerJoin(topics, eq(topics.id, items.topicId))
    .where(and(eq(items.id, itemId), learnerCanAccess(db, learnerId)))
  if (!row) {
    const candidate = await db.select({ payloadJson: items.payloadJson, orgId: jobRoles.orgId })
      .from(items).innerJoin(topics, eq(topics.id, items.topicId))
      .innerJoin(jobRoles, eq(jobRoles.id, topics.jobRoleId)).where(eq(items.id, itemId)).get()
    if (candidate) {
      const access = await checkMembership(db, learnerId, candidate.orgId, true).catch((err: { status?: number }) => {
        if (err.status === 403) return null
        throw err
      })
      if (access?.org.id === candidate.orgId) row = candidate
    }
  }
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
