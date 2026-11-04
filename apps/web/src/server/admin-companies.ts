import { createServerFn } from '@tanstack/react-start'
import { and, asc, desc, eq, gte, isNull, lte, sql, type SQL } from 'drizzle-orm'
import { z } from 'zod'
import { getDb } from '@/db'
import { invitation, member, organization, user } from '@/db/auth-schema'
import { concepts, items, jobRoles, memberRoleAssignments, modelCalls, sessions, sources, topics } from '@/db/schema'
import { requireStaff } from '@/server/authz'
import { httpError } from '@/server/helpers'
import { liveConcept } from '@/server/live-concept'

const DAY = 86_400_000
const settled = sql`not (${modelCalls.ok} = 0 and coalesce(${modelCalls.error}, '') = 'pending')`
const spendWindow = (since: number, asOf: number) => and(gte(modelCalls.createdAt, since), lte(modelCalls.createdAt, asOf), settled)
// Nest SQL so Drizzle preserves qualified columns inside correlated subqueries.
const metric = (query: SQL) => sql<number>`${query}`.mapWith(Number)
const companyMetrics = (since: number, asOf: number) => ({
  members: metric(sql`(select count(*) from ${member} where ${member.organizationId} = ${organization.id})`),
  roles: metric(sql`(select count(*) from ${jobRoles} where ${jobRoles.orgId} = ${organization.id})`),
  documents: metric(sql`(select count(*) from ${sources} inner join ${topics} on ${topics.id} = ${sources.topicId}
    inner join ${jobRoles} on ${jobRoles.id} = ${topics.jobRoleId} where ${jobRoles.orgId} = ${organization.id})`),
  activeLearners: metric(sql`(select count(distinct ${sessions.learnerId}) from ${sessions}
    where ${sessions.startedAt} >= ${since} and ${sessions.startedAt} <= ${asOf}
    and ${sessions.learnerId} in (select ${member.userId} from ${member} where ${member.organizationId} = ${organization.id}))`),
  modelSpend: sql<number | null>`${sql`(select sum(${modelCalls.costUsd}) from ${modelCalls}
    where ${modelCalls.orgId} = ${organization.id} and ${spendWindow(since, asOf)})`}`,
})

export const getCompanies = createServerFn({ method: 'GET' }).handler(async () => {
  await requireStaff()
  const asOf = Date.now()
  const companies = await getDb().select({ id: organization.id, name: organization.name, slug: organization.slug, ...companyMetrics(asOf - 30 * DAY, asOf) })
    .from(organization).orderBy(asc(organization.name))
  return companies.map((company) => ({ ...company, modelSpend: company.modelSpend ?? 0 }))
})

export const getCompany = createServerFn({ method: 'GET' })
  .validator(z.object({ slug: z.string().min(1).max(100) }))
  .handler(async ({ data }) => {
    await requireStaff()
    const db = getDb()
    const asOf = Date.now()
    const since = asOf - 30 * DAY
    const company = await db.select({ id: organization.id, name: organization.name, slug: organization.slug, logo: organization.logo, createdAt: organization.createdAt, ...companyMetrics(since, asOf) })
      .from(organization).where(eq(organization.slug, data.slug)).get()
    if (!company) throw httpError('Company not found', 404)
    const [members, invitations, roles, documents, spend] = await Promise.all([
      db.select({ id: member.id, name: user.name, email: user.email, role: member.role, joinedAt: member.createdAt,
        lastActive: sql<number | null>`(select max(${sessions.startedAt}) from ${sessions} where ${sessions.learnerId} = ${member.userId})`,
      })
        .from(member).innerJoin(user, eq(user.id, member.userId))
        .where(eq(member.organizationId, company.id)).orderBy(asc(member.createdAt), asc(user.name)),
      db.select({ id: invitation.id, name: invitation.inviteeName, email: invitation.email, role: invitation.role, createdAt: invitation.createdAt })
        .from(invitation).where(and(eq(invitation.organizationId, company.id), eq(invitation.status, 'pending')))
        .orderBy(asc(invitation.createdAt), asc(invitation.id)),
      db.select({ id: jobRoles.id, name: jobRoles.name, status: jobRoles.status, topicStatus: topics.status,
        conceptsTotal: metric(sql`(select count(*) from ${concepts} where ${concepts.topicId} = ${topics.id} and ${liveConcept()})`),
        conceptsReady: metric(sql`(select count(*) from ${concepts} where ${concepts.topicId} = ${topics.id} and ${concepts.genStatus} = 'ready' and ${liveConcept()})`),
        preparing: sql<boolean>`${sql`${topics.status} = 'generating' or exists(select 1 from ${concepts} where ${concepts.topicId} = ${topics.id} and ${concepts.genStatus} in ('pending', 'generating') and ${liveConcept()})`}`.mapWith(Boolean),
        liveQuestions: metric(sql`(select count(*) from ${items} inner join ${concepts} on ${concepts.id} = ${items.conceptId}
          where ${items.topicId} = ${topics.id} and ${items.status} in ('active', 'reported') and ${liveConcept()})`),
        people: metric(sql`(select count(*) from ${memberRoleAssignments} inner join ${member}
          on ${member.userId} = ${memberRoleAssignments.userId} and ${member.organizationId} = ${memberRoleAssignments.orgId}
          where ${memberRoleAssignments.jobRoleId} = ${jobRoles.id} and ${memberRoleAssignments.orgId} = ${company.id})`),
      })
        .from(jobRoles).leftJoin(topics, eq(topics.jobRoleId, jobRoles.id)).where(eq(jobRoles.orgId, company.id)).orderBy(asc(jobRoles.name)),
      db.select({ id: sources.id, title: sources.title, kind: sources.kind, role: jobRoles.name,
        sizeBytes: sources.sizeBytes, pageCount: sources.pageCount, chars: sql<number>`length(${sources.bodyText})`,
        version: sources.version, createdAt: sources.createdAt, uploaderName: user.name, status: sources.status,
        unreviewed: metric(sql`(select count(*) from ${items} where ${items.sourceId} = ${sources.id} and ${items.status} = 'active' and ${items.reviewedAt} is null)`),
        generating: sql<boolean>`${topics.status} = 'generating' or exists(select 1 from ${concepts} where ${concepts.sourceId} = ${sources.id} and ${concepts.genStatus} in ('pending', 'generating'))`.mapWith(Boolean),
      })
        .from(sources).innerJoin(topics, eq(topics.id, sources.topicId)).innerJoin(jobRoles, eq(jobRoles.id, topics.jobRoleId))
        .leftJoin(user, eq(user.id, sources.uploadedBy))
        .where(and(eq(jobRoles.orgId, company.id), isNull(sources.retiredAt), isNull(sources.deletedAt)))
        .orderBy(desc(sources.createdAt), desc(sources.id)),
      db.select({ purpose: modelCalls.purpose, model: modelCalls.model, cost: sql<number | null>`sum(${modelCalls.costUsd})` })
        .from(modelCalls).where(and(eq(modelCalls.orgId, company.id), spendWindow(since, asOf)))
        .groupBy(modelCalls.purpose, modelCalls.model).orderBy(asc(modelCalls.model)),
    ])
    // One bar per job, retaining every recorded model (including retries and fallbacks).
    const jobs = new Map<string, { purpose: string; models: string[]; cost: number | null }>()
    for (const row of spend) {
      const job = jobs.get(row.purpose) ?? { purpose: row.purpose, models: [], cost: null }
      job.models.push(row.model)
      if (row.cost !== null) job.cost = (job.cost ?? 0) + row.cost
      jobs.set(row.purpose, job)
    }
    const spendByJob = [...jobs.values()].sort((a, b) => (b.cost ?? -1) - (a.cost ?? -1) || a.purpose.localeCompare(b.purpose))
    return { ...company, owner: members.find((m) => m.role.split(',').includes('owner'))?.name ?? null, members, invitations, roles, documents, spendByJob }
  })
