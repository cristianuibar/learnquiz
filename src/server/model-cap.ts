import { and, count, eq, gte } from 'drizzle-orm'
import type { Db } from '@/db'
import { modelCalls } from '@/db/schema'
import { isOverDailyCap, utcDayStart } from '@/lib/limits'

// Throws 429 before any model call or stored write once the learner hits the daily cap.
// The cap check in chatJson is the backstop; handlers call this first so a capped
// request writes no topic or source row either.
export async function assertWithinDailyCap(db: Db, learnerId: string): Promise<void> {
  const [row] = await db
    .select({ n: count() })
    .from(modelCalls)
    .where(and(eq(modelCalls.learnerId, learnerId), gte(modelCalls.createdAt, utcDayStart(Date.now()))))
  if (isOverDailyCap(row?.n ?? 0)) {
    throw Object.assign(new Error('You have reached the daily limit for generating new content. Try again tomorrow.'), { status: 429 })
  }
}
