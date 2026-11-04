import { createServerFn } from '@tanstack/react-start'
import { and, count, eq } from 'drizzle-orm'
import { getDb } from '@/db'
import { organization } from '@/db/auth-schema'
import { concepts, jobRoles, topics } from '@/db/schema'
import { requireStaff } from '@/server/authz'
import { liveConcept } from '@/server/live-concept'

export const getStaffSession = createServerFn({ method: 'GET' }).handler(async () => {
  const staff = await requireStaff()
  const db = getDb()
  const [[failedConcepts], [failedRoles]] = await Promise.all([
    db.select({ n: count() }).from(concepts).innerJoin(topics, eq(topics.id, concepts.topicId)).innerJoin(organization, eq(organization.id, topics.orgId))
      .where(and(eq(concepts.genStatus, 'failed'), liveConcept())),
    db.select({ n: count() }).from(topics).innerJoin(organization, eq(organization.id, topics.orgId)).innerJoin(jobRoles, eq(jobRoles.id, topics.jobRoleId))
      .where(eq(topics.status, 'failed')),
  ])
  return { id: staff.id, name: staff.name, email: staff.email, failedJobs: failedConcepts.n + failedRoles.n }
})
