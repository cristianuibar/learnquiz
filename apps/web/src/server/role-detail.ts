import { createServerFn } from '@tanstack/react-start'
import { and, asc, desc, eq, inArray, isNull } from 'drizzle-orm'
import { z } from 'zod'
import { getDb } from '@/db'
import { concepts, jobRoles, sources, topics, units } from '@/db/schema'
import { requireOrgAdmin, requireOrgReader } from '@/server/authz'
import { httpError } from '@/server/helpers'
import { releaseStaleBuild } from '@/server/role-curriculum'

export type RoleDetail = {
  org: { slug: string; name: string }
  readOnly: boolean
  role: { id: string; name: string; benchmark: number; onboardingDays: number; topicId: string; topicStatus: typeof topics.$inferSelect.status }
  documents: { id: string; title: string; kind: string; version: number; createdAt: number }[]
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

    const [documents, unitRows, conceptRows] = await Promise.all([
      db.select({ id: sources.id, title: sources.title, kind: sources.kind, version: sources.version, createdAt: sources.createdAt })
        .from(sources)
        .where(and(eq(sources.topicId, role.topicId), isNull(sources.deletedAt), isNull(sources.retiredAt)))
        .orderBy(desc(sources.createdAt), desc(sources.id)),
      db.select({ id: units.id, name: units.name, summary: units.summary }).from(units).where(eq(units.topicId, role.topicId)).orderBy(asc(units.order)),
      db.select({ id: concepts.id, unitId: concepts.unitId, name: concepts.name, summary: concepts.summary, critical: concepts.critical, genStatus: concepts.genStatus, genError: concepts.genError })
        .from(concepts)
        .where(eq(concepts.topicId, role.topicId))
        .orderBy(asc(concepts.order)),
    ])
    return {
      org: { slug: org.slug, name: org.name },
      readOnly,
      role,
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
