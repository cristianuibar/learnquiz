import { and, asc, count, eq, isNotNull, isNull, lt, or } from 'drizzle-orm'
import { getDb, type Db } from '@/db'
import { concepts, items, topics, units } from '@/db/schema'
import { utcDayStart } from '@/lib/limits'
import { generateConceptItems } from '@/server/helpers'
import { assertWithinCompanyCap, COMPANY_CAP_MESSAGE } from '@/server/model-cap'

export const ITEMS_PER_CONCEPT = 6
// A claim older than this belongs to a worker that died (waitUntil lasts about 30 s).
export const STALE_CLAIM_MS = 10 * 60 * 1000

const activeItems = async (db: Db, conceptId: string) =>
  (await db.select({ n: count() }).from(items).where(and(eq(items.conceptId, conceptId), eq(items.status, 'active'))))[0]?.n ?? 0

// Generates the shared questions of one company concept. The concept row is the queue message:
// one atomic claim lets overlapping drains and retries skip work another invocation owns.
export async function processConcept(db: Db, conceptId: string): Promise<void> {
  const now = Date.now()
  const claimed = await db.update(concepts).set({ genStatus: 'generating', genStartedAt: now })
    .where(and(
      eq(concepts.id, conceptId),
      or(eq(concepts.genStatus, 'pending'), and(eq(concepts.genStatus, 'generating'), lt(concepts.genStartedAt, now - STALE_CLAIM_MS))),
    ))
    .returning({ id: concepts.id })
  if (!claimed.length) return
  // A status write must not mask the original handling.
  const settle = (set: Partial<typeof concepts.$inferInsert>) =>
    db.update(concepts).set(set).where(eq(concepts.id, conceptId)).then(() => {}, (e) => console.error('concept status write failed', e))
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
        learnerId: null, orgId: topic.orgId,
      })
    }
    const total = await activeItems(db, conceptId)
    if (total >= ITEMS_PER_CONCEPT) await settle({ genStatus: 'ready', genError: null })
    else await settle({ genStatus: 'failed', genError: `Only ${total} of ${ITEMS_PER_CONCEPT} questions passed the self-check.` })
  } catch (e) {
    const status = (e as { status?: unknown }).status
    if (status === 429 && (e as Error).message === COMPANY_CAP_MESSAGE) {
      // Deferred to the next UTC day by drainConceptQueue.
      await settle({ genStatus: 'pending', genError: COMPANY_CAP_MESSAGE, genStartedAt: Date.now() })
    } else if (status === 429) {
      // A provider rate limit is transient: the next drain tries again.
      await settle({ genStatus: 'pending', genError: (e as Error).message, genStartedAt: null })
    } else if (typeof status === 'number') {
      await settle({ genStatus: 'failed', genError: (e as Error).message })
    } else {
      console.error('concept generation failed', e)
      await settle({ genStatus: 'failed', genError: 'Question generation failed.' })
    }
  }
}

export async function drainConceptQueue(opts: { limit: number; concurrency: number } = { limit: 8, concurrency: 4 }, db: Db = getDb()): Promise<number> {
  const now = Date.now()
  const due = await db.select({ id: concepts.id }).from(concepts)
    .innerJoin(topics, eq(topics.id, concepts.topicId))
    .innerJoin(units, eq(units.id, concepts.unitId))
    .where(and(
      isNotNull(topics.orgId),
      or(
        and(eq(concepts.genStatus, 'pending'), or(isNull(concepts.genStartedAt), lt(concepts.genStartedAt, utcDayStart(now)))),
        and(eq(concepts.genStatus, 'generating'), lt(concepts.genStartedAt, now - STALE_CLAIM_MS)),
      ),
    ))
    .orderBy(asc(concepts.topicId), asc(units.order), asc(concepts.order))
    .limit(opts.limit)
  const queue = due.map((r) => r.id)
  await Promise.all(Array.from({ length: Math.min(opts.concurrency, queue.length) }, async () => {
    for (let id = queue.shift(); id; id = queue.shift()) await processConcept(db, id)
  }))
  return due.length
}
