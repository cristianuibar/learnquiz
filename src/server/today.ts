import { createServerFn } from '@tanstack/react-start'
import { and, count, desc, eq, lte } from 'drizzle-orm'
import { getDb } from '@/db'
import { member } from '@/db/auth-schema'
import { items, jobRoles, learnerItem, learnerTopic, memberRoleAssignments, placements, topics } from '@/db/schema'
import { getLearnerId } from '@/server/session'

export type Today = {
  topic: { id: string; title: string; placed: boolean; due: number; xp: number; streak: number } | null
  role: { name: string; topicTitle: string } | null
}

// The home screen: the newest ready personal topic with what is due, plus a ready role topic (display only).
export const getToday = createServerFn({ method: 'GET' }).handler(async (): Promise<Today> => {
  const learnerId = await getLearnerId()
  if (!learnerId) return { topic: null, role: null }
  const db = getDb()
  const [topic, role] = await Promise.all([
    db.select({ id: topics.id, title: topics.title }).from(topics)
      .where(and(eq(topics.learnerId, learnerId), eq(topics.status, 'ready')))
      .orderBy(desc(topics.createdAt)).limit(1).get(),
    db.select({ name: jobRoles.name, topicTitle: topics.title })
      .from(memberRoleAssignments)
      .innerJoin(member, and(eq(member.userId, memberRoleAssignments.userId), eq(member.organizationId, memberRoleAssignments.orgId)))
      .innerJoin(jobRoles, and(eq(jobRoles.id, memberRoleAssignments.jobRoleId), eq(jobRoles.orgId, memberRoleAssignments.orgId)))
      .innerJoin(topics, and(eq(topics.jobRoleId, jobRoles.id), eq(topics.status, 'ready')))
      .where(and(eq(memberRoleAssignments.userId, learnerId), eq(jobRoles.status, 'active')))
      .orderBy(desc(memberRoleAssignments.assignedAt)).limit(1).get(),
  ])
  if (!topic) return { topic: null, role: role ?? null }
  const [placement, lt, due] = await Promise.all([
    db.select({ id: placements.id }).from(placements)
      .where(and(eq(placements.learnerId, learnerId), eq(placements.topicId, topic.id))).limit(1).get(),
    db.select({ xp: learnerTopic.xp, streak: learnerTopic.streakCount }).from(learnerTopic)
      .where(and(eq(learnerTopic.learnerId, learnerId), eq(learnerTopic.topicId, topic.id))).get(),
    db.select({ n: count() }).from(learnerItem)
      .innerJoin(items, eq(items.id, learnerItem.itemId))
      .where(and(eq(learnerItem.learnerId, learnerId), eq(items.topicId, topic.id), eq(items.status, 'active'), lte(learnerItem.due, Date.now())))
      .get(),
  ])
  return {
    topic: { id: topic.id, title: topic.title, placed: Boolean(placement), due: due?.n ?? 0, xp: lt?.xp ?? 0, streak: lt?.streak ?? 0 },
    role: role ?? null,
  }
})
