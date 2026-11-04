import { readFileSync, readdirSync } from 'node:fs'
import { DatabaseSync } from 'node:sqlite'
import { drizzle } from 'drizzle-orm/sqlite-proxy'
import { afterAll, afterEach, beforeAll, beforeEach, expect, it, vi } from 'vitest'
import { listRoles } from './org'
import * as detail from './role-detail'
import { uploadRoleDocument } from './role-documents'

// Keep the handlers, validation, authorization, model client and database real.
// Only the transport, session provider, Worker bindings and model HTTP are faked.
const holder = vi.hoisted(() => ({ db: null as unknown, userId: 'owner' as string | null }))
vi.mock('@tanstack/react-start', () => ({
  createServerOnlyFn: (fn: unknown) => fn,
  createServerFn: () => ({
    validator: (schema: { parse: (data: unknown) => unknown } | ((data: unknown) => unknown)) => ({
      handler: (fn: (args: { data: unknown }) => unknown) => (args: { data: unknown }) => fn({ data: typeof schema === 'function' ? schema(args.data) : schema.parse(args.data) }),
    }),
  }),
}))
vi.mock('@tanstack/react-start/server', () => ({ getRequestHeaders: () => new Headers() }))
vi.mock('@/db', () => ({ getDb: () => holder.db }))
vi.mock('@/server/auth', () => ({
  getAuth: () => ({ api: { getSession: async () => holder.userId ? { user: { id: holder.userId, role: holder.userId.startsWith('staff') ? 'admin' : null } } : null } }),
}))
vi.mock('cloudflare:workers', () => ({
  env: { LLM_PROFILE: 'meta', LLM_BASE_URL: 'https://llm.example', LLM_MODEL: 'muse-spark-1.3' },
  waitUntil: () => {}, // the background question drain is covered in concept-gen.test.ts
}))

let raw: DatabaseSync
let db: ReturnType<typeof drizzle>

beforeAll(() => {
  raw = new DatabaseSync(':memory:')
  for (const file of readdirSync('drizzle').filter((f) => f.endsWith('.sql')).sort()) {
    raw.exec(readFileSync(`drizzle/${file}`, 'utf8').replaceAll('--> statement-breakpoint', ''))
  }
  const run = (sql: string, params: unknown[], method: string) => {
    // Match D1's prepared-statement limit, which node:sqlite does not enforce.
    if (params.length > 100) throw new Error(`D1_ERROR: too many SQL variables (${params.length} > 100)`)
    const stmt = raw.prepare(sql)
    stmt.setReturnArrays(true)
    const args = params as (string | number | null)[]
    if (method === 'run') { stmt.run(...args); return { rows: [] } }
    return { rows: (method === 'get' ? stmt.get(...args) : stmt.all(...args)) as never }
  }
  db = drizzle(async (sql, params, method) => run(sql, params, method), async (queries) => {
    raw.exec('SAVEPOINT batch')
    try {
      const result = queries.map((q) => run(q.sql, q.params, q.method))
      raw.exec('RELEASE batch')
      return result
    } catch (e) {
      raw.exec('ROLLBACK TO batch; RELEASE batch')
      throw e
    }
  })
  holder.db = db
  for (const id of ['owner', 'employee', 'other-owner', 'staff', 'staff-owner']) {
    raw.prepare('INSERT INTO user (id, name, email, role) VALUES (?, ?, ?, ?)').run(id, id === 'owner' ? 'Owner Name' : id, `${id}@learnquiz.test`, id.startsWith('staff') ? 'admin' : null)
  }
  for (const [id, slug] of [['northwind', 'northwind'], ['other-org', 'other-company']]) {
    raw.prepare('INSERT INTO organization (id, name, slug, created_at) VALUES (?, ?, ?, 1)').run(id, slug, slug)
  }
  for (const [userId, orgId, role] of [['owner', 'northwind', 'owner'], ['employee', 'northwind', 'member'], ['other-owner', 'other-org', 'owner'], ['staff-owner', 'northwind', 'owner']]) {
    raw.prepare('INSERT INTO member (id, organization_id, user_id, role, created_at) VALUES (?, ?, ?, ?, 1)').run(userId, orgId, userId, role)
  }
  for (const [id, orgId] of [['picker', 'northwind'], ['other-role', 'other-org']]) {
    raw.prepare('INSERT INTO job_roles (id, org_id, name, created_at) VALUES (?, ?, ?, 1)').run(id, orgId, 'Warehouse picker')
    raw.prepare("INSERT INTO topics (id, org_id, job_role_id, title, status, created_at) VALUES (?, ?, ?, ?, 'ready', 1)").run(`${id}-topic`, orgId, id, 'Warehouse picker')
    raw.prepare('INSERT INTO units (id, topic_id, "order", name, summary) VALUES (?, ?, 0, ?, ?)').run(`${id}-unit`, `${id}-topic`, 'Picking', 'Pick orders.')
  }
  const concept = raw.prepare('INSERT INTO concepts (id, topic_id, unit_id, "order", name, summary, critical, gen_status, gen_error) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)')
  concept.run('scan-sku', 'picker-topic', 'picker-unit', 1, 'Scan the SKU', 'Scan each SKU.', 0, 'failed', 'Model timed out')
  concept.run('scan-bin', 'picker-topic', 'picker-unit', 0, 'Scan the bin', 'Scan the bin barcode.', 1, 'ready', null)
  concept.run('foreign-concept', 'other-role-topic', 'other-role-unit', 0, 'Foreign rule', 'Foreign summary.', 0, 'ready', null)
  const source = raw.prepare("INSERT INTO sources (id, topic_id, kind, title, body_text, version, created_at, deleted_at, uploaded_by) VALUES (?, ?, 'text', ?, ?, ?, ?, ?, ?)")
  source.run('old', 'picker-topic', 'Receiving SOP', 'Check the dock.', 1, 1000, null, null)
  source.run('new', 'picker-topic', 'Packing SOP', 'body', 2, 2000, null, 'owner')
  source.run('gone', 'picker-topic', 'Obsolete SOP', 'body', 1, 3000, 4000, 'owner')
  source.run('foreign', 'other-role-topic', 'Other SOP', 'body', 1, 1500, null, 'other-owner')
  // Two employees on the picker role count; a second role and another company's assignment do not.
  raw.prepare('INSERT INTO job_roles (id, org_id, name, created_at) VALUES (?, ?, ?, 1)').run('packer', 'northwind', 'Packer')
  const assign = raw.prepare('INSERT INTO member_role_assignments (user_id, org_id, job_role_id, assigned_at) VALUES (?, ?, ?, 1)')
  assign.run('employee', 'northwind', 'picker')
  assign.run('owner', 'northwind', 'picker')
  assign.run('other-owner', 'other-org', 'other-role')
})
afterAll(() => raw.close())
beforeEach(() => {
  raw.exec('SAVEPOINT test')
  holder.userId = 'owner'
})
afterEach(() => raw.exec('ROLLBACK TO test; RELEASE test'))

const read = () => detail.getRoleDetail({ data: { slug: 'northwind', roleId: 'picker' } })
const conceptRow = (id: string) => raw.prepare('SELECT name, summary, critical FROM concepts WHERE id = ?').get(id)

it('gives an admin the role documents newest first and its units with concept generation status', async () => {
  const result = await read()
  expect(result.org).toEqual({ slug: 'northwind', name: 'northwind' })
  expect(result.readOnly).toBe(false)
  expect(result.role).toMatchObject({ id: 'picker', name: 'Warehouse picker', topicId: 'picker-topic', topicStatus: 'ready' })
  expect(result.documents).toEqual([
    { id: 'new', title: 'Packing SOP', kind: 'text', version: 2, createdAt: 2000, status: 'ready', error: null, sizeBytes: null, pageCount: null, chars: 4, uploaderName: 'Owner Name' },
    { id: 'old', title: 'Receiving SOP', kind: 'text', version: 1, createdAt: 1000, status: 'ready', error: null, sizeBytes: null, pageCount: null, chars: 15, uploaderName: null },
  ])
  expect(result.role.people).toBe(2)
  expect(result.units).toEqual([{ id: 'picker-unit', name: 'Picking', summary: 'Pick orders.', concepts: [
    { id: 'scan-bin', name: 'Scan the bin', summary: 'Scan the bin barcode.', critical: true, genStatus: 'ready', genError: null, questionCount: 0 },
    { id: 'scan-sku', name: 'Scan the SKU', summary: 'Scan each SKU.', critical: false, genStatus: 'failed', genError: 'Model timed out', questionCount: 0 },
  ] }])
})

it('counts live questions per concept (active and reported only) and totals them for the role and its critical concepts', async () => {
  const item = raw.prepare("INSERT INTO items (id, concept_id, topic_id, format, payload_json, status, created_at) VALUES (?, ?, ?, 'mcq', '{}', ?, 1)")
  for (const [id, conceptId, status] of [
    ['a1', 'scan-sku', 'active'], ['a2', 'scan-sku', 'active'], ['a3', 'scan-sku', 'reported'], ['a4', 'scan-sku', 'rejected'], ['a5', 'scan-sku', 'retired'],
    ['b1', 'scan-bin', 'active'], ['b2', 'scan-bin', 'retired'],
    ['f1', 'foreign-concept', 'active'],
  ]) item.run(id, conceptId, conceptId === 'foreign-concept' ? 'other-role-topic' : 'picker-topic', status)
  const result = await read()
  expect(result.units[0].concepts.map((c) => [c.id, c.questionCount])).toEqual([['scan-bin', 1], ['scan-sku', 3]])
  expect(result.role.liveQuestions).toBe(4)
  expect(result.role.criticalQuestions).toBe(1)
})

it('releases a build claim left by a request that died, so the role can be rebuilt', async () => {
  const claim = raw.prepare("UPDATE topics SET status = 'generating', gen_started_at = ? WHERE id = 'picker-topic'")
  claim.run(Date.now())
  expect((await read()).role.topicStatus).toBe('generating')
  claim.run(Date.now() - 11 * 60 * 1000)
  expect((await read()).role.topicStatus).toBe('failed')
  expect(raw.prepare("SELECT status FROM topics WHERE id = 'picker-topic'").get()).toEqual({ status: 'failed' })
})

it('does not show another company role, and rejects a non-member', async () => {
  await expect(detail.getRoleDetail({ data: { slug: 'northwind', roleId: 'other-role' } })).rejects.toMatchObject({ status: 404 })
  await expect(detail.getRoleDetail({ data: { slug: 'other-company', roleId: 'picker' } })).rejects.toMatchObject({ status: 403 })
})

it('persists a concept edit and critical toggle, and refuses members and other companies', async () => {
  await detail.updateRoleConcept({ data: { slug: 'northwind', conceptId: 'scan-sku', critical: true, name: '  Scan every SKU ', summary: ' Scan each SKU before packing. ' } })
  const concepts = (await read()).units[0].concepts
  expect(concepts[1]).toMatchObject({ id: 'scan-sku', name: 'Scan every SKU', summary: 'Scan each SKU before packing.', critical: true })

  holder.userId = 'employee'
  await expect(detail.updateRoleConcept({ data: { slug: 'northwind', conceptId: 'scan-bin', critical: false } })).rejects.toMatchObject({ status: 403 })
  holder.userId = 'other-owner'
  await expect(detail.updateRoleConcept({ data: { slug: 'other-company', conceptId: 'scan-bin', critical: false } })).rejects.toMatchObject({ status: 404 })
  expect(conceptRow('scan-bin')).toMatchObject({ name: 'Scan the bin', critical: 1 })

  holder.userId = 'owner'
  await expect(async () => detail.updateRoleConcept({ data: { slug: 'northwind', conceptId: 'scan-bin' } })).rejects.toThrow('Change at least one field')
  await expect(detail.updateRoleConcept({ data: { slug: 'northwind', conceptId: 'foreign-concept', critical: true } })).rejects.toMatchObject({ status: 404 })
  expect(conceptRow('foreign-concept')).toMatchObject({ critical: 0 })
})

it('lets staff outside the company read a role but not change it', async () => {
  holder.userId = 'staff'
  await expect(read()).resolves.toMatchObject({ readOnly: true, role: { id: 'picker' } })
  const roles = await listRoles({ data: { slug: 'northwind' } })
  expect(roles.readOnly).toBe(true)
  expect(roles.roles.map((r) => r.id)).toContain('picker')
  await expect(detail.updateRoleConcept({ data: { slug: 'northwind', conceptId: 'scan-bin', critical: false } })).rejects.toMatchObject({ status: 403 })
  const form = new FormData()
  for (const [key, value] of [['slug', 'northwind'], ['roleId', 'picker'], ['title', 'Staff SOP'], ['text', 'Staff text']]) form.set(key, value)
  await expect(uploadRoleDocument({ data: form })).rejects.toMatchObject({ status: 403 })
  expect(raw.prepare("SELECT id FROM sources WHERE title = 'Staff SOP'").get()).toBeUndefined()
  expect(conceptRow('scan-bin')).toMatchObject({ critical: 1 })
})

it('keeps the full portal for staff who own the company', async () => {
  holder.userId = 'staff-owner'
  await expect(read()).resolves.toMatchObject({ readOnly: false })
  await expect(listRoles({ data: { slug: 'northwind' } })).resolves.toMatchObject({ readOnly: false })
})
