import { createServerFn, createServerOnlyFn } from '@tanstack/react-start'
import { and, eq, isNull, lt, or } from 'drizzle-orm'
import { z } from 'zod'
import { getDb, type Db } from '@/db'
import { concepts, topics } from '@/db/schema'
import { generateImage, isImageEnabled } from '@/lib/llm/client'
import { getEnv } from '@/server/env'
import { httpError } from '@/server/helpers'
import { getLearnerId, requireLearnerId } from '@/server/session'
import { learnerCanAccess } from '@/server/topic-access'

export type DiagramResult =
  | { status: 'ready'; image: { src: string; alt: string } }
  | { status: 'pending' | 'disabled' }

// Serving may reach a shared role topic; paid generation stays with topics the learner owns.
async function accessibleConcept(db: Db, learnerId: string, conceptId: string, ownedOnly: boolean) {
  const [row] = await db.select({ concept: concepts, topic: topics.title })
    .from(concepts).innerJoin(topics, eq(topics.id, concepts.topicId))
    .where(and(eq(concepts.id, conceptId), ownedOnly ? eq(topics.learnerId, learnerId) : learnerCanAccess(db, learnerId)))
  return row
}

export const generateConceptDiagram = createServerFn({ method: 'POST' })
  .validator(z.object({ conceptId: z.string().min(1) }))
  .handler(async ({ data }): Promise<DiagramResult> => {
    const learnerId = await requireLearnerId()
    const db = getDb()
    const row = await accessibleConcept(db, learnerId, data.conceptId, true)
    if (!row) throw httpError('Concept not found', 404)
    const { concept } = row
    const ready = (alt: string): DiagramResult => ({ status: 'ready', image: { src: `/media/concepts/${encodeURIComponent(concept.id)}`, alt } })
    if (concept.imageKey) return ready(concept.imageAlt ?? `${concept.name}: ${concept.summary}`)
    const env = getEnv()
    if (!concept.visual || !isImageEnabled()) return { status: 'disabled' }

    const started = Date.now()
    // Atomic D1 claim works across worker instances. A crashed request can be
    // retried after three minutes, longer than the model request timeout.
    const claimed = await db.update(concepts).set({ imageGenerationStartedAt: started })
      .where(and(eq(concepts.id, concept.id), isNull(concepts.imageKey),
        or(isNull(concepts.imageGenerationStartedAt), lt(concepts.imageGenerationStartedAt, started - 180_000))))
      .returning({ id: concepts.id })
    if (!claimed.length) return { status: 'pending' }
    const claim = and(eq(concepts.id, concept.id), eq(concepts.imageGenerationStartedAt, started))
    const key = `concepts/${concept.id}/diagram.png`
    const alt = `${concept.name}: ${concept.summary}`
    try {
      // Recover an upload whose final database write failed without paying again.
      if (!(await env.MEDIA.head(key))) {
        const bytes = await generateImage({
          learnerId,
          topicId: concept.topicId,
          prompt: `Draw a clear educational procedure diagram for ${concept.name} in ${row.topic}.\n${concept.summary}\n${concept.sourceQuote ? `Source material: ${concept.sourceQuote}\n` : ''}Use numbered steps, arrows and short readable labels on a plain background. Follow the supplied procedure accurately; do not invent steps or company policy.`,
        })
        await env.MEDIA.put(key, bytes, { httpMetadata: { contentType: 'image/png' }, onlyIf: { etagDoesNotMatch: '*' } })
      }
      await db.update(concepts).set({ imageKey: key, imageAlt: alt, imageGenerationStartedAt: null }).where(claim)
      return ready(alt)
    } catch (e) {
      await db.update(concepts).set({ imageGenerationStartedAt: null }).where(claim).catch(() => {})
      throw e
    }
  })

// GET only serves stored media; viewing a URL cannot trigger a paid generation.
export const serveConceptDiagram = createServerOnlyFn(async (conceptId: string): Promise<Response> => {
  const learnerId = await getLearnerId()
  if (!learnerId) return new Response('Sign in first', { status: 401 })
  const row = await accessibleConcept(getDb(), learnerId, conceptId, false)
  if (!row?.concept.imageKey) return new Response('Diagram not found', { status: 404 })
  const object = await getEnv().MEDIA.get(row.concept.imageKey)
  if (!object) return new Response('Diagram not found', { status: 404 })
  return new Response(object.body, { headers: {
    'content-type': 'image/png',
    'cache-control': 'private, max-age=86400',
    'x-content-type-options': 'nosniff',
  } })
})
