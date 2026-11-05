import { and, asc, count, eq, isNotNull, isNull, lt, or } from 'drizzle-orm'
import { getDb, type Db } from '@/db'
import { concepts, items, topics, units } from '@/db/schema'
import { utcDayStart } from '@/lib/limits'
import { generateConceptItems } from '@/server/helpers'
import { liveConcept } from '@/server/live-concept'
import { claimConcept, heartbeatClaim, STALE_CLAIM_MS } from '@/server/claim-heartbeat'
import { assertWithinCompanyCap, COMPANY_CAP_MESSAGE } from '@/server/model-cap'

export const ITEMS_PER_CONCEPT = 6
export { STALE_CLAIM_MS } from '@/server/claim-heartbeat'

const activeItems = async (db: Db, conceptId: string) =>
  (await db.select({ n: count() }).from(items).where(and(eq(items.conceptId, conceptId), eq(items.status, 'active'))))[0]?.n ?? 0

// Generates the shared questions of one company concept. The concept row is the queue message:
// one atomic claim lets overlapping drains and retries skip work another invocation owns.
export async function processConcept(db: Db, conceptId: string): Promise<void> {
  const claimAt = await claimConcept(db, conceptId, 'pending')
  if (claimAt === null) return
  const heartbeat = heartbeatClaim(db, conceptId, claimAt)
  // Stop renewal before settling, and compare against the last heartbeat we wrote.
  const settle = async (set: Partial<typeof concepts.$inferInsert>) => {
    await heartbeat.stop()
    await db.update(concepts).set(set).where(heartbeat.owned())
      .then(() => {}, (e) => console.error('concept status write failed', e))
  }
  try {
    const [row] = await db.select({ concept: concepts, topic: topics }).from(concepts)
      .innerJoin(topics, eq(topics.id, concepts.topicId)).where(eq(concepts.id, conceptId))
    if (!row?.topic.orgId) throw Object.assign(new Error('Concept does not belong to a company topic.'), { status: 404 })
    const { concept, topic } = row
    const have = await activeItems(db, conceptId)
    if (have < ITEMS_PER_CONCEPT) {
      await assertWithinCompanyCap(db, topic.orgId!)
      const existing = await db.select({ payloadJson: items.payloadJson }).from(items)
        .where(and(eq(items.conceptId, conceptId), eq(items.status, 'active'))).limit(3)
      await generateConceptItems(db, concept, topic, {
        targetDifficulty: 3, spread: true, want: ITEMS_PER_CONCEPT - have, maxRounds: 3,
        avoidStems: existing.map((r) => (JSON.parse(r.payloadJson) as { stem: string }).stem),
        learnerId: null, orgId: topic.orgId, heartbeat: heartbeat.renew,
      })
    }
    // A partial set is still ready: its questions are live, and learner sessions top it up.
    if (await activeItems(db, conceptId)) await settle({ genStatus: 'ready', genError: null })
    else await settle({ genStatus: 'failed', genError: 'Could not generate items for this concept' })
  } catch (e) {
    const status = (e as { status?: unknown }).status
    if (status === 429 && (e as Error).message === COMPANY_CAP_MESSAGE) {
      // Deferred to the next UTC day by drainConceptQueue.
      await settle({ genStatus: 'pending', genError: COMPANY_CAP_MESSAGE, genStartedAt: Date.now() })
    } else if (status === 429) {
      // A provider rate limit is transient: the next drain tries again.
      await settle({ genStatus: 'pending', genError: (e as Error).message, genStartedAt: null })
    } else {
      if (typeof status !== 'number') console.error('concept generation failed', e)
      // A concept that already holds live questions stays ready; a failed re-count fails it as before.
      const kept = await activeItems(db, conceptId).catch(() => 0)
      if (kept) await settle({ genStatus: 'ready', genError: null })
      else await settle({ genStatus: 'failed', genError: typeof status === 'number' ? (e as Error).message : 'Question generation failed.' })
    }
  } finally {
    await heartbeat.stop()
  }
}

export async function drainConceptQueue(opts: { limit: number; concurrency: number } = { limit: 8, concurrency: 4 }, db: Db = getDb()): Promise<number> {
  const now = Date.now()
  const due = await db.select({ id: concepts.id }).from(concepts)
    .innerJoin(topics, eq(topics.id, concepts.topicId))
    .innerJoin(units, eq(units.id, concepts.unitId))
    .where(and(
      isNotNull(topics.orgId),
      liveConcept(),
      or(
        and(eq(concepts.genStatus, 'pending'), or(isNull(concepts.genStartedAt), lt(concepts.genStartedAt, utcDayStart(now)))),
        and(eq(concepts.genStatus, 'generating'), lt(concepts.genStartedAt, now - STALE_CLAIM_MS)),
      ),
    ))
    .orderBy(asc(concepts.topicId), asc(units.order), asc(concepts.order))
    .limit(opts.limit)
  const queue = due.map((r) => r.id)
  await Promise.all(Array.from({ length: Math.min(opts.concurrency, queue.length) }, async () => {
    // One concept's failure (a claim write that throws) must not settle the sweep while other workers are mid-call; it stays pending.
    for (let id = queue.shift(); id; id = queue.shift()) await processConcept(db, id).catch((e) => console.error('concept drain failed', id, e))
  }))
  return due.length
}
