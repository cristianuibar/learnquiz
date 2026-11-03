import { createServerFn } from '@tanstack/react-start'
import { and, asc, desc, eq, inArray, ne } from 'drizzle-orm'
import { z } from 'zod'
import { getDb, type Db } from '@/db'
import { concepts, items, jobRoles, sources, topics } from '@/db/schema'
import { findSourceQuote } from '@/lib/curriculum/validate'
import { ENABLED_FORMATS } from '@/lib/llm/prompts'
import { ItemPayload } from '@/lib/llm/schemas'
import { requireOrgAdmin } from '@/server/authz'
import { httpError } from '@/server/helpers'

const Slug = z.string().min(1).max(100)
const companyRoleIds = (db: Db, orgId: string) =>
  db.select({ id: jobRoles.id }).from(jobRoles).where(eq(jobRoles.orgId, orgId))

export const getQuestionReview = createServerFn({ method: 'GET' })
  .validator(z.object({ slug: Slug, topicId: z.string().min(1).optional() }))
  .handler(async ({ data }) => {
    const { org } = await requireOrgAdmin(data.slug)
    const db = getDb()
    const topicRows = await db.select({ id: topics.id, title: topics.title }).from(topics)
      .where(inArray(topics.jobRoleId, companyRoleIds(db, org.id))).orderBy(desc(topics.createdAt))
    const topic = data.topicId ? topicRows.find((t) => t.id === data.topicId) : topicRows[0]
    if (data.topicId && !topic) throw httpError('Topic not found', 404)
    if (!topic) return { name: org.name, topics: topicRows, topic: null, concepts: [] }
    const scope = db.select({ id: topics.id }).from(topics).where(and(eq(topics.id, topic.id), inArray(topics.jobRoleId, companyRoleIds(db, org.id))))
    const [conceptRows, itemRows] = await Promise.all([
      db.select({ id: concepts.id, name: concepts.name, sourceQuote: concepts.sourceQuote }).from(concepts)
        .where(inArray(concepts.topicId, scope)).orderBy(asc(concepts.unitId), asc(concepts.order)),
      db.select().from(items).where(inArray(items.topicId, scope)).orderBy(desc(items.createdAt)),
    ])
    return {
      name: org.name, topics: topicRows, topic,
      concepts: conceptRows.map((c) => ({ ...c, questions: itemRows.filter((i) => i.conceptId === c.id)
        .map((i) => ({ id: i.id, status: i.status, reviewedBy: i.reviewedBy, reviewedAt: i.reviewedAt, payload: JSON.parse(i.payloadJson) as ItemPayload })) })),
    }
  })

export const reviewQuestion = createServerFn({ method: 'POST' })
  .validator(z.object({ slug: Slug, itemId: z.string().min(1), action: z.enum(['approve', 'edit', 'retire']), payload: z.unknown().optional() }))
  .handler(async ({ data }): Promise<{ ok: true }> => {
    const { org, user } = await requireOrgAdmin(data.slug)
    const db = getDb()
    // Scope the read AND the write through items.topic_id, including forged item ids.
    const scope = and(eq(items.id, data.itemId), inArray(items.topicId, db.select({ id: topics.id }).from(topics).where(inArray(topics.jobRoleId, companyRoleIds(db, org.id)))))
    const row = await db.select({ item: items, concept: concepts, sourceText: sources.bodyText }).from(items)
      .innerJoin(concepts, and(eq(concepts.id, items.conceptId), eq(concepts.topicId, items.topicId)))
      .leftJoin(sources, and(eq(sources.id, concepts.sourceId), eq(sources.topicId, items.topicId)))
      .where(scope).get()
    if (!row) throw httpError('Question not found', 404)

    let changes: Partial<typeof items.$inferInsert>
    if (data.action === 'edit') {
      const parsed = ItemPayload.safeParse(data.payload)
      if (!parsed.success) throw httpError(`Invalid question: ${parsed.error.issues.map((i) => i.message).join('; ')}`, 400)
      const payload = parsed.data
      if (!ENABLED_FORMATS.includes(payload.format)) throw httpError(`Invalid question: ${payload.format} questions are not available yet`, 400)
      const previouslyGrounded = (JSON.parse(row.item.payloadJson) as ItemPayload).grounded
      const quote = findSourceQuote(payload.source_quote, row.sourceText ?? row.concept.sourceQuote)
      if ((payload.source_quote !== null && !quote) ||
          ((row.concept.sourceId || row.concept.grounded || previouslyGrounded || payload.grounded) && (!quote || !payload.grounded))) {
        throw httpError('The source quote must match the source text, and a grounded question must keep a source quote.', 400)
      }
      payload.source_quote = quote
      changes = { payloadJson: JSON.stringify(payload), format: payload.format, difficultyPrior: payload.difficulty, checkJson: null, reviewedBy: null, reviewedAt: null }
    } else if (data.action === 'approve') {
      if (row.item.status === 'retired') throw httpError('Retired questions cannot be approved', 409)
      // Approval clears a learner flag so the question returns to sessions, which only serve 'active' items.
      changes = { status: 'active', reviewedBy: user.id, reviewedAt: Date.now() }
    } else {
      changes = { status: 'retired' }
    }
    const done = await db.update(items).set(changes)
      .where(and(scope, data.action === 'approve' ? ne(items.status, 'retired') : undefined)).returning({ id: items.id })
    if (!done.length) throw httpError('Question is no longer available', 409)
    return { ok: true }
  })
