import { and, count, eq, gte } from 'drizzle-orm'
import type { Db } from '@/db'
import { user } from '@/db/auth-schema'
import { modelCalls } from '@/db/schema'
import { ACCOUNT_DAILY_MODEL_CALL_CAP, isOverDailyCap, utcDayStart } from '@/lib/limits'

// Guests (anonymous users) get the low cap; only a user row with isAnonymous false gets the account cap.
// An id with no user row counts as a guest.
export async function isOverLearnerDailyCap(db: Db, learnerId: string): Promise<boolean> {
  const [[row], [account]] = await Promise.all([
    db
      .select({ n: count() })
      .from(modelCalls)
      .where(and(eq(modelCalls.learnerId, learnerId), gte(modelCalls.createdAt, utcDayStart(Date.now())))),
    db.select({ isAnonymous: user.isAnonymous }).from(user).where(eq(user.id, learnerId)).limit(1),
  ])
  return account && account.isAnonymous === false
    ? isOverDailyCap(row?.n ?? 0, ACCOUNT_DAILY_MODEL_CALL_CAP)
    : isOverDailyCap(row?.n ?? 0)
}

// Throws 429 before any model call or stored write once the learner hits the daily cap.
// The cap check in chatJson is the backstop; handlers call this first so a capped
// request writes no topic or source row either.
export async function assertWithinDailyCap(db: Db, learnerId: string): Promise<void> {
  if (await isOverLearnerDailyCap(db, learnerId)) {
    throw Object.assign(new Error('You have reached the daily limit for generating new content. Try again tomorrow.'), { status: 429 })
  }
}
