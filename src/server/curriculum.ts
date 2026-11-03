import { createServerFn } from '@tanstack/react-start'
import { and, asc, count, desc, eq, inArray } from 'drizzle-orm'
import { z } from 'zod'
import { getDb } from '@/db'
import { conceptEdges, concepts, items, learnerConcept, learnerItem, learnerTopic, learnerUnit, placements, sources, topics, units } from '@/db/schema'
import { validateSkeleton, fallbackSkeleton } from '@/lib/curriculum/validate'
import { chatJson, jobModel, LlmError } from '@/lib/llm/client'
import { curriculumPrompt } from '@/lib/llm/prompts'
import { CurriculumSkeleton } from '@/lib/llm/schemas'
import { MAX_SOURCE_TEXT_CHARS } from '@/lib/limits'
import { asItem, httpError, mean, type StoredItem } from '@/server/helpers'
import { assertWithinDailyCap } from '@/server/model-cap'
import { requireOrgAdmin } from '@/server/authz'
import { requireLearnerId } from '@/server/session'
import { drainConceptQueue } from '@/server/concept-gen'
import { runInBackground } from '@/server/env'
import { learnerCanAccess, rolePlayable, seedLearnerTopic } from '@/server/topic-access'
import { buildRoleCurriculum, curriculumWrites } from '@/server/role-curriculum'

export const createTopic = createServerFn({ method: 'POST' })
  .validator(
    z.object({
      topic: z.string().trim().min(1, 'Enter a topic').min(2, 'Use at least 2 characters for the topic').max(200, 'Use at most 200 characters for the topic'),
      goal: z.string().max(300).optional(),
      sourceText: z.string().max(MAX_SOURCE_TEXT_CHARS).optional(),
    }),
  )
  .handler(async ({ data }): Promise<{ topicId: string }> => {
    const learnerId = await requireLearnerId()
    const db = getDb()
    // Before any stored write: a capped learner stores no topic or source row.
    await assertWithinDailyCap(db, learnerId)
    const topicId = crypto.randomUUID()
    await db.insert(topics).values({ id: topicId, learnerId, title: data.topic, goal: data.goal ?? null, status: 'generating', createdAt: Date.now() })
    try {
      let sourceId: string | null = null
      if (data.sourceText) {
        sourceId = crypto.randomUUID()
        await db.insert(sources).values({ id: sourceId, topicId, kind: 'text', title: 'Pasted text', bodyText: data.sourceText, createdAt: Date.now() })
      }
      let skeleton: CurriculumSkeleton
      let generatedBy: string | null = null
      try {
        skeleton = await chatJson({
          purpose: 'curriculum',
          schema: CurriculumSkeleton,
          schemaName: 'curriculum_skeleton',
          ...curriculumPrompt({ topic: data.topic, goal: data.goal, levelHint: 3, sourceText: data.sourceText }),
          maxTokens: 16000, // measured: 8.6k tokens on a 30-concept topic, reasoning included
          learnerId,
          topicId,
        })
        generatedBy = jobModel('curriculum').model
      } catch (e) {
        if (e instanceof LlmError && e.status === 429) {
          // A request that raced the cap check stored its rows before the backstop
          // fired; remove them so a capped request leaves nothing behind.
          await db.delete(sources).where(eq(sources.topicId, topicId)).catch(() => {})
          await db.delete(topics).where(eq(topics.id, topicId)).catch(() => {})
          throw httpError(e.message, 429)
        }
        // Only invalid output falls back to the generic skeleton; a dead or unauthorised model must not look like success.
        if (!(e instanceof LlmError) || e.status !== 422) {
          throw httpError(`The model did not answer (${e instanceof LlmError ? e.status : 'error'}). Try again.`, 503)
        }
        console.error('curriculum output invalid, using fallback', e.message)
        skeleton = fallbackSkeleton(data.topic)
      }
      const valid = validateSkeleton(skeleton, sourceId ? [{ id: sourceId, bodyText: data.sourceText! }] : [])
      if (valid.notes.length) console.warn('curriculum notes', valid.notes)

      // One batch = one D1 transaction: the topic is 'ready' only when its whole path exists.
      await db.batch([
        db
          .insert(learnerTopic)
          .values({ learnerId, topicId, level: 3, rating: 1500 })
          .onConflictDoUpdate({ target: [learnerTopic.learnerId, learnerTopic.topicId], set: { level: 3, rating: 1500 } }),
        ...curriculumWrites(db, topicId, valid, generatedBy),
      ])
      return { topicId }
    } catch (e) {
      // The status write must not mask the original error.
      await db.update(topics).set({ status: 'failed' }).where(eq(topics.id, topicId)).catch(() => {})
      throw e
    }
  })

export const generateRoleCurriculum = createServerFn({ method: 'POST' })
  .validator(z.object({ slug: z.string().min(1).max(100), roleId: z.string().min(1).max(100) }))
  .handler(async ({ data }): Promise<{ topicId: string }> => {
    const { user, org } = await requireOrgAdmin(data.slug)
    return buildRoleCurriculum({ orgId: org.id, ownerId: user.id, roleId: data.roleId })
  })

export const retryConceptGeneration = createServerFn({ method: 'POST' })
  .validator(z.object({ slug: z.string().min(1).max(100), conceptId: z.string().min(1).max(100) }))
  .handler(async ({ data }): Promise<{ ok: true }> => {
    const { org } = await requireOrgAdmin(data.slug)
    const db = getDb()
    const reset = await db.update(concepts).set({ genStatus: 'pending', genError: null, genStartedAt: null })
      .where(and(
        eq(concepts.id, data.conceptId), eq(concepts.genStatus, 'failed'),
        inArray(concepts.topicId, db.select({ id: topics.id }).from(topics).where(eq(topics.orgId, org.id))),
      ))
      .returning({ id: concepts.id })
    if (!reset.length) throw httpError('Failed concept not found', 404)
    runInBackground(drainConceptQueue())
    return { ok: true }
  })

export const getTopicPath = createServerFn({ method: 'GET' })
  .validator(z.object({ topicId: z.string().min(1) }))
  .handler(async ({ data }) => {
    const learnerId = await requireLearnerId()
    const db = getDb()
    const [row] = await db
      .select({ id: topics.id, title: topics.title, goal: topics.goal, status: topics.status, generatedBy: topics.generatedBy, jobRoleId: topics.jobRoleId })
      .from(topics)
      .where(and(eq(topics.id, data.topicId), learnerCanAccess(db, learnerId)))
    if (!row) throw httpError('Topic not found', 404)
    const { jobRoleId, ...topic } = row
    if (jobRoleId !== null && topic.status === 'ready') await seedLearnerTopic(db, learnerId, topic.id)
    // Nothing to start until the topic is ready; a role topic also needs a stored question it can play.
    const preparing = jobRoleId !== null ? !(await rolePlayable(db, topic)) : topic.status !== 'ready'

    const [unitRows, conceptRows, edges, counts, known, [lt], [placement]] = await Promise.all([
      db
        .select({ id: units.id, order: units.order, name: units.name, summary: units.summary, unlockedAt: learnerUnit.unlockedAt })
        .from(units)
        .leftJoin(learnerUnit, and(eq(learnerUnit.unitId, units.id), eq(learnerUnit.learnerId, learnerId)))
        .where(eq(units.topicId, topic.id))
        .orderBy(asc(units.order)),
      db.select().from(concepts).where(eq(concepts.topicId, topic.id)).orderBy(asc(concepts.order)),
      db.select({ fromId: conceptEdges.fromId, toId: conceptEdges.toId }).from(conceptEdges).where(eq(conceptEdges.topicId, topic.id)),
      db
        .select({ conceptId: items.conceptId, n: count() })
        .from(items)
        .where(and(eq(items.topicId, topic.id), eq(items.status, 'active')))
        .groupBy(items.conceptId),
      db
        .select({ conceptId: learnerConcept.conceptId, pKnown: learnerConcept.pKnown, nAttempts: learnerConcept.nAttempts })
        .from(learnerConcept)
        .innerJoin(concepts, eq(concepts.id, learnerConcept.conceptId))
        .where(and(eq(learnerConcept.learnerId, learnerId), eq(concepts.topicId, topic.id))),
      db
        .select({ level: learnerTopic.level, xp: learnerTopic.xp, streak: learnerTopic.streakCount })
        .from(learnerTopic)
        .where(and(eq(learnerTopic.learnerId, learnerId), eq(learnerTopic.topicId, topic.id))),
      db
        .select({ logJson: placements.logJson })
        .from(placements)
        .where(and(eq(placements.learnerId, learnerId), eq(placements.topicId, topic.id)))
        .orderBy(desc(placements.createdAt))
        .limit(1),
    ])
    const pKnown = new Map(known.map((r) => [r.conceptId, r.pKnown]))
    const attempted = new Set(known.filter((r) => r.nAttempts > 0).map((r) => r.conceptId))
    const itemCount = new Map(counts.map((c) => [c.conceptId, c.n]))
    return {
      topic,
      preparing,
      // The reveal line lives in placements.log_json as { log, levelLine }.
      learner: {
        level: lt?.level ?? 3,
        levelLine: placement ? ((JSON.parse(placement.logJson) as { levelLine?: string }).levelLine ?? null) : null,
        levelLineModel: placement ? ((JSON.parse(placement.logJson) as { levelLineModel?: string }).levelLineModel ?? null) : null,
        placed: Boolean(placement),
        xp: lt?.xp ?? 0,
        streak: lt?.streak ?? 0,
      },
      units: unitRows.map((u) => {
        const unitConcepts = conceptRows
          .filter((c) => c.unitId === u.id)
          .map((c) => ({
            id: c.id,
            order: c.order,
            name: c.name,
            summary: c.summary,
            visual: c.visual,
            grounded: c.grounded,
            critical: c.critical,
            itemCount: itemCount.get(c.id) ?? 0,
            pKnown: pKnown.get(c.id) ?? 0,
          }))
        return {
          id: u.id,
          order: u.order,
          name: u.name,
          summary: u.summary,
          mastery: mean(unitConcepts.map((c) => c.pKnown)),
          // True once any concept in the unit has an answer behind its pKnown; false means the number is a placement estimate.
          measured: unitConcepts.some((c) => attempted.has(c.id)),
          unlocked: u.unlockedAt !== null,
          concepts: unitConcepts,
        }
      }),
      edges,
    }
  })

export const getConceptItems = createServerFn({ method: 'GET' })
  .validator(z.object({ conceptId: z.string().min(1) }))
  .handler(async ({ data }): Promise<{ items: StoredItem[] }> => {
    const learnerId = await requireLearnerId()
    const db = getDb()
    const rows = await db
      .select({ item: items })
      .from(items)
      .innerJoin(topics, eq(topics.id, items.topicId))
      .innerJoin(learnerItem, and(eq(learnerItem.itemId, items.id), eq(learnerItem.learnerId, learnerId)))
      .where(and(eq(items.conceptId, data.conceptId), eq(items.status, 'active'), learnerCanAccess(db, learnerId)))
      .orderBy(desc(items.createdAt))
    return { items: rows.map((r) => asItem(r.item)) }
  })
