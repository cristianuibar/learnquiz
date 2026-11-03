import { createServerFn } from '@tanstack/react-start'
import { and, asc, desc, eq } from 'drizzle-orm'
import { z } from 'zod'
import { getDb } from '@/db'
import { member } from '@/db/auth-schema'
import { attempts, concepts, jobRoles, learnerConcept, memberRoleAssignments, sessions, topics, units } from '@/db/schema'
import { requireOrgAdmin } from '@/server/authz'
import { httpError, mean } from '@/server/helpers'
import { requireLearnerId } from '@/server/session'

const DAY = 86_400_000
const id = z.string().min(1).max(100)
// A target always requires a company; the empty input can only read the caller.
const ProfileInput = z.union([z.object({ org: id, learnerId: id }).strict(), z.object({}).strict()])

export const getProfile = createServerFn({ method: 'GET' })
  .validator(ProfileInput)
  .handler(async ({ data }) => {
    const db = getDb()
    let learnerId: string
    let orgId: string | undefined
    if ('learnerId' in data) {
      const { org } = await requireOrgAdmin(data.org)
      orgId = org.id
      learnerId = data.learnerId
      const target = await db.select({ id: member.id }).from(member)
        .where(and(eq(member.organizationId, org.id), eq(member.userId, learnerId))).get()
      if (!target) throw httpError('Learner is not a member of this company', 403)
    } else {
      learnerId = await requireLearnerId()
    }

    const [personalTopic, role] = await Promise.all([
      db.select({ id: topics.id, title: topics.title, createdAt: topics.createdAt }).from(topics)
        .where(and(eq(topics.learnerId, learnerId), eq(topics.status, 'ready')))
        .orderBy(desc(topics.createdAt)).limit(1).get(),
      db.select({ name: jobRoles.name, benchmark: jobRoles.benchmark, assignedAt: memberRoleAssignments.assignedAt, proficientAt: memberRoleAssignments.proficientAt, topic: { id: topics.id, title: topics.title, createdAt: topics.createdAt } })
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
    const [unitRows, conceptRows, history, sessionRows] = topic ? await Promise.all([
      db.select({ id: units.id, name: units.name }).from(units).where(eq(units.topicId, topic.id)).orderBy(asc(units.order)),
      db.select({ id: concepts.id, unitId: concepts.unitId, name: concepts.name, critical: concepts.critical, pKnown: learnerConcept.pKnown })
        .from(concepts)
        .leftJoin(learnerConcept, and(eq(learnerConcept.conceptId, concepts.id), eq(learnerConcept.learnerId, learnerId)))
        .where(eq(concepts.topicId, topic.id)).orderBy(asc(concepts.order)),
      db.select({ id: attempts.id, itemId: attempts.itemId, conceptId: attempts.conceptId, at: attempts.at, correct: attempts.correct, confidence: attempts.confidence, before: attempts.pKnownBefore, after: attempts.pKnownAfter })
        .from(attempts).innerJoin(concepts, eq(concepts.id, attempts.conceptId))
        .where(and(eq(attempts.learnerId, learnerId), eq(concepts.topicId, topic.id))).orderBy(asc(attempts.at), asc(attempts.id)),
      db.select({ endedAt: sessions.endedAt }).from(sessions)
        .where(and(eq(sessions.learnerId, learnerId), eq(sessions.topicId, topic.id))),
    ]) : [[], [], [], []]

    // Replay mastery so past days never use today's value for a practiced concept.
    const known = new Map(conceptRows.map((c) => [c.id, c.pKnown ?? 0]))
    const seen = new Set<string>()
    for (const attempt of history) {
      if (!seen.has(attempt.conceptId)) known.set(attempt.conceptId, attempt.before)
      seen.add(attempt.conceptId)
    }
    const startedAt = role?.assignedAt ?? topic?.createdAt ?? now
    // Replay up to role start: proficiency may already be met before any new attempts.
    const knownAtStart = new Map(known)
    for (const attempt of history) {
      if (attempt.at >= startedAt) break
      knownAtStart.set(attempt.conceptId, attempt.after)
    }
    const proficientAtStart = startedAt <= now && knownAtStart.size > 0 && [...knownAtStart.values()].every((p) => p >= benchmark)
    let achievedAt = role?.proficientAt ?? (proficientAtStart ? startedAt : null)
    const errors = new Map<string, { id: string; conceptId: string; at: number; correctedAt: number | null }>()
    let cursor = 0
    const weekly = Array.from({ length: 7 }, (_, day) => {
      const date = weekStart + day * DAY
      let attemptCount = 0
      while (cursor < history.length && history[cursor].at < Math.min(date + DAY, now + 1)) {
        const attempt = history[cursor++]
        known.set(attempt.conceptId, attempt.after)
        if (attempt.at >= date) attemptCount++
        if (attempt.at >= startedAt && achievedAt === null && known.size > 0 && [...known.values()].every((p) => p >= benchmark)) achievedAt = attempt.at
        if (!attempt.correct && attempt.confidence === 'sure') {
          errors.set(attempt.itemId, { id: attempt.id, conceptId: attempt.conceptId, at: attempt.at, correctedAt: null })
        } else if (attempt.correct) {
          const error = errors.get(attempt.itemId)
          if (error && error.correctedAt === null) error.correctedAt = attempt.at
        }
      }
      return {
        date,
        mastery: mean([...known.values()]),
        gap: mean([...known.values()].map((p) => Math.max(0, benchmark - p))),
        attempts: attemptCount,
        sessions: sessionRows.filter((s) => s.endedAt !== null && s.endedAt >= date && s.endedAt < Math.min(date + DAY, now + 1)).length,
      }
    })
    const gainPerDay = (weekly[0].gap - weekly[6].gap) / 6
    const activeDays = weekly.filter((d) => d.attempts > 0).length
    const estimatedDays = achievedAt === null && activeDays >= 2 && gainPerDay > 0 ? Math.ceil(weekly[6].gap / gainPerDay) : null

    return {
      topic: topic ? { id: topic.id, title: topic.title } : null,
      role: role?.name ?? null,
      benchmark,
      units: unitRows.map((unit) => ({ ...unit, concepts: conceptRows.filter((c) => c.unitId === unit.id).map((c) => ({ ...c, pKnown: c.pKnown ?? 0 })) })),
      proficiency: {
        achievedAt,
        days: achievedAt === null ? null : Math.max(0, Math.ceil((achievedAt - startedAt) / DAY)),
        estimatedDays,
        projectedAt: estimatedDays === null ? null : now + estimatedDays * DAY,
      },
      confidentErrors: [...errors.values()].sort((a, b) => b.at - a.at).map((error) => ({ ...error, concept: conceptRows.find((c) => c.id === error.conceptId)!.name })),
      weekly: weekly.map(({ gap: _gap, ...day }) => day),
      sessionCounts: { total: sessionRows.filter((s) => s.endedAt !== null && s.endedAt <= now).length, week: weekly.reduce((sum, d) => sum + d.sessions, 0) },
    }
  })
