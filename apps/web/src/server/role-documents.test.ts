import { readFileSync, readdirSync } from 'node:fs'
import { DatabaseSync } from 'node:sqlite'
import { drizzle } from 'drizzle-orm/sqlite-proxy'
import { afterAll, afterEach, beforeAll, beforeEach, expect, it, vi } from 'vitest'
import * as schema from '@/db/schema'
import * as authSchema from '@/db/auth-schema'

const state = vi.hoisted(() => ({ db: null as unknown, user: 'owner-a' as string | null, active: null as string | null, anonymous: false, bucket: { put: vi.fn(), delete: vi.fn() }, background: [] as Promise<unknown>[] }))
const drain = vi.hoisted(() => vi.fn())

// Fake only the server transport, session and Cloudflare bindings. Validators,
// admin checks, SQL, PDF extraction and the upload handler execute for real.
vi.mock('@tanstack/react-start', () => ({
  createServerFn: () => {
    const builder = (validate: (value: unknown) => unknown = (value) => value) => ({
      validator: (schema: { parse?: (value: unknown) => unknown } | ((value: unknown) => unknown)) => builder(typeof schema === 'function' ? schema : (value) => schema.parse!(value)),
      handler: (handler: (input: { data: unknown }) => unknown) => (input?: { data: unknown }) => handler({ data: validate(input?.data) }),
    })
    return builder()
  },
  createServerOnlyFn: (fn: unknown) => fn,
}))
vi.mock('@tanstack/react-start/server', () => ({ getRequestHeaders: () => new Headers() }))
vi.mock('@/db', () => ({ getDb: () => state.db }))
vi.mock('@/server/env', () => ({ getEnv: () => ({ MEDIA: state.bucket, BETTER_AUTH_URL: 'http://127.0.0.1:8800' }), drainsOnRequest: () => false, runInBackground: (task: Promise<unknown>) => { state.background.push(task) } }))
vi.mock('@/server/concept-gen', () => ({ drainConceptQueue: drain }))
vi.mock('@/server/session', () => ({ getSessionUser: async () => state.user ? { id: state.user, isAnonymous: state.anonymous } : null }))
vi.mock('@/server/auth', () => ({ getAuth: () => ({ api: { getSession: async () => state.user ? { user: { id: state.user, isAnonymous: state.anonymous }, session: { activeOrganizationId: state.active } } : null } }) }))

import { MAX_ROLE_DOCUMENT_BYTES, MAX_ROLE_DOCUMENT_CHARS } from '@/lib/limits'
import { Route } from '@/routes/api/org.$orgId.roles.$roleId.documents'
import { listRoles } from './org'
import { previewRetireRoleDocument, removeRoleDocument, retireRoleDocument, uploadRoleDocument } from './role-documents'

let sqlite: DatabaseSync
// One-shot hook: runs just before the next SQL statement that starts with the given prefix.
let beforeSql: { prefix: string; fn: () => void } | null = null
beforeAll(() => {
  sqlite = new DatabaseSync(':memory:')
  for (const file of readdirSync('drizzle').filter((f) => f.endsWith('.sql')).sort()) {
    sqlite.exec(readFileSync(`drizzle/${file}`, 'utf8').replaceAll('--> statement-breakpoint', ''))
  }
  for (const id of ['owner-a', 'member-a', 'owner-b']) {
    sqlite.prepare('INSERT INTO user (id, name, email) VALUES (?, ?, ?)').run(id, id, `${id}@example.test`)
  }
  for (const [id, slug] of [['org-a', 'acme'], ['org-b', 'globex']]) {
    sqlite.prepare('INSERT INTO organization (id, name, slug, created_at) VALUES (?, ?, ?, ?)').run(id, slug, slug, 1)
  }
  for (const [user, org, role] of [['owner-a', 'org-a', 'owner'], ['member-a', 'org-a', 'member'], ['owner-b', 'org-b', 'owner']]) {
    sqlite.prepare('INSERT INTO member (id, organization_id, user_id, role, created_at) VALUES (?, ?, ?, ?, ?)').run(user, org, user, role, 1)
  }
  for (const [role, org] of [['role-a', 'org-a'], ['role-b', 'org-b']]) {
    sqlite.prepare('INSERT INTO job_roles (id, org_id, name, created_at) VALUES (?, ?, ?, ?)').run(role, org, role, 1)
    sqlite.prepare("INSERT INTO topics (id, org_id, job_role_id, title, status, created_at) VALUES (?, ?, ?, ?, 'draft', ?)").run(`topic-${role}`, org, role, role, 1)
  }
  const run = (sql: string, params: unknown[], method: string) => {
    if (params.length > 100) throw new Error(`D1_ERROR: too many SQL variables (${params.length} > 100)`)
    if (beforeSql && sql.startsWith(beforeSql.prefix)) { const { fn } = beforeSql; beforeSql = null; fn() }
    const statement = sqlite.prepare(sql)
    statement.setReturnArrays(true)
    const args = params as (string | number | null)[]
    if (method === 'run') { statement.run(...args); return { rows: [] } }
    return { rows: (method === 'get' ? statement.get(...args) : statement.all(...args)) as unknown[] }
  }
  state.db = drizzle(async (sql, params, method) => run(sql, params, method), async (queries) => {
    sqlite.exec('SAVEPOINT batch')
    try {
      const results = queries.map((query) => run(query.sql, query.params, query.method))
      sqlite.exec('RELEASE batch')
      return results
    } catch (error) { sqlite.exec('ROLLBACK TO batch; RELEASE batch'); throw error }
  }, { schema: { ...schema, ...authSchema } })
})
beforeEach(() => {
  sqlite.exec('BEGIN')
  state.user = 'owner-a'
  state.active = null
  state.anonymous = false
  vi.resetAllMocks()
  state.bucket.put.mockResolvedValue({})
  state.bucket.delete.mockResolvedValue(undefined)
  drain.mockResolvedValue(undefined)
  state.background = []
  beforeSql = null
})
afterEach(() => sqlite.exec('ROLLBACK'))
afterAll(() => sqlite.close())

const SENTENCE = 'Forklifts stop at the red line.'

// Minimal PDF 1.4 with one Helvetica page; xref offsets are computed from the bytes.
function pdf(content: string) {
  const objects = [
    '<< /Type /Catalog /Pages 2 0 R >>',
    '<< /Type /Pages /Kids [3 0 R] /Count 1 >>',
    '<< /Type /Page /Parent 2 0 R /MediaBox [0 0 612 792] /Contents 4 0 R /Resources << /Font << /F1 5 0 R >> >> >>',
    `<< /Length ${content.length} >>\nstream\n${content}\nendstream`,
    '<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica >>',
  ]
  let out = '%PDF-1.4\n'
  const offsets = objects.map((object, i) => {
    const offset = out.length
    out += `${i + 1} 0 obj\n${object}\nendobj\n`
    return offset
  })
  const xref = out.length
  out += `xref\n0 ${objects.length + 1}\n0000000000 65535 f \n`
  for (const offset of offsets) out += `${String(offset).padStart(10, '0')} 00000 n \n`
  out += `trailer\n<< /Size ${objects.length + 1} /Root 1 0 R >>\nstartxref\n${xref}\n%%EOF\n`
  return new File([Buffer.from(out, 'latin1')], 'Forklift Safety.pdf', { type: 'application/pdf' })
}
const textPdf = () => pdf(`BT /F1 12 Tf 72 720 Td (${SENTENCE}) Tj ET`)

function form(fields: Record<string, string | File>) {
  const data = new FormData()
  for (const [key, value] of Object.entries({ slug: 'acme', roleId: 'role-a', ...fields })) data.set(key, value)
  return data
}
const sourceRows = () => sqlite.prepare('SELECT * FROM sources').all()

it('stores an uploaded PDF in R2 and records its extracted text against the role topic', async () => {
  const result = await uploadRoleDocument({ data: form({ file: textPdf() }) })
  const key = `orgs/org-a/roles/role-a/sources/${result.sourceId}.pdf`
  expect(result).toEqual({ sourceId: result.sourceId, topicId: 'topic-role-a', r2Key: key, chars: SENTENCE.length, version: 1, status: 'ready' })
  expect(state.bucket.put).toHaveBeenCalledTimes(1)
  expect(state.bucket.put.mock.calls[0][0]).toBe(key)
  expect(state.bucket.put.mock.calls[0][1].byteLength).toBe((await textPdf().arrayBuffer()).byteLength)
  expect(sqlite.prepare('SELECT * FROM sources WHERE id = ?').get(result.sourceId)).toMatchObject({
    topic_id: 'topic-role-a', kind: 'pdf', version: 1, uploaded_by: 'owner-a', r2_key: key, title: 'Forklift Safety', body_text: SENTENCE,
    size_bytes: textPdf().size, page_count: 1,
  })
})

it('leaves size and page count empty for pasted text', async () => {
  const result = await uploadRoleDocument({ data: form({ title: 'Dock rules', text: 'Always wear a vest on the dock.' }) })
  expect(sqlite.prepare('SELECT size_bytes, page_count FROM sources WHERE id = ?').get(result.sourceId)).toEqual({ size_bytes: null, page_count: null })
})

it.each([
  ['an admin of another company', 'owner-b', 'acme', 'role-a', 403],
  ['a plain member', 'member-a', 'acme', 'role-a', 403],
  ['an admin using a role of another company', 'owner-b', 'globex', 'role-a', 404],
] as const)('refuses %s before any storage write or row', async (_label, user, slug, roleId, status) => {
  state.user = user
  await expect(uploadRoleDocument({ data: form({ slug, roleId, file: textPdf() }) })).rejects.toMatchObject({ status })
  expect(state.bucket.put).not.toHaveBeenCalled()
  expect(sourceRows()).toEqual([])
})

it('stores a PDF with no text layer as a failed source that keeps its original', async () => {
  const result = await uploadRoleDocument({ data: form({ file: pdf('') }) })
  const key = `orgs/org-a/roles/role-a/sources/${result.sourceId}.pdf`
  expect(result).toEqual({ sourceId: result.sourceId, topicId: 'topic-role-a', r2Key: key, chars: 0, version: 1, status: 'failed' })
  expect(state.bucket.put).toHaveBeenCalledTimes(1)
  expect(state.bucket.put.mock.calls[0][0]).toBe(key)
  expect(sourceRows()).toEqual([expect.objectContaining({
    id: result.sourceId, status: 'failed', error: 'No selectable text found. This looks like a scan.', body_text: '', r2_key: key,
    size_bytes: pdf('').size, page_count: 1, version: 1, title: 'Forklift Safety', deleted_at: null, retired_at: null,
  })])
})

it('still refuses a replacement PDF with no text layer, leaving the live document alone', async () => {
  seedV1()
  await expect(uploadRoleDocument({ data: form({ replacesId: 'src-1', file: pdf('') }) })).rejects.toMatchObject({ status: 422 })
  expect(state.bucket.put).not.toHaveBeenCalled()
  expect(sqlite.prepare('SELECT id, retired_at, status FROM sources').all()).toEqual([{ id: 'src-1', retired_at: null, status: 'ready' }])
})

it('replacing a failed source removes it from the list and keeps its version', async () => {
  const failed = await uploadRoleDocument({ data: form({ file: pdf('') }) })
  const result = await uploadRoleDocument({ data: form({ replacesId: failed.sourceId, text: 'Wear a vest on the dock.', title: 'Dock rules' }) })
  expect(result).toMatchObject({ version: 1, status: 'ready' })
  expect(sqlite.prepare('SELECT id, status, version, retired_at, deleted_at IS NOT NULL AS deleted FROM sources ORDER BY created_at, id').all()).toEqual(
    expect.arrayContaining([
      { id: failed.sourceId, status: 'failed', version: 1, retired_at: null, deleted: 1 },
      { id: result.sourceId, status: 'ready', version: 1, retired_at: null, deleted: 0 },
    ]),
  )
})

it('rejects pasted text over the cap and saves pasted text within it as a text source without R2', async () => {
  await expect(uploadRoleDocument({ data: form({ title: 'Too long', text: 'a'.repeat(MAX_ROLE_DOCUMENT_CHARS + 1) }) })).rejects.toMatchObject({ status: 413 })
  expect(sourceRows()).toEqual([])
  const result = await uploadRoleDocument({ data: form({ title: 'Dock rules', text: 'Wear a vest on the dock.' }) })
  expect(result).toEqual({ sourceId: result.sourceId, topicId: 'topic-role-a', r2Key: null, chars: 24, version: 1, status: 'ready' })
  expect(sqlite.prepare('SELECT * FROM sources').all()).toEqual([expect.objectContaining({
    id: result.sourceId, kind: 'text', title: 'Dock rules', body_text: 'Wear a vest on the dock.', r2_key: null, version: 1, uploaded_by: 'owner-a',
  })])
  expect(state.bucket.put).not.toHaveBeenCalled()
})

// Topic "topic-role-a" holds a v1 source, a concept citing it, two active v1 items and one unrelated item.
function seedV1(topicStatus = 'ready') {
  sqlite.prepare('UPDATE topics SET status = ? WHERE id = ?').run(topicStatus, 'topic-role-a')
  sqlite.prepare("INSERT INTO sources (id, topic_id, kind, title, body_text, version, status, created_at) VALUES ('src-1', 'topic-role-a', 'text', 'Dock rules', 'Wear a vest on the dock.', 1, 'ready', 1)").run()
  sqlite.prepare("INSERT INTO units (id, topic_id, `order`, name) VALUES ('unit-1', 'topic-role-a', 0, 'Unit')").run()
  sqlite.prepare("INSERT INTO concepts (id, topic_id, unit_id, `order`, name, summary, source_id, source_quote, gen_status) VALUES ('con-1', 'topic-role-a', 'unit-1', 0, 'Vests', 'Vests', 'src-1', 'wear a vest', 'ready')").run()
  const item = sqlite.prepare("INSERT INTO items (id, concept_id, topic_id, format, payload_json, source_id, source_version, status, created_at) VALUES (?, 'con-1', 'topic-role-a', 'mcq', '{}', ?, ?, 'active', 1)")
  item.run('item-1', 'src-1', 1)
  item.run('item-2', 'src-1', 1)
  item.run('item-other', null, null)
}
const itemStatus = () => Object.fromEntries((sqlite.prepare('SELECT id, status FROM items ORDER BY id').all() as { id: string; status: string }[]).map((r) => [r.id, r.status]))

it('replaces a document with version 2, retires its items and requeues the concepts that cited it without draining on the request', async () => {
  seedV1()
  const result = await uploadRoleDocument({ data: form({ replacesId: 'src-1', text: 'Always wear a vest on the dock.' }) })
  expect(result).toEqual({ sourceId: result.sourceId, topicId: 'topic-role-a', r2Key: null, chars: 31, version: 2, status: 'ready' })
  expect(sqlite.prepare('SELECT title, version, body_text FROM sources WHERE id = ?').get(result.sourceId)).toEqual({ title: 'Dock rules', version: 2, body_text: 'Always wear a vest on the dock.' })
  expect(sqlite.prepare("SELECT retired_at IS NOT NULL AS retired FROM sources WHERE id = 'src-1'").get()).toEqual({ retired: 1 })
  expect(sqlite.prepare("SELECT count(*) AS n FROM items WHERE source_id = 'src-1' AND status != 'retired'").get()).toEqual({ n: 0 })
  expect(itemStatus()).toEqual({ 'item-1': 'retired', 'item-2': 'retired', 'item-other': 'active' })
  expect(sqlite.prepare("SELECT source_id, source_quote, gen_status, gen_started_at, gen_error FROM concepts WHERE id = 'con-1'").get())
    .toEqual({ source_id: result.sourceId, source_quote: 'wear a vest', gen_status: 'pending', gen_started_at: null, gen_error: null })
  expect(drain).not.toHaveBeenCalled()
  expect(state.background).toHaveLength(0)
})

it('records the size and page count of a replacement PDF', async () => {
  seedV1()
  const result = await uploadRoleDocument({ data: form({ replacesId: 'src-1', file: textPdf() }) })
  expect(sqlite.prepare('SELECT version, size_bytes, page_count FROM sources WHERE id = ?').get(result.sourceId)).toEqual({ version: 2, size_bytes: textPdf().size, page_count: 1 })
})

it('drops the misconceptions drawn from the old version, so reveals stop correcting what V2 now requires', async () => {
  seedV1()
  sqlite.prepare("UPDATE concepts SET misconceptions_json = ? WHERE id = 'con-1'").run(JSON.stringify(['Placing 8 cones is enough']))
  beforeSql = {
    prefix: 'insert into "sources"',
    fn: () => sqlite.prepare("INSERT INTO concepts (id, topic_id, unit_id, `order`, name, summary, source_id, misconceptions_json, gen_status) VALUES ('con-late', 'topic-role-a', 'unit-1', 1, 'Late', 'Late', 'src-1', '[\"Placing 8 cones is enough\"]', 'ready')").run(),
  }
  await uploadRoleDocument({ data: form({ replacesId: 'src-1', text: 'Place 8 cones around the dock.' }) })
  expect(sqlite.prepare('SELECT id, misconceptions_json FROM concepts ORDER BY id').all()).toEqual([
    { id: 'con-1', misconceptions_json: '[]' },
    { id: 'con-late', misconceptions_json: '[]' },
  ])
})

it('refuses a replacement while the curriculum is generating', async () => {
  seedV1('generating')
  await expect(uploadRoleDocument({ data: form({ replacesId: 'src-1', text: 'New text.' }) })).rejects.toMatchObject({ status: 409 })
  expect(sqlite.prepare('SELECT count(*) AS n FROM sources').get()).toEqual({ n: 1 })
  expect(itemStatus()['item-1']).toBe('active')
  expect(drain).not.toHaveBeenCalled()
})

it('refuses a replacement when a build claims the topic after the check, leaving everything untouched', async () => {
  seedV1()
  state.bucket.put.mockImplementation(async () => { sqlite.prepare("UPDATE topics SET status = 'generating' WHERE id = 'topic-role-a'").run(); return {} })
  await expect(uploadRoleDocument({ data: form({ replacesId: 'src-1', file: textPdf() }) })).rejects.toMatchObject({ status: 409 })
  expect(sqlite.prepare('SELECT id, retired_at FROM sources').all()).toEqual([{ id: 'src-1', retired_at: null }])
  expect(itemStatus()).toEqual({ 'item-1': 'active', 'item-2': 'active', 'item-other': 'active' })
  expect(sqlite.prepare("SELECT source_id, source_quote, gen_status FROM concepts WHERE id = 'con-1'").get()).toEqual({ source_id: 'src-1', source_quote: 'wear a vest', gen_status: 'ready' })
  expect(state.bucket.delete).toHaveBeenCalledWith(state.bucket.put.mock.calls[0][0])
  expect(drain).not.toHaveBeenCalled()
  expect(state.background).toHaveLength(0)
})

it('repoints a concept published after the concept read but before the replacement is written', async () => {
  seedV1()
  beforeSql = {
    prefix: 'insert into "sources"',
    fn: () => sqlite.prepare("INSERT INTO concepts (id, topic_id, unit_id, `order`, name, summary, source_id, source_quote, gen_status) VALUES ('con-late', 'topic-role-a', 'unit-1', 1, 'Late', 'Late', 'src-1', 'late quote', 'ready')").run(),
  }
  const result = await uploadRoleDocument({ data: form({ replacesId: 'src-1', text: 'Always wear a vest on the dock.' }) })
  expect(beforeSql).toBeNull()
  expect(sqlite.prepare("SELECT id, source_id, gen_status, gen_started_at, gen_error FROM concepts ORDER BY id").all()).toEqual([
    { id: 'con-1', source_id: result.sourceId, gen_status: 'pending', gen_started_at: null, gen_error: null },
    { id: 'con-late', source_id: result.sourceId, gen_status: 'pending', gen_started_at: null, gen_error: null },
  ])
  expect(drain).not.toHaveBeenCalled()
})

it('refuses retiring a document when a build claims the topic after the check', async () => {
  seedV1()
  beforeSql = { prefix: 'update "sources"', fn: () => sqlite.prepare("UPDATE topics SET status = 'generating' WHERE id = 'topic-role-a'").run() }
  await expect(retireRoleDocument({ data: { slug: 'acme', roleId: 'role-a', sourceId: 'src-1' } })).rejects.toMatchObject({ status: 409 })
  expect(sqlite.prepare("SELECT retired_at FROM sources WHERE id = 'src-1'").get()).toEqual({ retired_at: null })
  expect(itemStatus()['item-1']).toBe('active')
})

it('refuses to replace a document that is already retired', async () => {
  seedV1()
  sqlite.prepare("UPDATE sources SET retired_at = 5 WHERE id = 'src-1'").run()
  await expect(uploadRoleDocument({ data: form({ replacesId: 'src-1', text: 'New text.' }) })).rejects.toMatchObject({ status: 404, message: 'Document not found' })
  expect(sqlite.prepare('SELECT count(*) AS n FROM sources').get()).toEqual({ n: 1 })
})

it('retires a document and its items without touching other items', async () => {
  seedV1()
  await expect(retireRoleDocument({ data: { slug: 'acme', roleId: 'role-a', sourceId: 'src-1' } })).resolves.toEqual({ ok: true })
  expect(sqlite.prepare("SELECT retired_at IS NOT NULL AS retired FROM sources WHERE id = 'src-1'").get()).toEqual({ retired: 1 })
  expect(itemStatus()).toEqual({ 'item-1': 'retired', 'item-2': 'retired', 'item-other': 'active' })
  expect(sqlite.prepare("SELECT gen_status, gen_error, gen_started_at FROM concepts WHERE id = 'con-1'").get())
    .toEqual({ gen_status: 'failed', gen_error: 'The document behind this concept was retired', gen_started_at: null })
  await expect(retireRoleDocument({ data: { slug: 'acme', roleId: 'role-a', sourceId: 'src-1' } })).rejects.toMatchObject({ status: 404 })
})

it('counts only the failed scan once the last readable document of a ready role is retired', async () => {
  seedV1()
  sqlite.prepare("INSERT INTO sources (id, topic_id, kind, title, body_text, version, status, created_at) VALUES ('src-scan', 'topic-role-a', 'pdf', 'Scan', '', 1, 'failed', 2)").run()
  await retireRoleDocument({ data: { slug: 'acme', roleId: 'role-a', sourceId: 'src-1' } })
  expect((await listRoles({ data: { slug: 'acme' } })).roles).toEqual([
    expect.objectContaining({ id: 'role-a', topicStatus: 'ready', documentCount: 1, failedDocuments: 1 }),
  ])
})

it('refuses retiring a document for a plain member', async () => {
  seedV1()
  state.user = 'member-a'
  await expect(retireRoleDocument({ data: { slug: 'acme', roleId: 'role-a', sourceId: 'src-1' } })).rejects.toMatchObject({ status: 403 })
  expect(itemStatus()['item-1']).toBe('active')
})

const ids = { slug: 'acme', roleId: 'role-a' }

it.each([
  ['a failed document', 'failed', 'owner-a', 'topic-role-a', undefined],
  ['a ready document', 'ready', 'owner-a', 'topic-role-a', 404],
  ['a failed document of another role', 'failed', 'owner-a', 'topic-role-b', 404],
  ['a failed document for a plain member', 'failed', 'member-a', 'topic-role-a', 403],
] as const)('removeRoleDocument: %s', async (_label, status, user, topicId, refused) => {
  sqlite.prepare("INSERT INTO sources (id, topic_id, kind, title, body_text, r2_key, version, status, created_at) VALUES ('src-x', ?, 'pdf', 'Scan', '', 'k/x.pdf', 1, ?, 1)").run(topicId, status)
  state.user = user
  const call = removeRoleDocument({ data: { ...ids, sourceId: 'src-x' } })
  if (refused) {
    await expect(call).rejects.toMatchObject({ status: refused })
    expect(sqlite.prepare("SELECT deleted_at FROM sources WHERE id = 'src-x'").get()).toEqual({ deleted_at: null })
    expect(state.bucket.delete).not.toHaveBeenCalled()
  } else {
    await expect(call).resolves.toEqual({ ok: true })
    expect(sqlite.prepare("SELECT deleted_at IS NOT NULL AS deleted FROM sources WHERE id = 'src-x'").get()).toEqual({ deleted: 1 })
    expect(state.bucket.delete).toHaveBeenCalledWith('k/x.pdf')
    await expect(removeRoleDocument({ data: { ...ids, sourceId: 'src-x' } })).rejects.toMatchObject({ status: 404 })
  }
})

// src-1 (Dock rules) also holds con-1 (quote in src-2 too) and con-2 (quote only in src-1); a failed scan never counts.
function seedShared() {
  seedV1()
  sqlite.prepare("UPDATE sources SET body_text = 'Wear a vest on the dock. Stop at the red line.' WHERE id = 'src-1'").run()
  sqlite.prepare("INSERT INTO sources (id, topic_id, kind, title, body_text, version, status, created_at) VALUES ('src-2', 'topic-role-a', 'text', 'Site guide', 'Everyone must Wear a  vest on the dock.', 3, 'ready', 2)").run()
  sqlite.prepare("INSERT INTO sources (id, topic_id, kind, title, body_text, version, status, created_at) VALUES ('src-3', 'topic-role-a', 'pdf', 'Scan', '', 1, 'failed', 3)").run()
  sqlite.prepare("INSERT INTO concepts (id, topic_id, unit_id, `order`, name, summary, source_id, source_quote, gen_status) VALUES ('con-2', 'topic-role-a', 'unit-1', 1, 'Line', 'Line', 'src-1', 'stop at the red line', 'ready')").run()
}

it('previews a retire: question count, concepts another document also covers, and orphans', async () => {
  seedShared()
  await expect(previewRetireRoleDocument({ data: { ...ids, sourceId: 'src-1' } })).resolves.toEqual({
    questions: 2, alsoIn: [{ concept: 'Vests', document: 'Site guide v3' }], orphaned: 1,
  })
  expect(sqlite.prepare('SELECT count(*) AS n FROM sources WHERE retired_at IS NOT NULL').get()).toEqual({ n: 0 })
})

it('retiring repoints concepts another document covers and fails the orphans, without draining on the request', async () => {
  seedShared()
  await retireRoleDocument({ data: { ...ids, sourceId: 'src-1' } })
  expect(sqlite.prepare('SELECT id, source_id, source_quote, misconceptions_json, gen_status, gen_error FROM concepts ORDER BY id').all()).toEqual([
    { id: 'con-1', source_id: 'src-2', source_quote: 'Wear a  vest', misconceptions_json: '[]', gen_status: 'pending', gen_error: null },
    { id: 'con-2', source_id: 'src-1', source_quote: 'stop at the red line', misconceptions_json: '[]', gen_status: 'failed', gen_error: 'The document behind this concept was retired' },
  ])
  expect(drain).not.toHaveBeenCalled()
  expect(state.background).toHaveLength(0)
})

// The other document goes away between the concept read and the retire write: the concept never lands on a retired document.
it.each([
  ['replaced', true, { source_id: 'src-2b', gen_status: 'pending', gen_error: null }],
  ['retired', false, { source_id: 'src-1', gen_status: 'failed', gen_error: 'The document behind this concept was retired' }],
] as const)('retiring reads the other documents again when the one it picked is %s mid-retire', async (_label, replaced, con1) => {
  seedShared()
  beforeSql = {
    prefix: 'update "sources"',
    fn: () => {
      sqlite.prepare("UPDATE sources SET retired_at = 4 WHERE id = 'src-2'").run()
      if (replaced) sqlite.prepare("INSERT INTO sources (id, topic_id, kind, title, body_text, version, status, created_at) VALUES ('src-2b', 'topic-role-a', 'text', 'Site guide', 'Wear a vest on the dock, always.', 4, 'ready', 4)").run()
    },
  }
  await expect(retireRoleDocument({ data: { ...ids, sourceId: 'src-1' } })).resolves.toEqual({ ok: true })
  expect(beforeSql).toBeNull()
  expect(sqlite.prepare("SELECT source_id, gen_status, gen_error FROM concepts WHERE id = 'con-1'").get()).toEqual(con1)
  expect(sqlite.prepare("SELECT retired_at IS NOT NULL AS retired FROM sources WHERE id = 'src-1'").get()).toEqual({ retired: 1 })
  expect(itemStatus()).toEqual({ 'item-1': 'retired', 'item-2': 'retired', 'item-other': 'active' })
})

// The browser upload route: same handler as the server function, with the org and role taken from the URL.
const post = (body: FormData, origin = 'http://127.0.0.1:8800') => (Route.options.server!.handlers as unknown as {
  POST: (ctx: { request: Request; params: { orgId: string; roleId: string } }) => Promise<Response>
}).POST({
  request: new Request('http://127.0.0.1:8800/api/org/acme/roles/role-a/documents', { method: 'POST', headers: { Origin: origin }, body }),
  params: { orgId: 'acme', roleId: 'role-a' },
})

it.each(['http://127.0.0.1:8800', 'https://app.learnquiz.com'])('stores a PDF posted to the upload route from %s, taking the company and role from the URL', async (origin) => {
  const response = await post(form({ slug: 'globex', roleId: 'role-b', file: textPdf() }), origin)
  const result = await response.json() as { sourceId: string }
  const key = `orgs/org-a/roles/role-a/sources/${result.sourceId}.pdf`
  expect(response.status).toBe(200)
  expect(result).toEqual({ sourceId: result.sourceId, topicId: 'topic-role-a', r2Key: key, chars: SENTENCE.length, version: 1, status: 'ready' })
  expect(state.bucket.put).toHaveBeenCalledTimes(1)
  expect(state.bucket.put.mock.calls[0][0]).toBe(key)
  expect(sqlite.prepare('SELECT topic_id, uploaded_by FROM sources WHERE id = ?').get(result.sourceId)).toEqual({ topic_id: 'topic-role-a', uploaded_by: 'owner-a' })
})

it('answers 413 from the upload route for a file over the size limit, storing nothing', async () => {
  const bytes = new Uint8Array(MAX_ROLE_DOCUMENT_BYTES + 1)
  bytes.set(Buffer.from('%PDF-'))
  const big = new File([bytes], 'Big.pdf', { type: 'application/pdf' })
  const response = await post(form({ file: big }))
  expect(response.status).toBe(413)
  expect(await response.json()).toEqual({ error: 'Documents must be 10 MB or smaller' })
  expect(state.bucket.put).not.toHaveBeenCalled()
  expect(sourceRows()).toEqual([])
})

it.each([
  ['a foreign origin', 'owner-a', 'https://evil.example'],
  ['a plain member', 'member-a', 'http://127.0.0.1:8800'],
] as const)('answers 403 from the upload route for %s, storing nothing', async (_label, user, origin) => {
  state.user = user
  const response = await post(form({ file: textPdf() }), origin)
  expect(response.status).toBe(403)
  expect(state.bucket.put).not.toHaveBeenCalled()
  expect(sourceRows()).toEqual([])
})
