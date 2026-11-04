import { and, eq, inArray, isNotNull, sql } from 'drizzle-orm'
import { getDb } from '@/db'
import { concepts, topics } from '@/db/schema'
import { drainConceptQueue } from '@/server/concept-gen'
import { runInBackground } from '@/server/env'
import { httpError } from '@/server/helpers'
import { liveConcept } from '@/server/live-concept'

// Resets a failed concept to pending and wakes the queue. No orgId means any company topic (staff).
export async function retryFailedConcept(conceptId: string, orgId?: string, wake = true): Promise<void> {
  const db = getDb()
  const scope = db.select({ id: topics.id }).from(topics).where(orgId ? eq(topics.orgId, orgId) : isNotNull(topics.orgId))
  const reset = await db.update(concepts).set({ genStatus: 'pending', genError: null, genStartedAt: null })
    .where(and(eq(concepts.id, conceptId), eq(concepts.genStatus, 'failed'), liveConcept(), inArray(concepts.topicId, scope)))
    .returning({ id: concepts.id })
  if (!reset.length) {
    // A concept of a retired document would only wait in the queue forever.
    const [dead] = await db.select({ id: concepts.id }).from(concepts).where(and(eq(concepts.id, conceptId), sql`not (${liveConcept()})`, inArray(concepts.topicId, scope)))
    throw dead ? httpError('The document behind this concept was retired', 409) : httpError('Failed concept not found', 404)
  }
  if (wake) runInBackground(drainConceptQueue())
}
