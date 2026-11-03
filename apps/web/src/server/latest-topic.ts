import { createServerFn } from '@tanstack/react-start'
import { and, desc, eq } from 'drizzle-orm'
import { getDb } from '@/db'
import { topics } from '@/db/schema'
import { getLearnerId } from '@/server/session'

// Target of the bottom nav's Path tab; null when signed out or no topic is ready yet.
export const getLatestTopicIdFn = createServerFn({ method: 'GET' }).handler(async (): Promise<string | null> => {
  const learnerId = await getLearnerId()
  if (!learnerId) return null
  const [row] = await getDb()
    .select({ id: topics.id })
    .from(topics)
    .where(and(eq(topics.learnerId, learnerId), eq(topics.status, 'ready')))
    .orderBy(desc(topics.createdAt))
    .limit(1)
  return row?.id ?? null
})
