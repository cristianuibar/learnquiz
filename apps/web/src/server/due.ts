import { and, count, eq, lte, ne } from 'drizzle-orm'
import type { Db } from '@/db'
import { items, learnerItem } from '@/db/schema'
import { hasModel } from '@/lib/llm/client'
import { notFlaggedBy } from '@/server/topic-access'

// Short answers need a grading model: a role topic never grades them, and without a model no topic can,
// so they are left out of sessions, reviews and due counts instead of coming back ungraded.
export const gradesShortAnswers = (topic: { jobRoleId: string | null }): boolean => topic.jobRoleId === null && hasModel('grade')

// Active items on the topic that are due at `at`. Short answers are not counted where they are not played (gradesShortAnswers).
export async function dueCount(db: Db, learnerId: string, topicId: string, at: number, withoutShort: boolean): Promise<number> {
  const row = await db.select({ n: count() }).from(learnerItem)
    .innerJoin(items, eq(items.id, learnerItem.itemId))
    .where(and(eq(learnerItem.learnerId, learnerId), eq(items.topicId, topicId), eq(items.status, 'active'), notFlaggedBy(db, learnerId), lte(learnerItem.due, at),
      withoutShort ? ne(items.format, 'short') : undefined))
    .get()
  return row?.n ?? 0
}
