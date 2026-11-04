import { createServerFn } from '@tanstack/react-start'
import { and, asc, desc, eq } from 'drizzle-orm'
import type { Profile } from '@learnquiz/api/progress'
import { z } from 'zod'
import { getDb, type Db } from '@/db'
import { member, user } from '@/db/auth-schema'
import { attempts, concepts, itemFlags, items, jobRoles, learnerConcept, learnerUnit, memberRoleAssignments, placements, sessions, topics, units } from '@/db/schema'
import { conceptStatus, roleMastery, unitState } from '@/lib/learning/path'
import type { ItemPayload } from '@/lib/llm/schemas'
import { benchmarkMet, masterySeries, onboardingDay, WEEK } from '@/lib/learning/profile'
import { requireOrgAdmin } from '@/server/authz'
import { httpError, mean } from '@/server/helpers'
import { liveConcept } from '@/server/live-concept'
import { reasonLabels } from '@/server/question-review'
import { requireLearnerId } from '@/server/session'

const DAY = 86_400_000
// 1970-01-01 was a Thursday, so UTC weeks start 4 days after a multiple of WEEK.
const mondayOf = (at: number) => Math.floor((at - 4 * DAY) / WEEK) * WEEK + 4 * DAY
const id = z.string().min(1).max(100)
// A target always requires a company; the empty input can only read the caller.
const ProfileInput = z.union([z.object({ org: id, learnerId: id }).strict(), z.object({}).strict()])

const requireMember = async (db: Db, orgId: string, learnerId: string) => {
  const target = await db.select({ id: member.id }).from(member)
    .where(and(eq(member.organizationId, orgId), eq(member.userId, learnerId))).get()
  if (!target) throw httpError('Person not found', 404)
}

export type MemberFlag = { id: string; label: string; note: string | null; concept: string; unit: string; stem: string; roleId: string; itemId: string; createdAt: number; resolvedAt: number | null }

// A person's question reports, scoped to this company's role topics.
export const getMemberFlags = createServerFn({ method: 'GET' })
  .validator(z.object({ org: id, learnerId: id }).strict())
  .handler(async ({ data }): Promise<MemberFlag[]> => {
    const { org } = await requireOrgAdmin(data.org)
    const db = getDb()
    await requireMember(db, org.id, data.learnerId)
    const rows = await db.select({ f: itemFlags, payloadJson: items.payloadJson, roleId: topics.jobRoleId, concept: concepts.name, unit: units.name })
      .from(itemFlags)
      .innerJoin(items, eq(items.id, itemFlags.itemId))
      .innerJoin(topics, eq(topics.id, items.topicId))
      .innerJoin(jobRoles, and(eq(jobRoles.id, topics.jobRoleId), eq(jobRoles.orgId, org.id)))
      .innerJoin(concepts, eq(concepts.id, items.conceptId))
      .innerJoin(units, eq(units.id, concepts.unitId))
      .where(eq(itemFlags.userId, data.learnerId))
      .orderBy(desc(itemFlags.createdAt))
    return rows.map((r) => ({
      id: r.f.id, label: reasonLabels[r.f.reason] ?? r.f.reason, note: r.f.note, concept: r.concept, unit: r.unit,
      stem: (JSON.parse(r.payloadJson) as ItemPayload).stem, roleId: r.roleId!, itemId: r.f.itemId, createdAt: r.f.createdAt, resolvedAt: r.f.resolvedAt,
    }))
  })

export const getProfile = createServerFn({ method: 'GET' })
  .validator(ProfileInput)
  .handler(async ({ data }): Promise<Profile> => {
    const db = getDb()
    let learnerId: string
    let orgId: string | undefined
    if ('learnerId' in data) {
      const { org } = await requireOrgAdmin(data.org)
      orgId = org.id
      learnerId = data.learnerId
      await requireMember(db, org.id, learnerId)
    } else {
      learnerId = await requireLearnerId()
    }

    const [person, personalTopic, role] = await Promise.all([
      db.select({ name: user.name }).from(user).where(eq(user.id, learnerId)).get(),
      db.select({ id: topics.id, title: topics.title, createdAt: topics.createdAt }).from(topics)
        .where(and(eq(topics.learnerId, learnerId), eq(topics.status, 'ready')))
        .orderBy(desc(topics.createdAt)).limit(1).get(),
      db.select({ name: jobRoles.name, benchmark: jobRoles.benchmark, onboardingDays: jobRoles.onboardingDays, assignedAt: memberRoleAssignments.assignedAt, proficientAt: memberRoleAssignments.proficientAt, topic: { id: topics.id, title: topics.title, createdAt: topics.createdAt } })
        .from(memberRoleAssignments)
        .innerJoin(member, and(eq(member.userId, memberRoleAssignments.userId), eq(member.organizationId, memberRoleAssignments.orgId)))
        .innerJoin(jobRoles, and(eq(jobRoles.id, memberRoleAssignments.jobRoleId), eq(jobRoles.orgId, memberRoleAssignments.orgId)))
        .leftJoin(topics, and(eq(topics.jobRoleId, jobRoles.id), eq(topics.status, 'ready')))
        .where(and(eq(memberRoleAssignments.userId, learnerId), eq(jobRoles.status, 'active'), orgId ? eq(memberRoleAssignments.orgId, orgId) : undefined))
        .orderBy(desc(memberRoleAssignments.assignedAt)).limit(1).get(),
    ])
    const topic = role?.topic ?? personalTopic
    const benchmark = role?.benchmark ?? 0.85
    const now = Date.now()
    const today = Math.floor(now / DAY) * DAY
    const weekStart = today - 6 * DAY
    const [unitRows, conceptRows, history, sessionRows, placement] = topic ? await Promise.all([
      db.select({ id: units.id, name: units.name, unlockedAt: learnerUnit.unlockedAt }).from(units)
        .leftJoin(learnerUnit, and(eq(learnerUnit.unitId, units.id), eq(learnerUnit.learnerId, learnerId)))
        .where(eq(units.topicId, topic.id)).orderBy(asc(units.order)),
      db.select({ id: concepts.id, unitId: concepts.unitId, name: concepts.name, critical: concepts.critical, pKnown: learnerConcept.pKnown })
        .from(concepts)
        .leftJoin(learnerConcept, and(eq(learnerConcept.conceptId, concepts.id), eq(learnerConcept.learnerId, learnerId)))
        .where(and(eq(concepts.topicId, topic.id), liveConcept())).orderBy(asc(concepts.order)),
      db.select({ id: attempts.id, itemId: attempts.itemId, conceptId: attempts.conceptId, at: attempts.at, correct: attempts.correct, confidence: attempts.confidence, before: attempts.pKnownBefore, after: attempts.pKnownAfter })
        .from(attempts).innerJoin(concepts, eq(concepts.id, attempts.conceptId))
        .where(and(eq(attempts.learnerId, learnerId), eq(concepts.topicId, topic.id))).orderBy(asc(attempts.at), asc(attempts.id)),
      db.select({ endedAt: sessions.endedAt }).from(sessions)
        .where(and(eq(sessions.learnerId, learnerId), eq(sessions.topicId, topic.id))),
      db.select({ id: placements.id }).from(placements)
        .where(and(eq(placements.learnerId, learnerId), eq(placements.topicId, topic.id))).limit(1).get(),
    ]) : [[], [], [], [], undefined]

    // Replay mastery so past days never use today's value for a practiced concept.
    const known = new Map(conceptRows.map((c) => [c.id, c.pKnown ?? 0]))
    const seen = new Set<string>()
    for (const attempt of history) {
      if (!seen.has(attempt.conceptId)) known.set(attempt.conceptId, attempt.before)
      seen.add(attempt.conceptId)
    }
    const knownBefore = new Map(known)
    const startedAt = role?.assignedAt ?? topic?.createdAt ?? now
    // Replay up to role start: proficiency may already be met before any new attempts.
    const knownAtStart = new Map(known)
    for (const attempt of history) {
      if (attempt.at >= startedAt) break
      knownAtStart.set(attempt.conceptId, attempt.after)
    }
    const met = (k: Map<string, number>) => benchmarkMet(conceptRows.map((c) => ({ id: c.id, critical: c.critical, pKnown: k.get(c.id) ?? 0 })), benchmark)
    const critical = new Set(conceptRows.filter((c) => c.critical).map((c) => c.id))
    const proficientAtStart = startedAt <= now && met(knownAtStart)
    let achievedAt = role?.proficientAt ?? (proficientAtStart ? startedAt : null)
    const errors = new Map<string, { id: string; conceptId: string; at: number; correctedAt: number | null }>()
    let cursor = 0
    const days = Array.from({ length: 7 }, (_, day) => {
      const date = weekStart + day * DAY
      let attemptCount = 0
      while (cursor < history.length && history[cursor].at < Math.min(date + DAY, now + 1)) {
        const attempt = history[cursor++]
        known.set(attempt.conceptId, attempt.after)
        if (attempt.at >= date) attemptCount++
        if (attempt.at >= startedAt && achievedAt === null && met(known)) achievedAt = attempt.at
        if (!attempt.correct && attempt.confidence === 'sure' && critical.has(attempt.conceptId)) {
          errors.set(attempt.itemId, { id: attempt.id, conceptId: attempt.conceptId, at: attempt.at, correctedAt: null })
        } else if (attempt.correct) {
          const error = errors.get(attempt.itemId)
          if (error && error.correctedAt === null) error.correctedAt = attempt.at
        }
      }
      // Attempts on retired concepts stay in the history but not in the live curriculum's average.
      const live = conceptRows.map((c) => known.get(c.id) ?? 0)
      return {
        date,
        mastery: mean(live),
        gap: mean(live.map((p) => Math.max(0, benchmark - p))),
        attempts: attemptCount,
        sessions: sessionRows.filter((s) => s.endedAt !== null && s.endedAt >= date && s.endedAt < Math.min(date + DAY, now + 1)).length,
      }
    })
    const gainPerDay = (days[0].gap - days[6].gap) / 6
    const activeDays = days.filter((d) => d.attempts > 0).length
    const estimatedDays = achievedAt === null && activeDays >= 2 && gainPerDay > 0 ? Math.ceil(days[6].gap / gainPerDay) : null

    // Up to six Monday-aligned UTC weeks from the first attempt; the current week is still running.
    const weeksFrom = history.length ? Math.max(mondayOf(history[0].at), mondayOf(now) - 5 * WEEK) : now
    const series = masterySeries(conceptRows.map((c) => c.id), history.map((a) => ({ ...a, pKnownAfter: a.after })), weeksFrom, now, knownBefore)
    const weeks = series.map(({ mastery }, k) => {
      const from = weeksFrom + k * WEEK
      return {
        start: from,
        mastery,
        sessions: sessionRows.filter((s) => s.endedAt !== null && s.endedAt >= from && s.endedAt < from + WEEK && s.endedAt <= now).length,
        partial: from + WEEK > now,
      }
    })
    const practiced = new Set(history.map((a) => a.conceptId))
    const conceptViews = conceptRows.map((c) => {
      const pKnown = c.pKnown ?? 0
      const measured = practiced.has(c.id)
      return { id: c.id, unitId: c.unitId, name: c.name, critical: c.critical, pKnown, measured, status: conceptStatus(measured, pKnown, benchmark) }
    })

    return {
      name: person?.name ?? '',
      topic: topic ? { id: topic.id, title: topic.title } : null,
      role: role?.name ?? null,
      benchmark,
      started: history.length > 0,
      onboarding: role ? { day: onboardingDay(role.assignedAt, now, role.onboardingDays), days: role.onboardingDays } : null,
      mastery: roleMastery(conceptViews.map((c) => ({ conceptId: c.id, pKnown: c.pKnown })), conceptViews.map((c) => c.id)),
      units: unitRows.map((unit) => {
        const unitConcepts = conceptViews.filter((c) => c.unitId === unit.id)
        return {
          id: unit.id,
          name: unit.name,
          mastery: mean(unitConcepts.map((c) => c.pKnown)),
          state: unitState({ concepts: unitConcepts, placed: placement !== undefined, unlocked: unit.unlockedAt !== null, benchmark }),
          concepts: unitConcepts,
        }
      }),
      proficiency: {
        achievedAt,
        days: achievedAt === null ? null : Math.max(0, Math.ceil((achievedAt - startedAt) / DAY)),
        estimatedDays,
        projectedAt: estimatedDays === null ? null : now + estimatedDays * DAY,
      },
      confidentErrors: [...errors.values()].sort((a, b) => b.at - a.at).map((error) => ({ ...error, concept: conceptRows.find((c) => c.id === error.conceptId)!.name })),
      weeks,
      sessionCounts: { total: sessionRows.filter((s) => s.endedAt !== null && s.endedAt <= now).length, week: days.reduce((sum, d) => sum + d.sessions, 0) },
    }
  })
