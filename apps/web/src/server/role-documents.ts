import { createServerFn } from '@tanstack/react-start'
import { and, asc, eq, exists, inArray, isNull, ne, sql } from 'drizzle-orm'
import { z } from 'zod'
import { getDb } from '@/db'
import { concepts, items, jobRoles, sources, topics } from '@/db/schema'
import { findSourceQuote } from '@/lib/curriculum/validate'
import { requireOrgAdmin } from '@/server/authz'
import { drainConceptQueue } from '@/server/concept-gen'
import { getEnv, runInBackground } from '@/server/env'
import { httpError } from '@/server/helpers'
import { addRoleDocument, LIVE, liveSource, parseDocumentForm, refusal } from '@/server/role-document-upload'

export const uploadRoleDocument = createServerFn({ method: 'POST' })
  .validator((input: FormData) => parseDocumentForm(input))
  .handler(({ data }) => addRoleDocument(data))

const SourceArgs = z.object({ slug: z.string().min(1).max(100), roleId: z.string().min(1).max(100), sourceId: z.string().min(1).max(100) })

async function roleTopic(slug: string, roleId: string) {
  const { org } = await requireOrgAdmin(slug)
  const row = await getDb().select({ topic: topics }).from(jobRoles)
    .innerJoin(topics, eq(topics.jobRoleId, jobRoles.id))
    .where(and(eq(jobRoles.id, roleId), eq(jobRoles.orgId, org.id), eq(jobRoles.status, 'active'))).get()
  if (!row) throw httpError('Role topic not found', 404)
  return row.topic
}

// Concepts citing the source, each with another live document that carries the same quote (if any).
async function citedConcepts(topicId: string, sourceId: string) {
  const db = getDb()
  const [cited, others] = await Promise.all([
    db.select().from(concepts).where(and(eq(concepts.sourceId, sourceId), eq(concepts.topicId, topicId))).orderBy(asc(concepts.order), asc(concepts.id)),
    db.select().from(sources).where(and(eq(sources.topicId, topicId), ne(sources.id, sourceId), isNull(sources.deletedAt), isNull(sources.retiredAt), ne(sources.status, 'failed')))
      .orderBy(asc(sources.createdAt), asc(sources.id)),
  ])
  return cited.map((concept) => {
    for (const other of others) {
      const quote = findSourceQuote(concept.sourceQuote, other.bodyText)
      if (quote) return { concept, other, quote }
    }
    return { concept, other: null, quote: null }
  })
}

export const previewRetireRoleDocument = createServerFn({ method: 'POST' })
  .validator(SourceArgs)
  .handler(async ({ data }): Promise<{ questions: number; alsoIn: { concept: string; document: string }[]; orphaned: number }> => {
    const topic = await roleTopic(data.slug, data.roleId)
    const db = getDb()
    const source = await db.select().from(sources).where(liveSource(data.sourceId, topic.id)).get()
    if (!source) throw httpError('Document not found', 404)
    const [cited, count] = await Promise.all([
      citedConcepts(topic.id, source.id),
      db.$count(items, and(eq(items.sourceId, source.id), inArray(items.status, LIVE))),
    ])
    const alsoIn = cited.flatMap((c) => c.other ? [{ concept: c.concept.name, document: `${c.other.title} v${c.other.version}` }] : [])
    return { questions: count, alsoIn, orphaned: cited.length - alsoIn.length }
  })

export const removeRoleDocument = createServerFn({ method: 'POST' })
  .validator(SourceArgs)
  .handler(async ({ data }): Promise<{ ok: true }> => {
    const topic = await roleTopic(data.slug, data.roleId)
    const [removed] = await getDb().update(sources).set({ deletedAt: Date.now() })
      .where(and(liveSource(data.sourceId, topic.id), eq(sources.status, 'failed'))).returning({ r2Key: sources.r2Key })
    if (!removed) throw httpError('Document not found', 404)
    if (removed.r2Key) await getEnv().MEDIA.delete(removed.r2Key).catch(() => {})
    return { ok: true }
  })

export const retireRoleDocument = createServerFn({ method: 'POST' })
  .validator(SourceArgs)
  .handler(async ({ data }): Promise<{ ok: true }> => {
    const topic = await roleTopic(data.slug, data.roleId)
    const db = getDb()
    if (topic.status === 'generating') throw httpError('The curriculum is generating. Try again when it finishes.', 409)
    const source = await db.select().from(sources).where(liveSource(data.sourceId, topic.id)).get()
    if (!source) throw httpError('Document not found', 404)
    const cited = await citedConcepts(topic.id, source.id)
    // Conditional at write time: a build may claim the topic after the check above.
    const retiredAt = Date.now()
    const retiredHere = exists(db.select({ one: sql`1` }).from(sources).where(and(eq(sources.id, source.id), eq(sources.retiredAt, retiredAt))))
    // Misconceptions were drawn from the old text and may contradict the other document.
    const requeue = { misconceptionsJson: '[]', genStatus: 'pending' as const, genStartedAt: null, genError: null }
    const moved = cited.filter((c) => c.other)
    const [retired] = await db.batch([
      db.update(sources).set({ retiredAt }).where(and(
        liveSource(source.id, topic.id),
        exists(db.select({ one: sql`1` }).from(topics).where(and(eq(topics.id, topic.id), ne(topics.status, 'generating')))),
      )).returning({ id: sources.id }),
      db.update(items).set({ status: 'retired' }).where(and(eq(items.sourceId, source.id), inArray(items.status, LIVE), retiredHere)),
      ...moved.map((c) => db.update(concepts).set({ ...requeue, sourceId: c.other!.id, sourceQuote: c.quote })
        .where(and(eq(concepts.id, c.concept.id), eq(concepts.sourceId, source.id), retiredHere))),
      db.update(concepts).set({ genStatus: 'failed', genError: 'The document behind this concept was retired', genStartedAt: null })
        .where(and(eq(concepts.sourceId, source.id), retiredHere)),
    ])
    if (!retired.length) {
      throw await refusal(topic.id)
    }
    if (moved.length) runInBackground(drainConceptQueue())
    return { ok: true }
  })
