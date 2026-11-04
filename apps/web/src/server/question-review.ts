import { createServerFn } from '@tanstack/react-start'
import { and, asc, desc, eq, inArray, isNull, ne } from 'drizzle-orm'
import { reportReasons } from '@learnquiz/api/reveal'
import { z } from 'zod'
import { getDb, type Db } from '@/db'
import { user } from '@/db/auth-schema'
import { attempts, concepts, itemFlags, items, jobRoles, sources, topics, units } from '@/db/schema'
import { findSourceQuote } from '@/lib/curriculum/validate'
import { ENABLED_FORMATS } from '@/lib/llm/prompts'
import { ItemPayload } from '@/lib/llm/schemas'
import { requireOrgAdmin } from '@/server/authz'
import { httpError } from '@/server/helpers'

export const reasonLabels: Record<string, string> = {
  ...Object.fromEntries(reportReasons.map((r) => [r.code, r.label])),
  'unfair-result': 'The result seems unfair',
}
const Slug = z.string().min(1).max(100)
const companyRoleIds = (db: Db, orgId: string) =>
  db.select({ id: jobRoles.id }).from(jobRoles).where(eq(jobRoles.orgId, orgId))

const answerText = (answerJson: string, payload: ItemPayload) => {
  const text = (id: unknown) => payload.options.find((o) => o.id === id)?.text ?? String(id)
  const a = JSON.parse(answerJson) as { optionId?: string; optionIds?: string[]; order?: string[]; text?: string }
  return a.optionId !== undefined ? text(a.optionId) : a.optionIds ? a.optionIds.map(text).join(', ') : a.order ? a.order.map(text).join(' → ') : a.text ?? ''
}

export const getQuestionReview = createServerFn({ method: 'GET' })
  .validator(z.object({ slug: Slug, roleId: z.string().min(1).optional() }))
  .handler(async ({ data }) => {
    const { org } = await requireOrgAdmin(data.slug)
    const db = getDb()
    const roles = await db.select({ id: jobRoles.id, name: jobRoles.name }).from(jobRoles)
      .where(and(eq(jobRoles.orgId, org.id), eq(jobRoles.status, 'active'))).orderBy(asc(jobRoles.createdAt))
    const role = data.roleId ? roles.find((r) => r.id === data.roleId) : roles[0]
    if (data.roleId && !role) throw httpError('Role not found', 404)
    const topic = role && await db.select({ id: topics.id }).from(topics).where(eq(topics.jobRoleId, role.id)).get()
    if (!role || !topic) return { name: org.name, roles, role: role ?? null, unreviewed: 0, units: [], sources: [] }
    const itemScope = db.select({ id: items.id }).from(items).where(eq(items.topicId, topic.id))
    const openFlags = and(inArray(itemFlags.itemId, itemScope), isNull(itemFlags.resolvedAt))
    const [unitRows, conceptRows, itemRows, flagRows, sourceRows, attemptRows] = await Promise.all([
      db.select({ id: units.id, name: units.name }).from(units).where(eq(units.topicId, topic.id)).orderBy(asc(units.order)),
      db.select({ id: concepts.id, unitId: concepts.unitId, name: concepts.name, critical: concepts.critical, sourceId: concepts.sourceId }).from(concepts)
        .where(eq(concepts.topicId, topic.id)).orderBy(asc(concepts.order)),
      db.select({ item: items, reviewerName: user.name }).from(items).leftJoin(user, eq(user.id, items.reviewedBy))
        .where(eq(items.topicId, topic.id)).orderBy(asc(items.createdAt)),
      db.select({ flag: itemFlags, reporterName: user.name }).from(itemFlags).leftJoin(user, eq(user.id, itemFlags.userId))
        .where(openFlags).orderBy(desc(itemFlags.createdAt)),
      db.select({ id: sources.id, title: sources.title, version: sources.version, deletedAt: sources.deletedAt, retiredAt: sources.retiredAt, status: sources.status }).from(sources)
        .where(eq(sources.topicId, topic.id)).orderBy(asc(sources.title)),
      db.select({ id: attempts.id, itemId: attempts.itemId, answerJson: attempts.answerJson, confidence: attempts.confidence }).from(attempts)
        .where(inArray(attempts.id, db.select({ id: itemFlags.attemptId }).from(itemFlags).where(openFlags))),
    ])
    const sourceById = new Map(sourceRows.map((s) => [s.id, s]))
    const conceptSource = new Map(conceptRows.map((c) => [c.id, c.sourceId]))
    const attemptById = new Map(attemptRows.map((a) => [a.id, a]))
    const flagged = new Set(flagRows.map((f) => f.flag.itemId))
    const isFlagged = (i: typeof items.$inferSelect) => i.status === 'reported' || flagged.has(i.id)
    const isUnreviewed = (i: typeof items.$inferSelect) => i.status === 'active' && i.reviewedAt === null && !isFlagged(i)
    const rank = (i: typeof items.$inferSelect) => isFlagged(i) ? 0 : isUnreviewed(i) ? 1 : 2
    const questions = itemRows.map(({ item: i, reviewerName }) => {
      const payload = JSON.parse(i.payloadJson) as ItemPayload
      const source = i.sourceId ? sourceById.get(i.sourceId) : undefined
      return { item: i, rank: rank(i), question: {
        id: i.id, status: i.status, difficulty: i.difficultyPrior, reviewedAt: i.reviewedAt, reviewerName, createdAt: i.createdAt,
        check: i.checkJson ? { reasons: (JSON.parse(i.checkJson) as { reasons?: string[] }).reasons ?? [] } : null,
        sourceId: i.sourceId ?? conceptSource.get(i.conceptId) ?? null,
        source: source ? { title: source.title, version: i.sourceVersion ?? source.version } : null,
        payload,
        flags: flagRows.filter((r) => r.flag.itemId === i.id).map(({ flag: f, reporterName: n }) => {
          const at = f.attemptId ? attemptById.get(f.attemptId) : undefined
          return { id: f.id, reporterId: f.userId, reporterName: n ?? f.userId, createdAt: f.createdAt, reason: f.reason, label: reasonLabels[f.reason] ?? f.reason, note: f.note,
            attempt: at && at.itemId === i.id ? { answer: answerText(at.answerJson, payload), confidence: at.confidence } : null }
        }),
      } }
    })
    return {
      name: org.name, roles, role,
      unreviewed: questions.filter((q) => q.rank === 1).length,
      sources: sourceRows.filter((s) => !s.deletedAt && !s.retiredAt && s.status !== 'failed').map((s) => ({ id: s.id, title: s.title, version: s.version })),
      units: unitRows.map((u) => ({ ...u, concepts: conceptRows.filter((c) => c.unitId === u.id).map((c) => {
        const own = questions.filter((q) => q.item.conceptId === c.id).sort((a, b) => a.rank - b.rank)
        return { id: c.id, name: c.name, critical: c.critical, questions: own.map((q) => q.question), counts: {
          total: own.length, unreviewed: own.filter((q) => q.rank === 1).length, flagged: own.filter((q) => q.rank === 0).length,
          rejected: own.filter((q) => q.item.status === 'rejected').length } }
      }) })),
    }
  })

export const reviewQuestion = createServerFn({ method: 'POST' })
  .validator(z.object({ slug: Slug, itemId: z.string().min(1), action: z.enum(['approve', 'edit', 'retire']), payload: z.unknown().optional(), sourceId: z.string().min(1).optional() }))
  .handler(async ({ data }): Promise<{ ok: true }> => {
    const { org, user } = await requireOrgAdmin(data.slug)
    const db = getDb()
    // Scope the read AND the write through items.topic_id, including forged item ids.
    const scope = and(eq(items.id, data.itemId), inArray(items.topicId, db.select({ id: topics.id }).from(topics).where(inArray(topics.jobRoleId, companyRoleIds(db, org.id)))))
    const row = await db.select({ item: items, concept: concepts, sourceText: sources.bodyText, sourceTitle: sources.title, sourceVersion: sources.version }).from(items)
      .innerJoin(concepts, and(eq(concepts.id, items.conceptId), eq(concepts.topicId, items.topicId)))
      .leftJoin(sources, and(eq(sources.id, concepts.sourceId), eq(sources.topicId, items.topicId)))
      .where(scope).get()
    if (!row) throw httpError('Question not found', 404)

    let changes: Partial<typeof items.$inferInsert>
    if (data.action === 'edit') {
      const parsed = ItemPayload.safeParse(data.payload)
      if (!parsed.success) throw httpError(`Invalid question: ${parsed.error.issues.map((i) => i.message).join('; ')}`, 400)
      const payload = parsed.data
      if (!ENABLED_FORMATS.includes(payload.format) && payload.format !== row.item.format) throw httpError(`Invalid question: ${payload.format} questions are not available yet`, 400)
      const previouslyGrounded = (JSON.parse(row.item.payloadJson) as ItemPayload).grounded
      const chosen = data.sourceId ? await db.select().from(sources).where(and(eq(sources.id, data.sourceId), eq(sources.topicId, row.item.topicId), isNull(sources.deletedAt), isNull(sources.retiredAt), ne(sources.status, 'failed'))).get() : undefined
      if (data.sourceId && !chosen) throw httpError('Choose a document from this role', 400)
      const doc = chosen ? { title: chosen.title, version: chosen.version } : row.sourceText !== null ? { title: row.sourceTitle, version: row.sourceVersion } : null
      const quote = findSourceQuote(payload.source_quote, chosen ? chosen.bodyText : row.sourceText ?? row.concept.sourceQuote)
      if (payload.source_quote !== null && !quote && doc) throw httpError(`This quote isn't in ${doc.title} v${doc.version}. Copy it exactly from the document.`, 400)
      if ((payload.source_quote !== null && !quote) ||
          ((row.concept.sourceId || row.concept.grounded || previouslyGrounded || payload.grounded) && (!quote || !payload.grounded))) {
        throw httpError('The source quote must match the source text, and a grounded question must keep a source quote.', 400)
      }
      payload.source_quote = quote
      changes = { payloadJson: JSON.stringify(payload), format: payload.format, difficultyPrior: payload.difficulty, checkJson: null, reviewedBy: null, reviewedAt: null, ...(chosen && { sourceId: chosen.id, sourceVersion: chosen.version }) }
    } else if (data.action === 'approve') {
      if (row.item.status === 'retired') throw httpError('Retired questions cannot be approved', 409)
      // Approval clears a learner flag so the question returns to sessions, which only serve 'active' items.
      changes = { status: 'active', reviewedBy: user.id, reviewedAt: Date.now() }
    } else {
      changes = { status: 'retired' }
    }
    const update = db.update(items).set(changes)
      .where(and(scope, data.action === 'approve' ? ne(items.status, 'retired') : undefined)).returning({ id: items.id })
    // D1 has no transactions: approving and resolving the item's open flags go in one batch.
    const [done] = data.action === 'approve'
      ? await db.batch([update, db.update(itemFlags).set({ resolvedAt: Date.now() })
        .where(and(eq(itemFlags.itemId, data.itemId), isNull(itemFlags.resolvedAt),
          inArray(itemFlags.itemId, db.select({ id: items.id }).from(items).where(and(eq(items.id, data.itemId), ne(items.status, 'retired'))))))])
      : [await update]
    if (!done.length) throw httpError('Question is no longer available', 409)
    return { ok: true }
  })
