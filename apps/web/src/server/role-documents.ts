import { createServerFn } from '@tanstack/react-start'
import { and, eq, exists, inArray, ne, sql } from 'drizzle-orm'
import { z } from 'zod'
import { getDb } from '@/db'
import { concepts, items, jobRoles, sources, topics } from '@/db/schema'
import { requireOrgAdmin } from '@/server/authz'
import { httpError } from '@/server/helpers'
import { addRoleDocument, LIVE, liveSource, parseDocumentForm, refusal } from '@/server/role-document-upload'

export const uploadRoleDocument = createServerFn({ method: 'POST' })
  .validator((input: FormData) => parseDocumentForm(input))
  .handler(({ data }) => addRoleDocument(data))

export const retireRoleDocument = createServerFn({ method: 'POST' })
  .validator(z.object({ slug: z.string().min(1).max(100), roleId: z.string().min(1).max(100), sourceId: z.string().min(1).max(100) }))
  .handler(async ({ data }): Promise<{ ok: true }> => {
    const { org } = await requireOrgAdmin(data.slug)
    const db = getDb()
    const row = await db.select({ topic: topics }).from(jobRoles)
      .innerJoin(topics, eq(topics.jobRoleId, jobRoles.id))
      .where(and(eq(jobRoles.id, data.roleId), eq(jobRoles.orgId, org.id), eq(jobRoles.status, 'active'))).get()
    if (!row) throw httpError('Role topic not found', 404)
    if (row.topic.status === 'generating') throw httpError('The curriculum is generating. Try again when it finishes.', 409)
    const source = await db.select().from(sources).where(liveSource(data.sourceId, row.topic.id)).get()
    if (!source) throw httpError('Document not found', 404)
    // Conditional at write time: a build may claim the topic after the check above.
    const retiredAt = Date.now()
    const [retired] = await db.batch([
      db.update(sources).set({ retiredAt }).where(and(
        liveSource(source.id, row.topic.id),
        exists(db.select({ one: sql`1` }).from(topics).where(and(eq(topics.id, row.topic.id), ne(topics.status, 'generating')))),
      )).returning({ id: sources.id }),
      db.update(items).set({ status: 'retired' }).where(and(
        eq(items.sourceId, source.id), inArray(items.status, LIVE),
        exists(db.select({ one: sql`1` }).from(sources).where(and(eq(sources.id, source.id), eq(sources.retiredAt, retiredAt)))),
      )),
      db.update(concepts).set({ genStatus: 'failed', genError: 'The document behind this concept was retired', genStartedAt: null }).where(and(
        eq(concepts.sourceId, source.id),
        exists(db.select({ one: sql`1` }).from(sources).where(and(eq(sources.id, source.id), eq(sources.retiredAt, retiredAt)))),
      )),
    ])
    if (!retired.length) {
      throw await refusal(row.topic.id)
    }
    return { ok: true }
  })
