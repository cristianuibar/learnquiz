import { createServerFn } from '@tanstack/react-start'
import { and, asc, count, desc, eq, inArray, isNull, sql } from 'drizzle-orm'
import { z } from 'zod'
import { getDb } from '@/db'
import { member, user } from '@/db/auth-schema'
import { concepts, jobRoles, memberRoleAssignments, sources, topics, units } from '@/db/schema'
import { requireOrgAdmin, requireOrgReader } from '@/server/authz'
import { httpError } from '@/server/helpers'
import { releaseStaleBuild } from '@/server/role-curriculum'

export type RoleDetail = {
  org: { slug: string; name: string }
  readOnly: boolean
  role: { id: string; name: string; benchmark: number; onboardingDays: number; topicId: string; topicStatus: typeof topics.$inferSelect.status; people: number }
  documents: {
    id: string
    title: string
    kind: string
    version: number
    createdAt: number
    status: typeof sources.$inferSelect.status
    error: string | null
    sizeBytes: number | null
    pageCount: number | null
    chars: number
    uploaderName: string | null
  }[]
  units: {
    id: string
    name: string
    summary: string
    concepts: { id: string; name: string; summary: string; critical: boolean; genStatus: string; genError: string | null }[]
  }[]
}

export const getRoleDetail = createServerFn({ method: 'GET' })
  .validator(z.object({ slug: z.string().min(1).max(100), roleId: z.string().min(1).max(100) }))
  .handler(async ({ data }): Promise<RoleDetail> => {
    const { org, readOnly } = await requireOrgReader(data.slug)
    const db = getDb()
    const [role] = await db
      .select({ id: jobRoles.id, name: jobRoles.name, benchmark: jobRoles.benchmark, onboardingDays: jobRoles.onboardingDays, topicId: topics.id, topicStatus: topics.status })
      .from(jobRoles)
      .innerJoin(topics, eq(topics.jobRoleId, jobRoles.id))
      .where(and(eq(jobRoles.id, data.roleId), eq(jobRoles.orgId, org.id), eq(jobRoles.status, 'active')))
    if (!role) throw httpError('Role not found', 404)
    if (role.topicStatus === 'generating' && await releaseStaleBuild(db, role.topicId)) role.topicStatus = 'failed'

    const [documents, unitRows, conceptRows, [assigned]] = await Promise.all([
      db.select({
        id: sources.id, title: sources.title, kind: sources.kind, version: sources.version, createdAt: sources.createdAt, status: sources.status, error: sources.error,
        sizeBytes: sources.sizeBytes, pageCount: sources.pageCount, chars: sql<number>`length(${sources.bodyText})`, uploaderName: user.name,
      })
        .from(sources)
        .leftJoin(user, eq(user.id, sources.uploadedBy))
        .where(and(eq(sources.topicId, role.topicId), isNull(sources.deletedAt), isNull(sources.retiredAt)))
        .orderBy(desc(sources.createdAt), desc(sources.id)),
      db.select({ id: units.id, name: units.name, summary: units.summary }).from(units).where(eq(units.topicId, role.topicId)).orderBy(asc(units.order)),
      db.select({ id: concepts.id, unitId: concepts.unitId, name: concepts.name, summary: concepts.summary, critical: concepts.critical, genStatus: concepts.genStatus, genError: concepts.genError })
        .from(concepts)
        .where(eq(concepts.topicId, role.topicId))
        .orderBy(asc(concepts.order)),
      // The same people rule as the company overview: assigned to this role and still a member of the company.
      db.select({ n: count() })
        .from(memberRoleAssignments)
        .innerJoin(member, and(eq(member.userId, memberRoleAssignments.userId), eq(member.organizationId, memberRoleAssignments.orgId)))
        .where(and(eq(memberRoleAssignments.jobRoleId, role.id), eq(memberRoleAssignments.orgId, org.id))),
    ])
    return {
      org: { slug: org.slug, name: org.name },
      readOnly,
      role: { ...role, people: assigned?.n ?? 0 },
      documents,
      units: unitRows.map((u) => ({ ...u, concepts: conceptRows.filter((c) => c.unitId === u.id).map(({ unitId: _unitId, ...c }) => c) })),
    }
  })

const ConceptEdit = z
  .object({
    slug: z.string().min(1).max(100),
    conceptId: z.string().min(1).max(100),
    name: z.string().trim().min(1, 'Enter a concept name').max(80, 'Use 80 characters or fewer for the name').optional(),
    summary: z.string().trim().min(1, 'Enter a concept summary').max(400, 'Use 400 characters or fewer for the summary').optional(),
    critical: z.boolean().optional(),
  })
  .refine((v) => v.name !== undefined || v.summary !== undefined || v.critical !== undefined, { message: 'Change at least one field' })

export const updateRoleConcept = createServerFn({ method: 'POST' })
  .validator(ConceptEdit)
  .handler(async ({ data }): Promise<{ ok: true }> => {
    const { org } = await requireOrgAdmin(data.slug)
    const db = getDb()
    const set: Partial<typeof concepts.$inferInsert> = {}
    if (data.name !== undefined) set.name = data.name
    if (data.summary !== undefined) set.summary = data.summary
    if (data.critical !== undefined) set.critical = data.critical
    const updated = await db.update(concepts).set(set)
      .where(and(
        eq(concepts.id, data.conceptId),
        inArray(concepts.topicId, db.select({ id: topics.id }).from(topics).where(eq(topics.orgId, org.id))),
      ))
      .returning({ id: concepts.id })
    if (!updated.length) throw httpError('Concept not found', 404)
    return { ok: true }
  })
