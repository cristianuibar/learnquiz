import { createServerFn } from '@tanstack/react-start'
import { and, asc, count, desc, eq } from 'drizzle-orm'
import { z } from 'zod'
import { getDb } from '@/db'
import { conceptEdges, concepts, items, learnerTopic, placements, sources, topics, units } from '@/db/schema'
import { validateSkeleton, fallbackSkeleton } from '@/lib/curriculum/validate'
import { chatJson, LlmError } from '@/lib/llm/client'
import { curriculumPrompt } from '@/lib/llm/prompts'
import { CurriculumSkeleton } from '@/lib/llm/schemas'
import { asItem, chunks, ensureConceptItems, httpError, loadPKnown, mean, targetFor, type StoredItem } from '@/server/helpers'
import { requireLearnerId } from '@/server/session'

export const createTopic = createServerFn({ method: 'POST' })
  .validator(
    z.object({
      topic: z.string().trim().min(2).max(200),
      goal: z.string().max(300).optional(),
      sourceText: z.string().max(400000).optional(),
    }),
  )
  .handler(async ({ data }): Promise<{ topicId: string }> => {
    const learnerId = await requireLearnerId()
    const db = getDb()
    const topicId = crypto.randomUUID()
    await db.insert(topics).values({ id: topicId, learnerId, title: data.topic, goal: data.goal ?? null, status: 'generating', createdAt: Date.now() })
    try {
      let sourceId: string | null = null
      if (data.sourceText) {
        sourceId = crypto.randomUUID()
        await db.insert(sources).values({ id: sourceId, topicId, kind: 'text', title: 'Pasted text', bodyText: data.sourceText, createdAt: Date.now() })
      }
      let skeleton: CurriculumSkeleton
      try {
        skeleton = await chatJson({
          purpose: 'curriculum',
          schema: CurriculumSkeleton,
          schemaName: 'curriculum_skeleton',
          ...curriculumPrompt({ topic: data.topic, goal: data.goal, levelHint: 3, sourceText: data.sourceText }),
          maxTokens: 16000, // measured: 8.6k tokens on a 30-concept topic, reasoning included
          learnerId,
        })
      } catch (e) {
        // Only invalid output falls back to the generic skeleton; a dead or unauthorised model must not look like success.
        if (!(e instanceof LlmError) || e.status !== 422) {
          throw httpError(`The model did not answer (${e instanceof LlmError ? e.status : 'error'}). Try again.`, 503)
        }
        console.error('curriculum output invalid, using fallback', e.message)
        skeleton = fallbackSkeleton(data.topic)
      }
      const valid = validateSkeleton(skeleton, data.sourceText)
      if (valid.notes.length) console.warn('curriculum notes', valid.notes)

      const unitRows = valid.units.map((u, order) => ({ id: u.id, topicId, order, name: u.name, summary: u.summary }))
      const conceptRows = valid.units.flatMap((u) =>
        u.concepts.map((c, order) => ({
          id: c.id,
          topicId,
          unitId: u.id,
          order,
          name: c.name,
          summary: c.summary,
          level: 3,
          sourceId,
          sourceQuote: c.sourceQuote,
          misconceptionsJson: JSON.stringify(c.misconceptions),
          grounded: c.grounded,
        })),
      )
      const edgeRows = valid.edges.map((e) => ({ topicId, ...e }))
      // One batch = one D1 transaction: the topic is 'ready' only when its whole path exists.
      await db.batch([
        db
          .insert(learnerTopic)
          .values({ learnerId, topicId, level: 3, rating: 1500 })
          .onConflictDoUpdate({ target: [learnerTopic.learnerId, learnerTopic.topicId], set: { level: 3, rating: 1500 } }),
        ...chunks(unitRows, 10).map((rows) => db.insert(units).values(rows)),
        ...chunks(conceptRows, 8).map((rows) => db.insert(concepts).values(rows)),
        ...chunks(edgeRows, 20).map((rows) => db.insert(conceptEdges).values(rows)),
        db.update(topics).set({ status: 'ready' }).where(eq(topics.id, topicId)),
      ])
      return { topicId }
    } catch (e) {
      // The status write must not mask the original error.
      await db.update(topics).set({ status: 'failed' }).where(eq(topics.id, topicId)).catch(() => {})
      throw e
    }
  })

export const getTopicPath = createServerFn({ method: 'GET' })
  .validator(z.object({ topicId: z.string().min(1) }))
  .handler(async ({ data }) => {
    const learnerId = await requireLearnerId()
    const db = getDb()
    const [topic] = await db
      .select({ id: topics.id, title: topics.title, goal: topics.goal, status: topics.status })
      .from(topics)
      .where(and(eq(topics.id, data.topicId), eq(topics.learnerId, learnerId)))
    if (!topic) throw httpError('Topic not found', 404)

    const [unitRows, conceptRows, edges, counts, known, [lt], [placement]] = await Promise.all([
      db.select().from(units).where(eq(units.topicId, topic.id)).orderBy(asc(units.order)),
      db.select().from(concepts).where(eq(concepts.topicId, topic.id)).orderBy(asc(concepts.order)),
      db.select({ fromId: conceptEdges.fromId, toId: conceptEdges.toId }).from(conceptEdges).where(eq(conceptEdges.topicId, topic.id)),
      db
        .select({ conceptId: items.conceptId, n: count() })
        .from(items)
        .where(and(eq(items.topicId, topic.id), eq(items.status, 'active')))
        .groupBy(items.conceptId),
      loadPKnown(db, learnerId, topic.id),
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
    const itemCount = new Map(counts.map((c) => [c.conceptId, c.n]))
    return {
      topic,
      // The reveal line lives in placements.log_json as { log, levelLine }.
      learner: {
        level: lt?.level ?? 3,
        levelLine: placement ? ((JSON.parse(placement.logJson) as { levelLine?: string }).levelLine ?? null) : null,
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
            grounded: c.grounded,
            itemCount: itemCount.get(c.id) ?? 0,
            pKnown: known.get(c.id) ?? 0,
          }))
        return {
          id: u.id,
          order: u.order,
          name: u.name,
          summary: u.summary,
          mastery: mean(unitConcepts.map((c) => c.pKnown)),
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
    const rows = await getDb()
      .select({ item: items })
      .from(items)
      .innerJoin(topics, eq(topics.id, items.topicId))
      .where(and(eq(items.conceptId, data.conceptId), eq(items.status, 'active'), eq(topics.learnerId, learnerId)))
      .orderBy(desc(items.createdAt))
    return { items: rows.map((r) => asItem(r.item)) }
  })

export const generateConceptItems = createServerFn({ method: 'POST' })
  .validator(z.object({ conceptId: z.string().min(1) }))
  .handler(async ({ data }): Promise<{ items: StoredItem[] }> => {
    const learnerId = await requireLearnerId()
    const db = getDb()
    const [row] = await db
      .select({ concept: concepts, topic: topics })
      .from(concepts)
      .innerJoin(topics, eq(topics.id, concepts.topicId))
      .where(and(eq(concepts.id, data.conceptId), eq(topics.learnerId, learnerId)))
    if (!row) throw httpError('Concept not found', 404)
    const [lt] = await db
      .select({ level: learnerTopic.level })
      .from(learnerTopic)
      .where(and(eq(learnerTopic.learnerId, learnerId), eq(learnerTopic.topicId, row.topic.id)))
    return { items: await ensureConceptItems(db, learnerId, row.concept, row.topic, { targetDifficulty: targetFor(lt?.level ?? 3) }) }
  })
