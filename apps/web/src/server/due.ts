import { and, count, eq, lte } from 'drizzle-orm'
import type { Db } from '@/db'
import { items, learnerItem } from '@/db/schema'

// Active items on the topic that are due at `at`.
export async function dueCount(db: Db, learnerId: string, topicId: string, at: number): Promise<number> {
  const row = await db.select({ n: count() }).from(learnerItem)
    .innerJoin(items, eq(items.id, learnerItem.itemId))
    .where(and(eq(learnerItem.learnerId, learnerId), eq(items.topicId, topicId), eq(items.status, 'active'), lte(learnerItem.due, at)))
    .get()
  return row?.n ?? 0
}
