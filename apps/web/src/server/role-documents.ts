import { createServerFn } from '@tanstack/react-start'
import { and, eq, inArray, isNull } from 'drizzle-orm'
import { extractText, getDocumentProxy } from 'unpdf'
import { z } from 'zod'
import { getDb } from '@/db'
import { concepts, items, jobRoles, sources, topics } from '@/db/schema'
import { findSourceQuote } from '@/lib/curriculum/validate'
import { MAX_ROLE_DOCUMENT_BYTES, MAX_ROLE_DOCUMENT_CHARS } from '@/lib/limits'
import { requireOrgAdmin } from '@/server/authz'
import { drainConceptQueue } from '@/server/concept-gen'
import { getEnv, runInBackground } from '@/server/env'
import { httpError } from '@/server/helpers'

const Fields = z.object({
  slug: z.string().min(1),
  roleId: z.string().min(1),
  title: z.string().trim().max(200).optional(),
  text: z.string().optional(),
  replacesId: z.string().min(1).max(100).optional(),
})

// Rejected items keep their review outcome; only items learners can still see are retired.
const LIVE = ['active', 'reported'] as const

const PDF_MAGIC = [0x25, 0x50, 0x44, 0x46, 0x2d] // %PDF-

export const uploadRoleDocument = createServerFn({ method: 'POST' })
  .validator((input: FormData) => {
    if (!(input instanceof FormData)) throw httpError('Expected a document form', 400)
    const str = (key: string) => {
      const v = input.get(key)
      return typeof v === 'string' ? v : undefined
    }
    const parsed = Fields.safeParse({ slug: str('slug'), roleId: str('roleId'), title: str('title'), text: str('text'), replacesId: str('replacesId') || undefined })
    if (!parsed.success) throw httpError(parsed.error.issues[0].message, 400)
    const f = input.get('file')
    const file = f instanceof File && f.size > 0 ? f : undefined
    const text = parsed.data.text?.trim() ? parsed.data.text : undefined
    if (Boolean(file) === Boolean(text)) throw httpError('Provide either a PDF or pasted text', 400)
    return { ...parsed.data, text, file }
  })
  .handler(async ({ data }) => {
    const { user, org } = await requireOrgAdmin(data.slug)
    const db = getDb()
    const row = await db.select({ topic: topics }).from(jobRoles)
      .innerJoin(topics, eq(topics.jobRoleId, jobRoles.id))
      .where(and(eq(jobRoles.id, data.roleId), eq(jobRoles.orgId, org.id), eq(jobRoles.status, 'active'))).get()
    if (!row) throw httpError('Role topic not found', 404)
    let old: typeof sources.$inferSelect | undefined
    if (data.replacesId) {
      if (row.topic.status === 'generating') throw httpError('The curriculum is generating. Try again when it finishes.', 409)
      old = await db.select().from(sources).where(liveSource(data.replacesId, row.topic.id)).get()
      if (!old) throw httpError('Document not found', 404)
    } else if (!['draft', 'failed'].includes(row.topic.status)) {
      throw httpError('The curriculum is already generating or ready.', 409)
    }

    let kind: 'pdf' | 'text'
    let title = data.title || old?.title || ''
    let bodyText: string
    let bytes: ArrayBuffer | undefined
    if (data.file) {
      const file = data.file
      if (file.size > MAX_ROLE_DOCUMENT_BYTES) throw httpError('Documents must be 10 MB or smaller', 413)
      bytes = await file.arrayBuffer()
      const head = new Uint8Array(bytes, 0, Math.min(5, bytes.byteLength))
      if (head.length < PDF_MAGIC.length || !PDF_MAGIC.every((v, i) => head[i] === v)) {
        throw httpError('Upload a PDF or paste the text', 415)
      }
      try {
        // pdf.js detaches the buffer it reads; extract from a copy so R2 gets the original bytes.
        const pdf = await getDocumentProxy(new Uint8Array(bytes.slice(0)))
        const { text } = await extractText(pdf, { mergePages: true })
        bodyText = text.trim()
      } catch {
        throw httpError('This PDF could not be read', 422)
      }
      if (!bodyText) throw httpError('This PDF has no text layer. Paste the text instead.', 422)
      kind = 'pdf'
      if (!title) title = file.name.replace(/\.pdf$/i, '').trim().slice(0, 200)
    } else {
      bodyText = data.text!.trim()
      kind = 'text'
      if (!title) throw httpError('Give the document a title', 400)
    }
    if (!title) title = 'Untitled document'
    if (bodyText.length > MAX_ROLE_DOCUMENT_CHARS) {
      throw httpError(`Documents are limited to ${MAX_ROLE_DOCUMENT_CHARS.toLocaleString('en-US')} characters`, 413)
    }

    const id = crypto.randomUUID()
    const topicId = row.topic.id
    const r2Key = bytes ? `orgs/${org.id}/roles/${data.roleId}/sources/${id}.pdf` : null
    const bucket = getEnv().MEDIA
    if (r2Key && bytes) await bucket.put(r2Key, bytes, { httpMetadata: { contentType: 'application/pdf' } })
    const now = Date.now()
    const version = old ? old.version + 1 : 1
    const newSource = { id, topicId, kind, title, bodyText, r2Key, version, uploadedBy: user.id, status: 'ready' as const, createdAt: now }
    let requeued = 0
    try {
      if (!old) {
        await db.insert(sources).values(newSource)
      } else {
        const cited = await db.select().from(concepts).where(and(eq(concepts.sourceId, old.id), eq(concepts.topicId, topicId)))
        requeued = cited.length
        await db.batch([
          db.insert(sources).values(newSource),
          db.update(sources).set({ retiredAt: now }).where(eq(sources.id, old.id)),
          db.update(items).set({ status: 'retired' })
            .where(and(eq(items.sourceId, old.id), eq(items.sourceVersion, old.version), inArray(items.status, LIVE))),
          ...cited.map((concept) => db.update(concepts).set({
            sourceId: id, sourceQuote: findSourceQuote(concept.sourceQuote, bodyText), genStatus: 'pending', genStartedAt: null, genError: null,
          }).where(eq(concepts.id, concept.id))),
        ])
      }
    } catch (error) {
      if (r2Key) await bucket.delete(r2Key).catch(() => {})
      throw error
    }
    if (requeued) runInBackground(drainConceptQueue())
    return { sourceId: id, topicId, r2Key, chars: bodyText.length, version }
  })

const liveSource = (sourceId: string, topicId: string) =>
  and(eq(sources.id, sourceId), eq(sources.topicId, topicId), isNull(sources.deletedAt), isNull(sources.retiredAt))

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
    await db.batch([
      db.update(sources).set({ retiredAt: Date.now() }).where(eq(sources.id, source.id)),
      db.update(items).set({ status: 'retired' }).where(and(eq(items.sourceId, source.id), inArray(items.status, LIVE))),
    ])
    return { ok: true }
  })
