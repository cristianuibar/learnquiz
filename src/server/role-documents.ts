import { createServerFn } from '@tanstack/react-start'
import { and, eq } from 'drizzle-orm'
import { extractText, getDocumentProxy } from 'unpdf'
import { z } from 'zod'
import { getDb } from '@/db'
import { jobRoles, sources, topics } from '@/db/schema'
import { MAX_ROLE_DOCUMENT_BYTES, MAX_ROLE_DOCUMENT_CHARS } from '@/lib/limits'
import { requireOrgAdmin } from '@/server/authz'
import { getEnv } from '@/server/env'
import { httpError } from '@/server/helpers'

const Fields = z.object({
  slug: z.string().min(1),
  roleId: z.string().min(1),
  title: z.string().trim().max(200).optional(),
  text: z.string().optional(),
})

const PDF_MAGIC = [0x25, 0x50, 0x44, 0x46, 0x2d] // %PDF-

export const uploadRoleDocument = createServerFn({ method: 'POST' })
  .validator((input: FormData) => {
    if (!(input instanceof FormData)) throw httpError('Expected a document form', 400)
    const str = (key: string) => {
      const v = input.get(key)
      return typeof v === 'string' ? v : undefined
    }
    const parsed = Fields.safeParse({ slug: str('slug'), roleId: str('roleId'), title: str('title'), text: str('text') })
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
    if (!['draft', 'failed'].includes(row.topic.status)) throw httpError('The curriculum is already generating or ready.', 409)

    let kind: 'pdf' | 'text'
    let title = data.title ?? ''
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
    try {
      await db.insert(sources).values({
        id, topicId, kind, title, bodyText, r2Key, version: 1, uploadedBy: user.id, status: 'ready', createdAt: Date.now(),
      })
    } catch (error) {
      if (r2Key) await bucket.delete(r2Key).catch(() => {})
      throw error
    }
    return { sourceId: id, topicId, r2Key, chars: bodyText.length }
  })
