import { and, eq, exists, inArray, isNull, ne, sql } from 'drizzle-orm'
import { extractText, getDocumentProxy } from 'unpdf'
import { z } from 'zod'
import { getDb } from '@/db'
import { concepts, items, jobRoles, sources, topics } from '@/db/schema'
import { findSourceQuote } from '@/lib/curriculum/validate'
import { MAX_ROLE_DOCUMENT_BYTES, MAX_ROLE_DOCUMENT_CHARS } from '@/lib/limits'
import { APP_ORIGINS } from '@/server/auth-core'
import { requireOrgAdmin } from '@/server/authz'
import { drainConceptQueue } from '@/server/concept-gen'
import { getEnv, runInBackground } from '@/server/env'
import { httpError } from '@/server/helpers'

// Server-only: kept apart from role-documents.ts so the client bundle of that module (imported by the upload form) never reaches it.
const Fields = z.object({
  slug: z.string().min(1),
  roleId: z.string().min(1),
  title: z.string().trim().max(200).optional(),
  text: z.string().optional(),
  replacesId: z.string().min(1).max(100).optional(),
})

export const parseDocumentForm = (input: FormData) => {
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
}

// Rejected items keep their review outcome; only items learners can still see are retired.
export const LIVE = ['active', 'reported'] as const

const PDF_MAGIC = [0x25, 0x50, 0x44, 0x46, 0x2d] // %PDF-

export async function addRoleDocument(data: ReturnType<typeof parseDocumentForm>) {
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
  let sizeBytes: number | null = null
  let pageCount: number | null = null
  let failed = false
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
      pageCount = pdf.numPages
    } catch {
      throw httpError('This PDF could not be read', 422)
    }
    if (!bodyText) {
      // A new scan is kept as a failed source so the admin sees it; a replacement must never retire a live document for one.
      if (old) throw httpError('This PDF has no text layer. Paste the text instead.', 422)
      failed = true
    }
    kind = 'pdf'
    sizeBytes = file.size
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
  const status = failed ? 'failed' as const : 'ready' as const
  const error = failed ? 'No selectable text found. This looks like a scan.' : null
  // Replacing a failed source is a retry of the same version, not a new one.
  const version = old ? (old.status === 'failed' ? old.version : old.version + 1) : 1
  const newSource = { id, topicId, kind, title, bodyText, r2Key, sizeBytes, pageCount, version, uploadedBy: user.id, status, error, createdAt: now }
  try {
    if (!old) {
      await db.insert(sources).values(newSource)
    } else {
      const cited = await db.select().from(concepts).where(and(eq(concepts.sourceId, old.id), eq(concepts.topicId, topicId)))
      // Every statement is conditional at write time: a build may claim the topic, or the old document may be
      // retired, after the checks above. Only the first statement can insert the new source (fresh id), and the
      // rest run only if it did.
      const inserted = exists(db.select({ one: sql`1` }).from(sources).where(eq(sources.id, id)))
      // Misconceptions were drawn from the old text and may contradict the new one (reveals show them as mix-ups).
      const requeue = { sourceId: id, misconceptionsJson: '[]', genStatus: 'pending' as const, genStartedAt: null, genError: null }
      const [created] = await db.batch([
        db.insert(sources).select(
          db.select({
            id: sql<string>`${id}`.as('id'), topicId: sql<string>`${topicId}`.as('topicId'), kind: sql<typeof kind>`${kind}`.as('kind'), title: sql<string>`${title}`.as('title'),
            bodyText: sql<string>`${bodyText}`.as('bodyText'), r2Key: sql<string | null>`${r2Key}`.as('r2Key'),
            sizeBytes: sql<number | null>`${sizeBytes}`.as('sizeBytes'), pageCount: sql<number | null>`${pageCount}`.as('pageCount'), version: sql<number>`${version}`.as('version'),
            uploadedBy: sql<string>`${user.id}`.as('uploadedBy'), status: sql<'ready'>`${status}`.as('status'), error: sql<string | null>`${error}`.as('error'),
            retiredAt: sql<number | null>`${null}`.as('retiredAt'), deletedAt: sql<number | null>`${null}`.as('deletedAt'), createdAt: sql<number>`${now}`.as('createdAt'),
          }).from(topics).where(and(
            eq(topics.id, topicId), ne(topics.status, 'generating'),
            exists(db.select({ one: sql`1` }).from(sources).where(liveSource(old.id, topicId))),
          )),
        ).returning({ id: sources.id }),
        db.update(sources).set(old.status === 'failed' ? { deletedAt: now } : { retiredAt: now }).where(and(eq(sources.id, old.id), inserted)),
        db.update(items).set({ status: 'retired' })
          .where(and(eq(items.sourceId, old.id), eq(items.sourceVersion, old.version), inArray(items.status, LIVE), inserted)),
        ...cited.map((concept) => db.update(concepts).set({ ...requeue, sourceQuote: findSourceQuote(concept.sourceQuote, bodyText) })
          .where(and(eq(concepts.id, concept.id), inserted))),
        // Concepts published after the read above still cite the old version.
        db.update(concepts).set(requeue).where(and(eq(concepts.sourceId, old.id), inserted)),
      ])
      if (!created.length) {
        throw await refusal(topicId)
      }
    }
  } catch (error) {
    if (r2Key) await bucket.delete(r2Key).catch(() => {})
    throw error
  }
  if (old) runInBackground(drainConceptQueue())
  return { sourceId: id, topicId, r2Key, chars: bodyText.length, version, status }
}


// Why a conditional write changed nothing: a build claimed the topic, or the document is gone.
export const refusal = async (topicId: string) => {
  const topic = await getDb().select({ status: topics.status }).from(topics).where(eq(topics.id, topicId)).get()
  return topic?.status === 'generating' ? httpError('The curriculum is generating. Try again when it finishes.', 409) : httpError('Document not found', 404)
}

export const liveSource = (sourceId: string, topicId: string) =>
  and(eq(sources.id, sourceId), eq(sources.topicId, topicId), isNull(sources.deletedAt), isNull(sources.retiredAt))

// POST handler of the browser upload route; the company and role come from the URL, never the form.
export async function handleRoleDocumentPost(request: Request, params: { orgId: string; roleId: string }) {
  // A multipart POST can be sent cross-site without a preflight.
  // The same origins Better Auth trusts: this deployment's own URL and the app hosts.
  const origins = [new URL(getEnv().BETTER_AUTH_URL).origin, ...APP_ORIGINS]
  if (!origins.includes(request.headers.get('Origin') ?? '')) return Response.json({ error: 'Forbidden' }, { status: 403 })
  try {
    const form = await request.formData()
    form.set('slug', params.orgId)
    form.set('roleId', params.roleId)
    return Response.json(await addRoleDocument(parseDocumentForm(form)))
  } catch (error) {
    const status = (error as { status?: unknown }).status
    if (typeof status === 'number') return Response.json({ error: (error as Error).message }, { status })
    console.error('Role document upload failed', error)
    return Response.json({ error: 'Upload failed' }, { status: 500 })
  }
}
