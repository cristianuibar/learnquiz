import { and, desc, eq, inArray, isNull, ne, notInArray, or, type SQL } from 'drizzle-orm'
import type { Db } from '@/db'
import { member, organization } from '@/db/auth-schema'
import { itemFlags, items, jobRoles, learnerTopic, memberRoleAssignments, orgSettings, topics } from '@/db/schema'

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

// Hides an item from the learner while their own flag on it is open; it stays live for everyone else. Use on every learner read of items.
export const notFlaggedBy = (db: Db, learnerId: string): SQL =>
  notInArray(items.id, db.select({ id: itemFlags.itemId }).from(itemFlags).where(and(eq(itemFlags.userId, learnerId), isNull(itemFlags.resolvedAt))))

// The learner's open flag on an item, if any: a learner holds at most one at a time.
export const openFlag = (db: Db, learnerId: string, itemId: string) =>
  db.select({ id: itemFlags.id }).from(itemFlags).where(and(eq(itemFlags.itemId, itemId), eq(itemFlags.userId, learnerId), isNull(itemFlags.resolvedAt))).get()

// The topic of the learner's newest role assignment, whatever its status, with the company's name; null for the personal edition.
export async function assignedRoleTopic(db: Db, learnerId: string) {
  const row = await db.select({ topic: topics, roleName: jobRoles.name, assignedAt: memberRoleAssignments.assignedAt, benchmark: jobRoles.benchmark, onboardingDays: jobRoles.onboardingDays, orgName: organization.name, companyName: orgSettings.companyName })
    .from(memberRoleAssignments)
    .innerJoin(member, and(eq(member.userId, memberRoleAssignments.userId), eq(member.organizationId, memberRoleAssignments.orgId)))
    .innerJoin(jobRoles, and(eq(jobRoles.id, memberRoleAssignments.jobRoleId), eq(jobRoles.orgId, memberRoleAssignments.orgId)))
    .innerJoin(topics, eq(topics.jobRoleId, jobRoles.id))
    .innerJoin(organization, eq(organization.id, jobRoles.orgId))
    .leftJoin(orgSettings, eq(orgSettings.orgId, jobRoles.orgId))
    .where(and(eq(memberRoleAssignments.userId, learnerId), eq(jobRoles.status, 'active')))
    .orderBy(desc(memberRoleAssignments.assignedAt)).limit(1).get()
  if (!row) return null
  const { orgName, companyName, ...rest } = row
  // The company's display name: its settings name when set, else the organization name.
  return { ...rest, company: companyName ?? orgName }
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

// The display name of the company that owns a job role.
export async function roleCompany(db: Db, jobRoleId: string) {
  const row = await db.select({ orgName: organization.name, companyName: orgSettings.companyName })
    .from(jobRoles)
    .innerJoin(organization, eq(organization.id, jobRoles.orgId))
    .leftJoin(orgSettings, eq(orgSettings.orgId, jobRoles.orgId))
    .where(eq(jobRoles.id, jobRoleId)).get()
  return row ? (row.companyName ?? row.orgName) : null
}
