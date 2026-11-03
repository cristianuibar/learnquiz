import { createServerFn } from '@tanstack/react-start'
import { and, desc, eq } from 'drizzle-orm'
import { getDb } from '@/db'
import { topics } from '@/db/schema'
import { getLearnerId } from '@/server/session'
import { assignedRoleTopic } from '@/server/topic-access'

// Target of the bottom nav's Path tab: the ready role topic for an employee, else the newest ready personal topic; null when signed out or none is ready.
export const getLatestTopicIdFn = createServerFn({ method: 'GET' }).handler(async (): Promise<string | null> => {
  const learnerId = await getLearnerId()
  if (!learnerId) return null
  const db = getDb()
  const role = await assignedRoleTopic(db, learnerId)
  if (role?.topic.status === 'ready') return role.topic.id
  const [row] = await db
    .select({ id: topics.id })
    .from(topics)
    .where(and(eq(topics.learnerId, learnerId), eq(topics.status, 'ready')))
    .orderBy(desc(topics.createdAt))
    .limit(1)
  return row?.id ?? null
})
