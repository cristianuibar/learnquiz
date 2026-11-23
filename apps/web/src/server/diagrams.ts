import { createServerFn, createServerOnlyFn } from '@tanstack/react-start'
import { and, eq } from 'drizzle-orm'
import { z } from 'zod'
import { getDb, type Db } from '@/db'
import { concepts, topics } from '@/db/schema'
import { getEnv } from '@/server/env'
import { httpError } from '@/server/helpers'
import { getLearnerId, requireLearnerId } from '@/server/session'
import { learnerCanAccess } from '@/server/topic-access'

export type DiagramResult =
  | { status: 'ready'; image: { src: string; alt: string } }
  | { status: 'disabled' | 'unavailable' }

// One access rule for every diagram: the learner's own topic, or the shared topic of their assigned role.
async function accessibleConcept(db: Db, learnerId: string, conceptId: string) {
  const [row] = await db.select({ concept: concepts })
    .from(concepts).innerJoin(topics, eq(topics.id, concepts.topicId))
    .where(and(eq(concepts.id, conceptId), learnerCanAccess(db, learnerId)))
  return row
}

// Returns a stored diagram only. No image model has an official path (owner decision, 21 Nov 2026), so nothing is generated;
// the POST route keeps its name and shape for existing clients.
export const generateConceptDiagram = createServerFn({ method: 'POST' })
  .validator(z.object({ conceptId: z.string().min(1) }))
  .handler(async ({ data }): Promise<DiagramResult> => {
    const learnerId = await requireLearnerId()
    const row = await accessibleConcept(getDb(), learnerId, data.conceptId)
    if (!row) throw httpError('Concept not found', 404)
    const { concept } = row
    if (concept.imageKey) {
      return { status: 'ready', image: { src: `/media/concepts/${encodeURIComponent(concept.id)}`, alt: concept.imageAlt ?? `${concept.name}: ${concept.summary}` } }
    }
    return { status: concept.visual ? 'unavailable' : 'disabled' }
  })

// GET only serves stored media; viewing a URL cannot trigger a paid generation.
export const serveConceptDiagram = createServerOnlyFn(async (conceptId: string): Promise<Response> => {
  const learnerId = await getLearnerId()
  if (!learnerId) return new Response('Sign in first', { status: 401 })
  const row = await accessibleConcept(getDb(), learnerId, conceptId)
  if (!row?.concept.imageKey) return new Response('Diagram not found', { status: 404 })
  const object = await getEnv().MEDIA.get(row.concept.imageKey)
  if (!object) return new Response('Diagram not found', { status: 404 })
  return new Response(object.body, { headers: {
    'content-type': 'image/png',
    'cache-control': 'private, max-age=86400',
    'x-content-type-options': 'nosniff',
  } })
})
