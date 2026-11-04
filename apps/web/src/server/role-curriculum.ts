import { and, asc, eq, exists, inArray, isNotNull, isNull, lt, ne, or, sql } from 'drizzle-orm'
import { z } from 'zod'
import { getDb, type Db } from '@/db'
import { conceptEdges, concepts, jobRoles, sources, topics, units } from '@/db/schema'
import { validateSkeleton, type ValidatedSkeleton } from '@/lib/curriculum/validate'
import { chatJson, jobModel, LlmError } from '@/lib/llm/client'
import { curriculumPrompt } from '@/lib/llm/prompts'
import { CurriculumSkeleton } from '@/lib/llm/schemas'
import { MAX_SOURCE_TEXT_CHARS } from '@/lib/limits'
import { drainConceptQueue, STALE_CLAIM_MS } from '@/server/concept-gen'
import { runInBackground } from '@/server/env'
import { chunks, httpError } from '@/server/helpers'
import { assertWithinCompanyCap, assertWithinDailyCap } from '@/server/model-cap'

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

// Role publication in one atomic batch: the topic turns ready only while this build still holds its claim and none of the
// documents it cites is retired or deleted; otherwise the inserted path is deleted again. genStartedAt keeps the claim's value.
async function publishRoleCurriculum(db: Db, topicId: string, claimAt: number, valid: ValidatedSkeleton, generatedBy: string | null): Promise<boolean> {
  const inserts = curriculumWrites(db, topicId, valid, generatedBy, 'pending').slice(0, -1)
  const cited = [...new Set(valid.units.flatMap((u) => u.concepts.map((c) => c.sourceId)).filter((id): id is string => Boolean(id)))]
  const deadSource = exists(db.select({ one: sql`1` }).from(sources)
    .where(and(inArray(sources.id, cited.length ? cited : ['']), or(isNotNull(sources.retiredAt), isNotNull(sources.deletedAt)))))
  const held = and(eq(topics.id, topicId), eq(topics.status, 'generating'), eq(topics.genStartedAt, claimAt))
  const published = exists(db.select({ one: sql`1` }).from(topics)
    .where(and(eq(topics.id, topicId), eq(topics.status, 'ready'), eq(topics.genStartedAt, claimAt))))
  const notPublished = sql`not ${published}`
  const conceptIds = valid.units.flatMap((u) => u.concepts.map((c) => c.id))
  const queries = [
    ...inserts,
    db.update(topics).set({ status: 'ready', generatedBy }).where(and(held, sql`not ${deadSource}`)).returning({ id: topics.id }),
    ...chunks(conceptIds, 40).map((ids) => db.delete(conceptEdges).where(and(inArray(conceptEdges.fromId, ids), notPublished))),
    ...chunks(conceptIds, 40).map((ids) => db.delete(concepts).where(and(inArray(concepts.id, ids), notPublished))),
    ...chunks(valid.units.map((u) => u.id), 40).map((ids) => db.delete(units).where(and(inArray(units.id, ids), notPublished))),
  ]
  const [first, ...rest] = queries
  const results = await db.batch([first, ...rest])
  return (results[inserts.length] as unknown[]).length > 0
}

// A build claim outlives its request only when the request died mid call; claims from before the timestamp count as stale.
const staleBuild = (now: number) =>
  and(eq(topics.status, 'generating'), or(isNull(topics.genStartedAt), lt(topics.genStartedAt, now - STALE_CLAIM_MS)))

// Marks an abandoned build failed so the role can be rebuilt and take documents again; without a topicId, releases every stale role build.
export async function releaseStaleBuild(db: Db, topicId?: string): Promise<boolean> {
  const released = await db.update(topics).set({ status: 'failed' })
    .where(and(topicId ? eq(topics.id, topicId) : isNotNull(topics.jobRoleId), staleBuild(Date.now()))).returning({ id: topics.id })
  return released.length > 0
}

// Refusals throw before anything is claimed; the returned run owns the claim.
export async function claimRoleBuild({ orgId, ownerId, roleId }: { orgId: string; ownerId: string; roleId: string }): Promise<() => Promise<{ topicId: string }>> {
  const db = getDb()
  const [row] = await db
    .select({ topic: topics })
    .from(jobRoles)
    .innerJoin(topics, eq(topics.jobRoleId, jobRoles.id))
    .where(and(eq(jobRoles.id, roleId), eq(jobRoles.orgId, orgId), eq(jobRoles.status, 'active')))
  if (!row) throw httpError('Role topic not found', 404)
  const topicId = row.topic.id
  const liveDocuments = () => db.select().from(sources)
    .where(and(eq(sources.topicId, topicId), isNull(sources.deletedAt), isNull(sources.retiredAt), ne(sources.status, 'failed')))
    .orderBy(asc(sources.createdAt), asc(sources.id))
  const missingDocuments = () => httpError('Add documents with extracted text before building the curriculum.', 422)
  const unusable = (docs: { bodyText: string }[]) => !docs.length || docs.some((d) => !d.bodyText.trim())
  if (unusable(await liveDocuments())) throw missingDocuments()
  await assertWithinDailyCap(db, ownerId)
  await assertWithinCompanyCap(db, orgId)
  // Claim once; a repeat request must not duplicate the path or overwrite learner progress.
  const now = Date.now()
  const claimed = await db.update(topics).set({ status: 'generating', genStartedAt: now })
    .where(and(eq(topics.id, topicId), or(inArray(topics.status, ['draft', 'failed']), staleBuild(now))))
    .returning({ id: topics.id })
  if (!claimed.length) throw httpError('The curriculum is already generating or ready.', 409)
  return async () => {
    try {
      // Read after the claim: a replacement committed before it is seen here, and one after it is refused while generating.
      const documents = await liveDocuments()
      if (unusable(documents)) throw missingDocuments()
      let skeleton: CurriculumSkeleton
      try {
        skeleton = await chatJson({
          purpose: 'curriculum', schema: CurriculumSkeleton, schemaName: 'curriculum_skeleton',
          ...curriculumPrompt({ topic: row.topic.title, goal: row.topic.goal, levelHint: 3, sourceDocuments: documents }),
          maxTokens: 16000, learnerId: ownerId, orgId, topicId,
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
      if (!(await publishRoleCurriculum(db, topicId, now, valid, jobModel('curriculum').model))) {
        throw httpError('A document changed while the curriculum was generating. Build it again.', 409)
      }
      // Questions are generated per concept for the whole company, not per learner.
      runInBackground(drainConceptQueue())
      return { topicId }
    } catch (e) {
      // Only the build that still holds the claim may fail the topic; a stale one must not overwrite another build's result.
      await db.update(topics).set({ status: 'failed' })
        .where(and(eq(topics.id, topicId), eq(topics.status, 'generating'), eq(topics.genStartedAt, now))).catch(() => {})
      throw e
    }
  }
}

// Callers authenticate the actor; every query still scopes the role to its company.
export async function buildRoleCurriculum(args: { orgId: string; ownerId: string; roleId: string }): Promise<{ topicId: string }> {
  return (await claimRoleBuild(args))()
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
