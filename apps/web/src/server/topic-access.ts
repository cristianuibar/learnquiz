import { and, eq, exists, or, sql } from 'drizzle-orm'
import type { Db } from '@/db'
import { member } from '@/db/auth-schema'
import { jobRoles, memberRoleAssignments, topics } from '@/db/schema'

// The learner's own topic, or the topic of an active role they are assigned to in a company they belong to.
export const learnerCanAccess = (db: Db, learnerId: string) =>
  or(
    eq(topics.learnerId, learnerId),
    exists(
      db
        .select({ one: sql`1` })
        .from(memberRoleAssignments)
        .innerJoin(member, and(eq(member.userId, memberRoleAssignments.userId), eq(member.organizationId, memberRoleAssignments.orgId)))
        .innerJoin(jobRoles, and(eq(jobRoles.id, memberRoleAssignments.jobRoleId), eq(jobRoles.orgId, memberRoleAssignments.orgId), eq(jobRoles.status, 'active')))
        .where(and(eq(memberRoleAssignments.userId, learnerId), eq(memberRoleAssignments.jobRoleId, topics.jobRoleId))),
    ),
  )
