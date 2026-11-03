import { readFileSync, readdirSync } from 'node:fs'
import { DatabaseSync } from 'node:sqlite'
import { drizzle } from 'drizzle-orm/sqlite-proxy'
import { afterAll, afterEach, beforeAll, beforeEach, expect, it, vi } from 'vitest'
import { concepts, learnerTopic } from '@/db/schema'
import { ACCOUNT_DAILY_MODEL_CALL_CAP, COMPANY_DAILY_MODEL_CALL_CAP } from '@/lib/limits'
import * as curriculum from './curriculum'
import { getLatestTopicIdFn } from './latest-topic'
import { getToday } from './today'

// Keep the handlers, validation, authorization, model client and database real.
// Only the transport, session provider, Worker bindings and model HTTP are faked.
const holder = vi.hoisted(() => ({ db: null as unknown, userId: 'owner' as string | null }))
vi.mock('@tanstack/react-start', () => ({
  createServerFn: () => ({
    handler: (fn: () => unknown) => () => fn(),
    validator: (schema: { parse: (data: unknown) => unknown }) => ({
      handler: (fn: (args: { data: unknown }) => unknown) => (args: { data: unknown }) => fn({ data: schema.parse(args.data) }),
    }),
  }),
}))
vi.mock('@tanstack/react-start/server', () => ({ getRequestHeaders: () => new Headers() }))
vi.mock('@/db', () => ({ getDb: () => holder.db }))
vi.mock('@/server/auth', () => ({
  getAuth: () => ({ api: { getSession: async () => holder.userId ? { user: { id: holder.userId } } : null } }),
}))
vi.mock('cloudflare:workers', () => ({
  env: { LLM_PROFILE: 'meta', LLM_BASE_URL: 'https://llm.example', LLM_MODEL: 'muse-spark-1.3' },
  waitUntil: () => {}, // the background question drain is covered in concept-gen.test.ts
}))

const procedures: { name: string; steps: [string, string, boolean][] }[] = [
  { name: 'Receiving', steps: [
    ['Wear safety boots', 'Wear safety boots and a high-visibility vest in the warehouse.', true],
    ['Inspect pallets', 'Quarantine damaged pallets before unloading.', true],
    ['Count cartons', 'Count received cartons against the delivery note.', false],
    ['Record discrepancies', 'Record delivery discrepancies before signing the receipt.', false],
  ] },
  { name: 'Picking', steps: [
    ['Read the pick ticket', 'Read the pick ticket before entering the aisle.', false],
    ['Verify the location', 'Check the aisle and bin against the pick ticket.', false],
    ['Scan the location', 'Scan the bin barcode before taking stock.', true],
    ['Scan the SKU', 'Scan each SKU and stop if the scanner reports a mismatch.', true],
  ] },
  { name: 'Packing', steps: [
    ['Inspect the carton', 'Choose an undamaged carton sized for the order.', false],
    ['Confirm quantity', 'Confirm the packed quantity matches the order.', true],
    ['Protect the stock', 'Use padding to protect loose stock in the carton.', false],
    ['Label the parcel', 'Attach the shipping label to the sealed carton.', false],
  ] },
  { name: 'Returns', steps: [
    ['Isolate damaged returns', 'Isolate leaking or damaged returns and notify the supervisor.', true],
    ['Check the return reference', 'Match the return reference to the original order.', false],
    ['Scan the return SKU', 'Scan the returned SKU before restocking it.', true],
    ['Reconcile inventory', 'Reconcile the returned quantity with the inventory record.', true],
  ] },
]
const documents = [
  // The whole document must reach the model, including content beyond the personal paste cap.
  'Warehouse receiving and picking SOP.\n' + 'Preparation notes.\n'.repeat(1200) + procedures.slice(0, 2).flatMap((u) => u.steps.map((s) => s[1])).join('\n'),
  'Warehouse packing and returns SOP.\n' + procedures.slice(2).flatMap((u) => u.steps.map((s) => s[1])).join('\n'),
]
const skeleton = () => ({ units: procedures.map((u) => ({
  name: u.name,
  summary: `${u.name} procedure.`,
  concepts: u.steps.map(([name, quote, critical], i) => ({
    name, summary: quote, critical, visual: i === 0, source_quote: quote,
    prerequisites: i ? [u.steps[i - 1][0]] : [],
    misconceptions: ['Skipping the required check.'],
  })),
})) })
const modelReply = (value: unknown) => Response.json({ choices: [{ message: { content: JSON.stringify(value) }, finish_reason: 'stop' }] })
const fetchModel = vi.fn<typeof fetch>()
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
  for (const id of ['owner', 'employee', 'other-owner']) {
    raw.prepare('INSERT INTO user (id, name, email) VALUES (?, ?, ?)').run(id, id, `${id}@learnquiz.test`)
  }
  for (const [id, slug] of [['northwind', 'northwind'], ['other-org', 'other-company']]) {
    raw.prepare('INSERT INTO organization (id, name, slug, created_at) VALUES (?, ?, ?, 1)').run(id, slug, slug)
  }
  for (const [userId, orgId, role] of [['owner', 'northwind', 'owner'], ['employee', 'northwind', 'member'], ['other-owner', 'other-org', 'owner']]) {
    raw.prepare('INSERT INTO member (id, organization_id, user_id, role, created_at) VALUES (?, ?, ?, ?, 1)').run(userId, orgId, userId, role)
  }
  for (const [id, orgId] of [['picker', 'northwind'], ['other-role', 'other-org']]) {
    raw.prepare('INSERT INTO job_roles (id, org_id, name, created_at) VALUES (?, ?, ?, 1)').run(id, orgId, 'Warehouse picker')
    raw.prepare("INSERT INTO topics (id, job_role_id, title, status, created_at) VALUES (?, ?, ?, 'draft', 1)").run(`${id}-topic`, id, 'Warehouse picker')
  }
  const source = raw.prepare("INSERT INTO sources (id, topic_id, kind, title, body_text, created_at, deleted_at) VALUES (?, ?, 'text', ?, ?, ?, ?)")
  source.run('packing', 'picker-topic', 'Packing and returns', documents[1], 2, null)
  source.run('receiving', 'picker-topic', 'Receiving and picking', documents[0], 1, null)
  source.run('deleted', 'picker-topic', 'Obsolete procedure', 'Obsolete rule: bypass the scanner.', 0, 1)
  source.run('foreign', 'other-role-topic', 'Other company procedure', 'Foreign rule: skip the safety check.', 1, null)
})
afterAll(() => raw.close())
beforeEach(() => {
  raw.exec('SAVEPOINT test')
  holder.userId = 'owner'
  vi.useFakeTimers({ toFake: ['Date'] })
  vi.setSystemTime(new Date('2026-11-02T12:00:00Z'))
  fetchModel.mockReset().mockImplementation(async () => modelReply(skeleton()))
  vi.stubGlobal('fetch', fetchModel)
})
afterEach(() => {
  vi.unstubAllGlobals()
  vi.useRealTimers()
  raw.exec('ROLLBACK TO test; RELEASE test')
})

it('retains critical safety and scanning concepts when creating a personal topic', async () => {
  const sourceText = procedures.flatMap((u) => u.steps.map((s) => s[1])).join('\n')
  const { topicId } = await curriculum.createTopic({ data: { topic: 'Warehouse picker', sourceText } })
  expect((await curriculum.getTopicPath({ data: { topicId } })).topic.generatedBy).toBe('muse-spark-1.3')
  const rows = await db.select().from(concepts)
  expect(rows.find((c) => c.name === 'Wear safety boots')).toMatchObject({ critical: true, visual: true })
  expect(rows.find((c) => c.name === 'Scan the SKU')).toMatchObject({ critical: true })
  expect(rows.find((c) => c.name === 'Read the pick ticket')).toMatchObject({ critical: false })
})

const generate = (roleId = 'picker') => curriculum.generateRoleCurriculum({ data: { slug: 'northwind', roleId } })
const topicState = () => raw.prepare("SELECT status FROM topics WHERE id = 'picker-topic'").get()
const storedPath = () => ({
  units: raw.prepare("SELECT COUNT(*) AS n FROM units WHERE topic_id = 'picker-topic'").get(),
  concepts: raw.prepare("SELECT COUNT(*) AS n FROM concepts WHERE topic_id = 'picker-topic'").get(),
  edges: raw.prepare("SELECT COUNT(*) AS n FROM concept_edges WHERE topic_id = 'picker-topic'").get(),
})

it('builds one ready role topic from every live document with grounded critical steps in procedure order', async () => {
  await expect(generate()).resolves.toEqual({ topicId: 'picker-topic' })
  expect(topicState()).toEqual({ status: 'ready' })
  expect(raw.prepare("SELECT generated_by FROM topics WHERE id = 'picker-topic'").get()).toEqual({ generated_by: 'muse-spark-1.3' })
  expect(storedPath()).toEqual({ units: { n: 4 }, concepts: { n: 16 }, edges: { n: 12 } })
  expect(raw.prepare('SELECT DISTINCT gen_status FROM concepts WHERE topic_id = \'picker-topic\'').all()).toEqual([{ gen_status: 'pending' }])
  const rows = raw.prepare(`SELECT c.name, c.source_id, c.source_quote, c.critical, c.visual, c.grounded, s.body_text
    FROM concepts c JOIN units u ON u.id = c.unit_id LEFT JOIN sources s ON s.id = c.source_id
    WHERE c.topic_id = 'picker-topic' ORDER BY u."order", c."order"`).all()
  expect(rows.map((c) => [c.name, c.source_id, c.critical, c.visual])).toEqual(procedures.flatMap((u, i) =>
    u.steps.map(([name, , critical], step) => [name, i < 2 ? 'receiving' : 'packing', Number(critical), Number(step === 0)]),
  ))
  for (const c of rows) {
    expect(c.grounded).toBe(1)
    expect(c.body_text).toContain(c.source_quote)
  }
  const request = JSON.parse(fetchModel.mock.calls[0][1]!.body as string)
  const prompt = request.messages[1].content as string
  for (const text of documents) expect(prompt).toContain(text)
  expect(prompt.indexOf(documents[0])).toBeLessThan(prompt.indexOf(documents[1]))
  expect(prompt).not.toContain('Obsolete rule:')
  expect(prompt).not.toContain('Foreign rule:')
  expect(raw.prepare("SELECT purpose, ok, topic_id FROM model_calls WHERE learner_id = 'owner'").all()).toEqual([{ purpose: 'curriculum', ok: 1, topic_id: 'picker-topic' }])
  // Repeated requests preserve the shared path and cannot create duplicate concepts.
  await expect(generate()).rejects.toMatchObject({ status: 409 })
  expect(storedPath()).toEqual({ units: { n: 4 }, concepts: { n: 16 }, edges: { n: 12 } })
  expect(fetchModel).toHaveBeenCalledTimes(1)
})

it.each([
  { userId: null, roleId: 'picker', status: 401 },
  { userId: 'employee', roleId: 'picker', status: 403 },
  { userId: 'other-owner', roleId: 'picker', status: 403 },
  { userId: 'owner', roleId: 'other-role', status: 404 },
])('refuses user $userId generating $roleId with $status', async ({ userId, roleId, status }) => {
  holder.userId = userId
  await expect(generate(roleId)).rejects.toMatchObject({ status })
  expect(topicState()).toEqual({ status: 'draft' })
  expect(fetchModel).not.toHaveBeenCalled()
})

it.each([null, 'Obsolete rule: bypass the scanner.', 'Foreign rule: skip the safety check.'])(
  'refuses ungrounded output (%s) and leaves no published path', async (quote) => {
    const output = skeleton()
    const reply = { ...output, units: output.units.map((u, i) => i ? u : { ...u, concepts: u.concepts.map((c, j) => j ? c : { ...c, source_quote: quote }) }) }
    fetchModel.mockImplementation(async () => modelReply(reply))
    await expect(generate()).rejects.toMatchObject({ status: 422 })
    expect(topicState()).toEqual({ status: 'failed' })
    expect(storedPath()).toEqual({ units: { n: 0 }, concepts: { n: 0 }, edges: { n: 0 } })
  },
)

it('publishes the path atomically and allows retry after a failed write', async () => {
  raw.exec(`CREATE TEMP TRIGGER reject_concepts BEFORE INSERT ON concepts
    WHEN NEW.name = 'Scan the SKU' BEGIN SELECT RAISE(ABORT, 'write failed'); END`)
  await expect(generate()).rejects.toThrow('write failed')
  expect(topicState()).toEqual({ status: 'failed' })
  expect(storedPath()).toEqual({ units: { n: 0 }, concepts: { n: 0 }, edges: { n: 0 } })
  raw.exec('DROP TRIGGER reject_concepts')
  await expect(generate()).resolves.toEqual({ topicId: 'picker-topic' })
  expect(topicState()).toEqual({ status: 'ready' })
  expect(storedPath()).toEqual({ units: { n: 4 }, concepts: { n: 16 }, edges: { n: 12 } })
})

it.each([
  { failure: 'invalid output', reply: () => modelReply({ units: [] }), status: 422, calls: 2 },
  { failure: 'provider unavailable', reply: () => new Response('Unavailable', { status: 502 }), status: 503, calls: 1 },
])('marks the topic failed on $failure without a generic fallback', async ({ reply, status, calls }) => {
  fetchModel.mockImplementation(async () => reply())
  await expect(generate()).rejects.toMatchObject({ status })
  expect(topicState()).toEqual({ status: 'failed' })
  expect(storedPath()).toEqual({ units: { n: 0 }, concepts: { n: 0 }, edges: { n: 0 } })
  expect(fetchModel).toHaveBeenCalledTimes(calls)
})

it('refuses generation at the daily cap before changing the role topic', async () => {
  const log = raw.prepare("INSERT INTO model_calls (id, learner_id, purpose, model, latency_ms, ok, created_at) VALUES (?, 'owner', 'curriculum', 'muse-spark-1.3', 0, 1, ?)")
  for (let i = 0; i < ACCOUNT_DAILY_MODEL_CALL_CAP; i++) log.run(`call-${i}`, Date.now())
  await expect(generate()).rejects.toMatchObject({ status: 429 })
  expect(topicState()).toEqual({ status: 'draft' })
  expect(fetchModel).not.toHaveBeenCalled()
})

it('refuses generation once the company has spent its daily cap, before changing the role topic', async () => {
  // Calls on another of the company's topics count against the same cap.
  raw.exec("UPDATE topics SET org_id = 'northwind' WHERE id = 'picker-topic'")
  raw.exec("INSERT INTO topics (id, org_id, title, status, created_at) VALUES ('co-spent', 'northwind', 'Packing', 'ready', 1)")
  const log = raw.prepare("INSERT INTO model_calls (id, learner_id, topic_id, purpose, model, latency_ms, ok, created_at) VALUES (?, NULL, 'co-spent', 'items', 'muse-spark-1.3', 0, 1, ?)")
  for (let i = 0; i < COMPANY_DAILY_MODEL_CALL_CAP; i++) log.run(`call-${i}`, Date.now())
  await expect(generate()).rejects.toMatchObject({ status: 429 })
  expect(topicState()).toEqual({ status: 'draft' })
  expect(fetchModel).not.toHaveBeenCalled()
})

it('refuses roles with no live document text before calling the model', async () => {
  raw.exec("UPDATE sources SET deleted_at = 1 WHERE topic_id = 'picker-topic'")
  await expect(generate()).rejects.toMatchObject({ status: 422 })
  expect(topicState()).toEqual({ status: 'draft' })
  expect(fetchModel).not.toHaveBeenCalled()
})

// An employee trains on the role's shared curriculum; the topic has no personal owner.
const seedRoleCurriculum = (withItem: boolean) => {
  raw.exec("UPDATE topics SET status = 'ready' WHERE id = 'picker-topic'")
  raw.exec("INSERT INTO units (id, topic_id, \"order\", name) VALUES ('u1', 'picker-topic', 0, 'Receiving')")
  raw.exec("INSERT INTO concepts (id, topic_id, unit_id, \"order\", name, summary) VALUES ('c1', 'picker-topic', 'u1', 0, 'Scan the SKU', 'Scan every SKU.')")
  if (withItem) {
    raw.exec(`INSERT INTO items (id, concept_id, topic_id, format, payload_json, status, created_at)
      VALUES ('i1', 'c1', 'picker-topic', 'mcq', '{}', 'active', 1)`)
  }
}

it.each([
  ['an assigned employee', 'employee', false, 200],
  ['an employee of another company', 'other-owner', false, 404],
  ['a member who left the company', 'employee', true, 404],
])('role curriculum for %s', async (_label, userId, left, status) => {
  seedRoleCurriculum(true)
  holder.userId = userId
  raw.exec("INSERT INTO member_role_assignments (user_id, org_id, job_role_id, assigned_at) VALUES ('employee', 'northwind', 'picker', 1)")
  if (left) raw.exec("DELETE FROM member WHERE user_id = 'employee'")
  const open = curriculum.getTopicPath({ data: { topicId: 'picker-topic' } })
  if (status === 404) {
    await expect(open).rejects.toMatchObject({ status: 404, message: 'Topic not found' })
    expect(await db.select().from(learnerTopic)).toHaveLength(0)
    return
  }
  expect((await open).topic.title).toBe('Warehouse picker')
  expect(await db.select().from(learnerTopic)).toMatchObject([{ learnerId: 'employee', topicId: 'picker-topic' }])
  await expect(curriculum.getConceptItems({ data: { conceptId: 'c1' } })).resolves.toEqual({ items: [] })
})

it.each([
  ['mcq', 'ready', false], [null, 'ready', true], ['short', 'ready', true], [null, 'draft', true],
] as const)('opens Today and the Path tab on the role topic (item %s, %s, preparing %s)', async (format, topicStatus, preparing) => {
  seedRoleCurriculum(format !== null)
  if (format) raw.exec(`UPDATE items SET format = '${format}' WHERE id = 'i1'`)
  raw.exec(`UPDATE topics SET status = '${topicStatus}' WHERE id = 'picker-topic'`)
  holder.userId = 'employee'
  raw.exec("INSERT INTO member_role_assignments (user_id, org_id, job_role_id, assigned_at) VALUES ('employee', 'northwind', 'picker', 1)")
  const today = await getToday()
  expect(today.role).toEqual({ name: 'Warehouse picker', topicTitle: 'Warehouse picker', preparing })
  expect(today.topic?.id).toBe(preparing ? undefined : 'picker-topic')
  expect(await getLatestTopicIdFn()).toBe('picker-topic')
  expect((await curriculum.getTopicPath({ data: { topicId: 'picker-topic' } })).preparing).toBe(preparing)
})
