import { and, count, eq, gte, sql } from 'drizzle-orm'
import type { Db } from '@/db'
import { user } from '@/db/auth-schema'
import { modelCalls, topics } from '@/db/schema'
import { ACCOUNT_DAILY_MODEL_CALL_CAP, COMPANY_DAILY_MODEL_CALL_CAP, GUEST_DAILY_MODEL_CALL_CAP, isOverDailyCap, utcDayStart } from '@/lib/limits'

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
  if (await isOverLearnerDailyCap(db, learnerId)) throw dailyCapError()
}

export function dailyCapError() {
  return Object.assign(new Error('You have reached the daily limit for generating new content. Try again tomorrow.'), { status: 429 })
}

// Claims a model_calls slot in one statement, so concurrent calls cannot all pass a count-then-call check.
// The row is a pending placeholder (ok 0, error 'pending') that the caller completes after the provider replies.
export async function reserveModelCall(
  db: Db,
  row: { id: string; learnerId?: string | null; sessionId?: string | null; topicId?: string | null; purpose: string; model: string; orgId?: string | null },
): Promise<boolean> {
  const now = Date.now()
  const dayStart = utcDayStart(now)
  const learnerId = row.learnerId ?? null
  const orgId = row.orgId ?? null
  const rows = await db.all(sql`
    INSERT INTO model_calls (id, learner_id, session_id, topic_id, purpose, model, latency_ms, prompt_tokens, completion_tokens, reasoning_tokens, cost_usd, ok, error, created_at, org_id)
    SELECT ${row.id}, ${learnerId}, ${row.sessionId ?? null}, ${row.topicId ?? null}, ${row.purpose}, ${row.model}, 0, 0, 0, 0, NULL, 0, 'pending', ${now}, ${orgId}
    WHERE (${learnerId} IS NULL OR (
      SELECT count(*) FROM model_calls WHERE learner_id = ${learnerId} AND created_at >= ${dayStart}
    ) < CASE WHEN (SELECT is_anonymous FROM "user" WHERE id = ${learnerId}) = 0 THEN ${ACCOUNT_DAILY_MODEL_CALL_CAP} ELSE ${GUEST_DAILY_MODEL_CALL_CAP} END)
    AND (${orgId} IS NULL OR (
      SELECT count(*) FROM model_calls INNER JOIN topics ON topics.id = model_calls.topic_id WHERE topics.org_id = ${orgId} AND model_calls.created_at >= ${dayStart}
    ) < ${COMPANY_DAILY_MODEL_CALL_CAP})
    RETURNING id`)
  return rows.length > 0
}

export const COMPANY_CAP_MESSAGE = 'This company has reached the daily limit for generating new content. Try again tomorrow.'

// The cap still counts company calls through their topic.
export async function companyCallsToday(db: Db, orgId: string): Promise<number> {
  const [row] = await db
    .select({ n: count() })
    .from(modelCalls)
    .innerJoin(topics, eq(topics.id, modelCalls.topicId))
    .where(and(eq(topics.orgId, orgId), gte(modelCalls.createdAt, utcDayStart(Date.now()))))
  return row?.n ?? 0
}

export async function assertWithinCompanyCap(db: Db, orgId: string): Promise<void> {
  if (isOverDailyCap(await companyCallsToday(db, orgId), COMPANY_DAILY_MODEL_CALL_CAP)) {
    throw Object.assign(new Error(COMPANY_CAP_MESSAGE), { status: 429 })
  }
}
