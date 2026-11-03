import { and, asc, eq, inArray, isNull } from 'drizzle-orm'
import { z } from 'zod'
import { getDb, type Db } from '@/db'
import { conceptEdges, concepts, jobRoles, sources, topics, units } from '@/db/schema'
import { validateSkeleton, type ValidatedSkeleton } from '@/lib/curriculum/validate'
import { chatJson, jobModel, LlmError } from '@/lib/llm/client'
import { curriculumPrompt } from '@/lib/llm/prompts'
import { CurriculumSkeleton } from '@/lib/llm/schemas'
import { MAX_SOURCE_TEXT_CHARS } from '@/lib/limits'
import { drainConceptQueue } from '@/server/concept-gen'
import { runInBackground } from '@/server/env'
import { chunks, httpError } from '@/server/helpers'
import { assertWithinDailyCap } from '@/server/model-cap'

export function curriculumWrites(db: Db, topicId: string, valid: ValidatedSkeleton, generatedBy: string | null, conceptGenStatus: 'pending' | 'ready' = 'ready') {
  const unitRows = valid.units.map((u, order) => ({ id: u.id, topicId, order, name: u.name, summary: u.summary }))
  const conceptRows = valid.units.flatMap((u) =>
    u.concepts.map((c, order) => ({
      id: c.id, topicId, unitId: u.id, order, name: c.name, summary: c.summary, level: 3,
      sourceId: c.sourceId, sourceQuote: c.sourceQuote, grounded: c.grounded, critical: c.critical, visual: c.visual,
      misconceptionsJson: JSON.stringify(c.misconceptions), genStatus: conceptGenStatus,
    })),
  )
  return [
    ...chunks(unitRows, 10).map((rows) => db.insert(units).values(rows)),
    // Each concept binds 14 parameters including defaults; seven rows stay below D1's 100-parameter limit.
    ...chunks(conceptRows, 7).map((rows) => db.insert(concepts).values(rows)),
    ...chunks(valid.edges.map((e) => ({ topicId, ...e })), 20).map((rows) => db.insert(conceptEdges).values(rows)),
    db.update(topics).set({ status: 'ready', generatedBy }).where(eq(topics.id, topicId)),
  ] as const
}

// Callers authenticate the actor; every query still scopes the role to its company.
export async function buildRoleCurriculum({ orgId, ownerId, roleId }: { orgId: string; ownerId: string; roleId: string }): Promise<{ topicId: string }> {
  const db = getDb()
  const [row] = await db
    .select({ topic: topics })
    .from(jobRoles)
    .innerJoin(topics, eq(topics.jobRoleId, jobRoles.id))
    .where(and(eq(jobRoles.id, roleId), eq(jobRoles.orgId, orgId), eq(jobRoles.status, 'active')))
  if (!row) throw httpError('Role topic not found', 404)
  const topicId = row.topic.id
  const documents = await db.select().from(sources)
    .where(and(eq(sources.topicId, topicId), isNull(sources.deletedAt)))
    .orderBy(asc(sources.createdAt), asc(sources.id))
  if (!documents.length || documents.some((d) => !d.bodyText.trim())) {
    throw httpError('Add documents with extracted text before building the curriculum.', 422)
  }
  await assertWithinDailyCap(db, ownerId)
  // Claim once; a repeat request must not duplicate the path or overwrite learner progress.
  const claimed = await db.update(topics).set({ status: 'generating' })
    .where(and(eq(topics.id, topicId), inArray(topics.status, ['draft', 'failed'])))
    .returning({ id: topics.id })
  if (!claimed.length) throw httpError('The curriculum is already generating or ready.', 409)
  try {
    let skeleton: CurriculumSkeleton
    try {
      skeleton = await chatJson({
        purpose: 'curriculum', schema: CurriculumSkeleton, schemaName: 'curriculum_skeleton',
        ...curriculumPrompt({ topic: row.topic.title, goal: row.topic.goal, levelHint: 3, sourceDocuments: documents }),
        maxTokens: 16000, learnerId: ownerId, topicId,
      })
    } catch (e) {
      if (e instanceof LlmError && e.status === 429) throw httpError(e.message, 429)
      if (e instanceof LlmError && e.status === 422) throw httpError('The model did not produce a valid document curriculum. Try again.', 422)
      throw httpError('The model did not answer. Try again.', 503)
    }
    const valid = validateSkeleton(skeleton, documents)
    if (valid.units.some((u) => u.concepts.some((c) => !c.grounded))) {
      throw httpError('The curriculum contains concepts without a matching document quote. Try again.', 422)
    }
    // Publish the complete path and its ready status together; never publish a generic fallback for an SOP.
    const [first, ...rest] = curriculumWrites(db, topicId, valid, jobModel('curriculum').model, 'pending')
    await db.batch([first, ...rest])
    // Questions are generated per concept for the whole company, not per learner.
    runInBackground(drainConceptQueue())
    return { topicId }
  } catch (e) {
    await db.update(topics).set({ status: 'failed' }).where(eq(topics.id, topicId)).catch(() => {})
    throw e
  }
}

const RoleDocument = z.object({
  orgId: z.string().min(1), roleId: z.string().min(1), id: z.string().min(1),
  title: z.string().trim().min(1).max(200), bodyText: z.string().trim().min(1).max(MAX_SOURCE_TEXT_CHARS),
})

// Text ingestion for a role's draft curriculum; repeat imports preserve the source.
export async function addRoleDocument(input: z.input<typeof RoleDocument>) {
  const data = RoleDocument.parse(input)
  const db = getDb()
  const row = await db.select({ topic: topics }).from(jobRoles)
    .innerJoin(topics, eq(topics.jobRoleId, jobRoles.id))
    .where(and(eq(jobRoles.id, data.roleId), eq(jobRoles.orgId, data.orgId), eq(jobRoles.status, 'active'))).get()
  if (!row) throw httpError('Role topic not found', 404)
  const existing = await db.select().from(sources).where(eq(sources.id, data.id)).get()
  if (existing) {
    if (existing.topicId !== row.topic.id || existing.bodyText !== data.bodyText || existing.title !== data.title || existing.deletedAt !== null) {
      throw httpError('The existing document differs from this import.', 409)
    }
    return { sourceId: existing.id, topicId: row.topic.id }
  }
  if (!['draft', 'failed'].includes(row.topic.status)) throw httpError('The curriculum is already generating or ready.', 409)
  await db.insert(sources).values({ id: data.id, topicId: row.topic.id, kind: 'text', title: data.title, bodyText: data.bodyText, createdAt: Date.now() })
  return { sourceId: data.id, topicId: row.topic.id }
}
