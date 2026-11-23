import type { Today } from '@learnquiz/api'
import { createServerFn } from '@tanstack/react-start'
import { and, countDistinct, desc, eq, gt, gte, inArray, isNull, min, ne, sql } from 'drizzle-orm'
import { getDb } from '@/db'
import { onboardingDay } from '@/lib/learning/profile'
import { shouldStop } from '@/lib/learning/placement'
import { streakShown } from '@/lib/learning/session'
import { attempts, concepts, items, learnerItem, learnerTopic, placements, sessions, topics, units } from '@/db/schema'
import { conceptQueuePaused } from '@/server/concept-gen'
import { dueCount, gradesShortAnswers } from '@/server/due'
import { loadPKnown } from '@/server/helpers'
import { liveConcept } from '@/server/live-concept'
import { basicsUnits } from '@/server/mastery'
import { loadFrontier, SESSION_SIZE } from '@/server/play'
import { getLearnerId } from '@/server/session'
import { assignedRoleTopic, notFlaggedBy, rolePlayable } from '@/server/topic-access'

const DAY = 86_400_000

// The home screen. An employee's Today is their role topic (or "preparing" until the curriculum is ready);
// the personal edition shows the newest ready personal topic.
export const getToday = createServerFn({ method: 'GET' }).handler(async (): Promise<Today> => {
  const learnerId = await getLearnerId()
  if (!learnerId) return { topic: null, role: null, plan: null }
  const db = getDb()
  const now = Date.now()
  const dayStart = Math.floor(now / DAY) * DAY // UTC day, as streakAfter
  const assigned = await assignedRoleTopic(db, learnerId)
  let topic: { id: string; title: string } | undefined
  let placeable = true
  let role: Today['role'] = null
  if (assigned) {
    const ready = assigned.topic.status === 'ready'
    const failed = assigned.topic.status === 'failed'
    const days = assigned.onboardingDays
    const day = onboardingDay(assigned.assignedAt, now, days)
    role = { name: assigned.roleName, company: assigned.company, topicTitle: assigned.topic.title, preparing: !ready && !failed, mastery: null, benchmark: assigned.benchmark, day, days, building: null, failed }
    if (ready) placeable = await rolePlayable(db, assigned.topic)
    if (ready) topic = { id: assigned.topic.id, title: assigned.topic.title }
  } else {
    topic = await db.select({ id: topics.id, title: topics.title }).from(topics)
      .where(and(eq(topics.learnerId, learnerId), eq(topics.status, 'ready')))
      .orderBy(desc(topics.createdAt)).limit(1).get()
  }
  const hasAttemptOn = async (topicId: string) => Boolean(await db.select({ id: attempts.id }).from(attempts)
    .innerJoin(items, eq(items.id, attempts.itemId))
    .where(and(eq(attempts.learnerId, learnerId), eq(items.topicId, topicId))).limit(1).get())
  // Mastery over every live role concept (unmet count 0) and question generation progress.
  const roleStats = async () => {
    if (!assigned || !role) return
    const [cs, known, hasAttempt] = await Promise.all([
      db.select({ id: concepts.id, gen: concepts.genStatus }).from(concepts).where(and(eq(concepts.topicId, assigned.topic.id), liveConcept())),
      loadPKnown(db, learnerId, assigned.topic.id),
      hasAttemptOn(assigned.topic.id),
    ])
    if (hasAttempt && cs.length) role.mastery = cs.reduce((a, c) => a + (known.get(c.id) ?? 0), 0) / cs.length
    const counted = cs.filter((c) => c.gen !== 'failed')
    // Queued concepts wait while the question queue is paused, so they are not building.
    if (counted.some((c) => c.gen === 'pending' || c.gen === 'generating')) {
      if (conceptQueuePaused()) role.paused = !role.failed
      else role.building = { ready: counted.filter((c) => c.gen === 'ready').length, total: counted.length }
    } else if (counted.length < cs.length) {
      role.failed = true
    }
  }
  if (!topic) {
    await roleStats()
    return { topic: null, role, plan: null }
  }
  const topicId = topic.id
  const withoutShort = !gradesShortAnswers({ jobRoleId: assigned ? assigned.topic.jobRoleId : null })
  const [placement, openPlacement, lt, dueN, frontier, basics, played, done, cleared, next, practised] = await Promise.all([
    db.select({ id: placements.id }).from(placements)
      .where(and(eq(placements.learnerId, learnerId), eq(placements.topicId, topicId))).limit(1).get(),
    db.select({ id: sessions.id }).from(sessions)
      .where(and(eq(sessions.learnerId, learnerId), eq(sessions.topicId, topicId), eq(sessions.kind, 'placement'), isNull(sessions.endedAt))).limit(1).get(),
    db.select({ xp: learnerTopic.xp, streakCount: learnerTopic.streakCount, lastSessionAt: learnerTopic.lastSessionAt }).from(learnerTopic)
      .where(and(eq(learnerTopic.learnerId, learnerId), eq(learnerTopic.topicId, topicId))).get(),
    dueCount(db, learnerId, topicId, now, withoutShort),
    loadFrontier(db, learnerId, topicId),
    basicsUnits(db, learnerId, topicId),
    hasAttemptOn(topicId),
    // Completion earns the quest even for a short queue or adaptive placement.
    // Keep the old 10-answer eligibility for sessions recorded before completion was stored.
    db.select({ kind: sessions.kind, planJson: sessions.planJson,
      answered: sql<number>`(select count(*) from attempts a where a.session_id = sessions.id)`,
    }).from(sessions)
      .where(and(
        eq(sessions.learnerId, learnerId), eq(sessions.topicId, topicId), inArray(sessions.kind, ['session', 'placement']), gte(sessions.endedAt, dayStart),
      )),
    // Items answered today that were already known before today and are now scheduled ahead.
    db.select({ n: countDistinct(attempts.itemId) }).from(attempts)
      .innerJoin(items, eq(items.id, attempts.itemId))
      .innerJoin(learnerItem, and(eq(learnerItem.itemId, attempts.itemId), eq(learnerItem.learnerId, learnerId)))
      .where(and(
        eq(attempts.learnerId, learnerId), eq(items.topicId, topicId), gte(attempts.at, dayStart), gt(learnerItem.due, now),
        sql`exists (select 1 from ${attempts} p where p.learner_id = ${learnerId} and p.item_id = ${attempts.itemId} and p.at < ${dayStart})`,
      )).get(),
    db.select({ at: min(learnerItem.due) }).from(learnerItem)
      .innerJoin(items, eq(items.id, learnerItem.itemId))
      .where(and(eq(learnerItem.learnerId, learnerId), eq(items.topicId, topicId), eq(items.status, 'active'), notFlaggedBy(db, learnerId), gt(learnerItem.due, now),
        withoutShort ? ne(items.format, 'short') : undefined))
      .get(),
    // Practice outside placement sessions: a learner with it keeps their progress view even with a placement left open.
    db.select({ id: attempts.id }).from(attempts)
      .innerJoin(items, eq(items.id, attempts.itemId))
      .where(and(
        eq(attempts.learnerId, learnerId), eq(items.topicId, topicId),
        sql`(${attempts.sessionId} is null or not exists (select 1 from sessions s where s.id = ${attempts.sessionId} and s.kind = 'placement'))`,
      )).limit(1).get(),
    roleStats(),
  ])
  const placed = Boolean(placement)
  const start = !placed && placeable ? 'placement' : 'session'
  const sessionDone = done.some((s) => {
    if (s.answered >= 10) return true
    if (s.answered === 0) return false
    const plan = JSON.parse(s.planJson ?? '{}') as { completed?: boolean; log?: { level: number }[] }
    if (plan.completed !== undefined) return plan.completed
    // Existing adaptive placements have no completion flag; their stopping log is the evidence.
    return s.kind === 'placement' && plan.log !== undefined && shouldStop(plan.log)
  })
  const unitId = basics?.[0] ?? frontier[0]?.concept.unitId
  const [unit, playable] = await Promise.all([
    start === 'placement' || !unitId
      ? null
      : db.select({ name: units.name }).from(units).where(eq(units.id, unitId)).get(),
    (async () => {
      if (start === 'placement' || dueN > 0) return true
      if (!assigned) return frontier.length > 0
      if (!frontier.length) return false
      // As startSession: a role session takes any frontier concept with a stored question it may serve, not only the first four.
      const stored = await db.selectDistinct({ conceptId: items.conceptId }).from(items)
        .where(and(eq(items.topicId, topicId), eq(items.status, 'active'), ne(items.format, 'short'), notFlaggedBy(db, learnerId)))
      const playableConcepts = new Set(stored.map((r) => r.conceptId))
      return frontier.some((f) => playableConcepts.has(f.concept.id))
    })(),
  ])
  return {
    topic: { id: topicId, title: topic.title, placed, placeable, due: dueN, xp: lt?.xp ?? 0, streak: lt ? streakShown(lt, now) : 0,
      // lastSessionAt only moves when streakAfter credits the day.
      streakEarned: (lt?.lastSessionAt ?? -1) >= dayStart },
    role,
    plan: {
      state: sessionDone ? 'done' : start === 'placement' && openPlacement && !practised ? 'first' : basics ? 'basics' : played ? 'normal' : 'first',
      start, nextUnit: unit?.name ?? null, reviewsLeft: Math.min(dueN, 8), reviewsCleared: cleared?.n ?? 0,
      sessionDone, sessionSize: SESSION_SIZE, playable, nextReviewAt: next?.at ?? null,
    },
  }
})
