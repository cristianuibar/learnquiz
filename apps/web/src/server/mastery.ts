import { and, asc, count, desc, eq, isNotNull, sql } from 'drizzle-orm'
import type { Db } from '@/db'
import { attempts, concepts, learnerUnit, sessions, units } from '@/db/schema'
import { loadPKnown, mean } from '@/server/helpers'

const BASICS_ACCURACY = 0.55
const BASICS_MASTERY = 0.6

export async function unitMastery(db: Db, learnerId: string, topicId: string) {
  const [unitRows, conceptRows, known] = await Promise.all([
    db.select({ id: units.id, name: units.name }).from(units).where(eq(units.topicId, topicId)).orderBy(asc(units.order)),
    db.select({ id: concepts.id, unitId: concepts.unitId }).from(concepts).where(eq(concepts.topicId, topicId)),
    loadPKnown(db, learnerId, topicId),
  ])
  return unitRows.map((u) => ({
    unitId: u.id,
    unitName: u.name,
    mastery: mean(conceptRows.filter((c) => c.unitId === u.id).map((c) => known.get(c.id) ?? 0)),
  }))
}

// Back to basics: the last three ended sessions on the topic each scored under 55 % (correct / answered).
// The weak units are the unlocked ones under 0.6 mastery, earliest first.
export async function basicsUnits(db: Db, learnerId: string, topicId: string): Promise<string[] | null> {
  const recent = await db
    .select({ answered: count(attempts.id), correct: sql<number>`coalesce(sum(${attempts.correct}), 0)` })
    .from(sessions)
    .innerJoin(attempts, eq(attempts.sessionId, sessions.id))
    .where(and(eq(sessions.learnerId, learnerId), eq(sessions.topicId, topicId), eq(sessions.kind, 'session'), isNotNull(sessions.endedAt)))
    .groupBy(sessions.id)
    .orderBy(desc(sessions.endedAt))
    .limit(3)
  if (recent.length < 3 || recent.some((r) => r.correct / r.answered >= BASICS_ACCURACY)) return null
  const [mastery, unlocked] = await Promise.all([
    unitMastery(db, learnerId, topicId),
    db.select({ unitId: learnerUnit.unitId }).from(learnerUnit).where(eq(learnerUnit.learnerId, learnerId)),
  ])
  const open = new Set(unlocked.map((u) => u.unitId))
  const weak = mastery.filter((u) => open.has(u.unitId) && u.mastery < BASICS_MASTERY).map((u) => u.unitId)
  return weak.length ? weak : null
}
