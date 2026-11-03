import { and, desc, eq, inArray, ne, or, type SQL } from 'drizzle-orm'
import type { Db } from '@/db'
import { member } from '@/db/auth-schema'
import { items, jobRoles, learnerTopic, memberRoleAssignments, topics } from '@/db/schema'

// The active job roles the learner is assigned to as a current company member.
const assignedRoleIds = (db: Db, learnerId: string) =>
  db.select({ id: jobRoles.id })
    .from(memberRoleAssignments)
    .innerJoin(member, and(eq(member.userId, memberRoleAssignments.userId), eq(member.organizationId, memberRoleAssignments.orgId)))
    .innerJoin(jobRoles, and(eq(jobRoles.id, memberRoleAssignments.jobRoleId), eq(jobRoles.orgId, memberRoleAssignments.orgId)))
    .where(and(eq(memberRoleAssignments.userId, learnerId), eq(jobRoles.status, 'active')))

// A topic the learner owns, or the shared topic of the learner's assigned role. Use on every learner read of a topic.
export const learnerCanAccess = (db: Db, learnerId: string): SQL =>
  or(eq(topics.learnerId, learnerId), inArray(topics.jobRoleId, assignedRoleIds(db, learnerId)))!

// The topic of the learner's newest role assignment, whatever its status; null for the personal edition.
export async function assignedRoleTopic(db: Db, learnerId: string) {
  const row = await db.select({ topic: topics, roleName: jobRoles.name })
    .from(memberRoleAssignments)
    .innerJoin(member, and(eq(member.userId, memberRoleAssignments.userId), eq(member.organizationId, memberRoleAssignments.orgId)))
    .innerJoin(jobRoles, and(eq(jobRoles.id, memberRoleAssignments.jobRoleId), eq(jobRoles.orgId, memberRoleAssignments.orgId)))
    .innerJoin(topics, eq(topics.jobRoleId, jobRoles.id))
    .where(and(eq(memberRoleAssignments.userId, learnerId), eq(jobRoles.status, 'active')))
    .orderBy(desc(memberRoleAssignments.assignedAt)).limit(1).get()
  return row ?? null
}

// Role content is shared; the learner's own progress row is created on first access.
export async function seedLearnerTopic(db: Db, learnerId: string, topicId: string) {
  await db.insert(learnerTopic).values({ learnerId, topicId, level: 3, rating: 1500 }).onConflictDoNothing()
}

// A role topic can be played once it is ready and holds a stored question graded without a model (short answers are not).
export async function rolePlayable(db: Db, topic: { id: string; status: string }) {
  if (topic.status !== 'ready') return false
  const row = await db.select({ id: items.id }).from(items)
    .where(and(eq(items.topicId, topic.id), eq(items.status, 'active'), ne(items.format, 'short'))).limit(1).get()
  return Boolean(row)
}
