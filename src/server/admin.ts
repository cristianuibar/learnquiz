import { createServerFn } from '@tanstack/react-start'
import { getRequestHeaders } from '@tanstack/react-start/server'
import { and, asc, desc, eq, sql, type SQL } from 'drizzle-orm'
import { z } from 'zod'
import { getDb } from '@/db'
import { member, organization, user } from '@/db/auth-schema'
import { jobRoles, memberRoleAssignments, modelCalls, sessions, sources, topics } from '@/db/schema'
import { getAuth } from '@/server/auth'
import { requireStaff } from '@/server/authz'
import { httpError } from '@/server/helpers'

export const getStaffSession = createServerFn({ method: 'GET' }).handler(async () => {
  const staff = await requireStaff()
  return { id: staff.id, name: staff.name }
})

// Documents belong to the company's roles. Activity and spend belong to learners; attribute them to their current company memberships.
// Nest SQL so Drizzle preserves qualified columns inside correlated subqueries.
const metric = (query: SQL) => sql<number>`${query}`.mapWith(Number)
const companyMetrics = () => ({
  members: metric(sql`(select count(*) from ${member} where ${member.organizationId} = ${organization.id})`),
  roles: metric(sql`(select count(*) from ${jobRoles} where ${jobRoles.orgId} = ${organization.id})`),
  documents: metric(sql`(select count(*) from ${sources} inner join ${topics} on ${topics.id} = ${sources.topicId}
    inner join ${jobRoles} on ${jobRoles.id} = ${topics.jobRoleId} where ${jobRoles.orgId} = ${organization.id})`),
  activeLearners: metric(sql`(select count(distinct ${sessions.learnerId}) from ${sessions}
    where ${sessions.startedAt} >= ${Date.now() - 30 * 86_400_000}
    and ${sessions.learnerId} in (select ${member.userId} from ${member} where ${member.organizationId} = ${organization.id}))`),
  modelSpend: metric(sql`(select coalesce(sum(${modelCalls.costUsd}), 0) from ${modelCalls}
    where ${modelCalls.learnerId} in (select ${member.userId} from ${member} where ${member.organizationId} = ${organization.id}))`),
})

export const getCompanies = createServerFn({ method: 'GET' }).handler(async () => {
  await requireStaff()
  return getDb().select({ id: organization.id, name: organization.name, slug: organization.slug, ...companyMetrics() })
    .from(organization).orderBy(asc(organization.name))
})

export const getCompany = createServerFn({ method: 'GET' })
  .validator(z.object({ slug: z.string().min(1).max(100) }))
  .handler(async ({ data }) => {
    await requireStaff()
    const db = getDb()
    const company = await db.select({ id: organization.id, name: organization.name, slug: organization.slug, ...companyMetrics() })
      .from(organization).where(eq(organization.slug, data.slug)).get()
    if (!company) throw httpError('Company not found', 404)
    const [members, roles, documents] = await Promise.all([
      db.select({ id: member.id, name: user.name, email: user.email, role: member.role, jobRole: jobRoles.name })
        .from(member).innerJoin(user, eq(user.id, member.userId))
        .leftJoin(memberRoleAssignments, and(eq(memberRoleAssignments.userId, member.userId), eq(memberRoleAssignments.orgId, member.organizationId)))
        .leftJoin(jobRoles, and(eq(jobRoles.id, memberRoleAssignments.jobRoleId), eq(jobRoles.orgId, member.organizationId)))
        .where(eq(member.organizationId, company.id)).orderBy(asc(user.name)),
      db.select({ id: jobRoles.id, name: jobRoles.name, status: jobRoles.status, benchmark: jobRoles.benchmark, onboardingDays: jobRoles.onboardingDays })
        .from(jobRoles).where(eq(jobRoles.orgId, company.id)).orderBy(asc(jobRoles.name)),
      db.select({ id: sources.id, title: sources.title, kind: sources.kind, role: jobRoles.name })
        .from(sources).innerJoin(topics, eq(topics.id, sources.topicId)).innerJoin(jobRoles, eq(jobRoles.id, topics.jobRoleId))
        .where(eq(jobRoles.orgId, company.id))
        .orderBy(desc(sources.createdAt)),
    ])
    return { ...company, members, roles, documents }
  })

export const listUsers = createServerFn({ method: 'GET' })
  .validator(z.object({ search: z.string().trim().max(200).default(''), field: z.enum(['email', 'name']).default('email'), offset: z.number().int().min(0).default(0) }))
  .handler(async ({ data }) => {
    await requireStaff()
    const result = await getAuth().api.listUsers({
      headers: getRequestHeaders(),
      query: { searchValue: data.search || undefined, searchField: data.field, searchOperator: 'contains', limit: 25, offset: data.offset, sortBy: 'createdAt', sortDirection: 'desc' },
    })
    return { users: result.users.map(({ id, name, email, role, banned, banReason }) => ({ id, name, email, role, banned, banReason })), total: result.total }
  })

export const setUserBan = createServerFn({ method: 'POST' })
  .validator(z.object({ userId: z.string().min(1).max(100), banned: z.boolean(), reason: z.string().trim().max(500).optional() }))
  .handler(async ({ data }): Promise<void> => {
    await requireStaff()
    const auth = getAuth()
    const headers = getRequestHeaders()
    if (data.banned) await auth.api.banUser({ headers, body: { userId: data.userId, banReason: data.reason || undefined } })
    else await auth.api.unbanUser({ headers, body: { userId: data.userId } })
  })
