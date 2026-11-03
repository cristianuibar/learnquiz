import { and, asc, eq, gt, lte, notExists, sql, type SQL } from 'drizzle-orm'
import type { Db } from '@/db'
import { items, learnerItem, pushLog, topics } from '@/db/schema'
import { learnerCanAccess } from '@/server/topic-access'

export type PushItem = { itemId: string; stem: string }
export const MAX_PUSH_STEM = 60
const DAY_MS = 24 * 60 * 60 * 1000

// The earliest-due pushable item matching `dueCond`: active mcq, short stem, accessible topic, no accepted push in 24h.
async function pickWhere(db: Db, userId: string, now: number, dueCond: SQL): Promise<PushItem | null> {
  const stem = sql<string>`json_extract(${items.payloadJson}, '$.stem')`
  const row = await db.select({ itemId: items.id, stem })
    .from(learnerItem)
    .innerJoin(items, eq(items.id, learnerItem.itemId))
    .innerJoin(topics, eq(topics.id, items.topicId))
    .where(and(
      eq(learnerItem.learnerId, userId), dueCond,
      eq(items.status, 'active'), eq(items.format, 'mcq'),
      sql`length(${stem}) <= ${MAX_PUSH_STEM}`,
      learnerCanAccess(db, userId),
      notExists(db.select({ id: pushLog.id }).from(pushLog).where(and(
        eq(pushLog.userId, userId), eq(pushLog.itemId, items.id), eq(pushLog.outcome, 'accepted'), gt(pushLog.createdAt, now - DAY_MS),
      ))),
    ))
    .orderBy(asc(learnerItem.due), asc(items.id)).limit(1).get()
  return row ?? null
}

// The most overdue pushable item, or null.
export const pickPushItem = (db: Db, userId: string, now: number) => pickWhere(db, userId, now, lte(learnerItem.due, now))

// A due item, else the soonest upcoming one.
export async function previewItem(db: Db, userId: string, now: number) {
  return (await pickPushItem(db, userId, now)) ?? pickWhere(db, userId, now, gt(learnerItem.due, now))
}
