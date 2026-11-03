import { readFileSync, readdirSync } from 'node:fs'
import { DatabaseSync } from 'node:sqlite'
import { afterAll, afterEach, beforeAll, beforeEach, expect, it, vi } from 'vitest'
import { getAuth } from '@/server/auth'
import { getOrgOverview, getPeople } from '@/server/org'
import { NORTHWIND, seedNorthwind } from './northwind'

const request = vi.hoisted(() => ({ headers: new Headers() }))
const bindings = vi.hoisted(() => ({ waitUntil: () => {}, env: {
  DB: null as unknown,
  BETTER_AUTH_URL: 'http://127.0.0.1:8800',
  BETTER_AUTH_SECRET: '',
  LLM_PROFILE: 'meta',
  LLM_BASE_URL: 'https://model.test',
  LLM_MODEL: 'muse-spark-1.3',
} }))

// Only the Worker/request transport and provider HTTP are substituted. The seed,
// Better Auth (including invitation hooks), Drizzle, SQL and reporting run for real.
vi.mock('cloudflare:workers', () => bindings)
vi.mock('@tanstack/react-start', () => ({
  createServerFn: () => ({
    validator: (schema: { parse: (data: unknown) => unknown }) => ({
      handler: (handler: (input: { data: unknown }) => unknown) => (input: { data: unknown }) => handler({ data: schema.parse(input.data) }),
    }),
  }),
}))
vi.mock('@tanstack/react-start/server', () => ({ getRequestHeaders: () => request.headers }))
vi.mock('better-auth/tanstack-start', () => ({ tanstackStartCookies: () => ({ id: 'test-cookie-transport' }) }))

let raw: DatabaseSync
type Value = string | number | null

// D1's external binding backed by actual SQLite; exercise the production getDb.
class Prepared {
  constructor(private sql: string, private params: Value[] = []) {}
  bind(...params: Value[]) {
    if (params.length > 100) throw new Error('D1_ERROR: too many SQL variables')
    return new Prepared(this.sql, params)
  }
  async all() {
    const statement = raw.prepare(this.sql)
    const results = statement.all(...this.params)
    return { results, success: true, meta: {} }
  }
  async raw() {
    const statement = raw.prepare(this.sql)
    statement.setReturnArrays(true)
    return statement.all(...this.params)
  }
  async run() {
    const result = raw.prepare(this.sql).run(...this.params)
    return { success: true, results: [], meta: { changes: Number(result.changes), last_row_id: Number(result.lastInsertRowid) } }
  }
}

beforeAll(() => {
  raw = new DatabaseSync(':memory:')
  raw.exec('PRAGMA foreign_keys = ON')
  for (const file of readdirSync('drizzle').filter((file) => file.endsWith('.sql')).sort()) {
    raw.exec(readFileSync(`drizzle/${file}`, 'utf8').replaceAll('--> statement-breakpoint', ''))
  }
  bindings.env.BETTER_AUTH_SECRET = crypto.randomUUID() + crypto.randomUUID()
  bindings.env.DB = {
    prepare: (sql: string) => new Prepared(sql),
    batch: async (statements: Prepared[]) => {
      raw.exec('SAVEPOINT batch')
      try {
        const result = []
        for (const statement of statements) result.push(await statement.all())
        raw.exec('RELEASE batch')
        return result
      } catch (error) {
        raw.exec('ROLLBACK TO batch; RELEASE batch')
        throw error
      }
    },
  }
})

const now = new Date('2026-11-03T12:00:00Z').getTime()
const sopText = readFileSync('seed/northwind-sop.md', 'utf8')
const procedures = [
  { name: 'Safety', steps: [
    ['Inspect equipment', 'Check your scanner and trolley for damage.', false],
    ['Keep exits clear', 'Keep exits, fire equipment and pedestrian routes clear.', true],
    ['Separate pedestrians and vehicles', 'acknowledge you before crossing.', true],
    ['Check handling labels', 'before lifting.', true],
  ] },
  { name: 'Receiving', steps: [
    ['Match the receipt', 'Match the delivery reference to the expected receipt before unloading into', false],
    ['Count actual cartons', 'Count the actual cartons and inspect them for damage.', false],
    ['Hold discrepancies', 'mismatched deliveries in the designated hold area.', true],
    ['Check unit of measure', 'item description and unit of measure: one carton may contain several units.', false],
  ] },
  { name: 'Picking and scanning', steps: [
    ['Link the tote', 'Keep one order per tote.', false],
    ['Scan the location', 'scan the physical location label before touching the stock.', true],
    ['Resolve scan mismatches', 'location or item, stop the pick and notify the shift lead.', true],
    ['Confirm actual quantities', 'Confirm the quantity actually placed in the tote.', false],
  ] },
  { name: 'Returns', steps: [
    ['Identify returned stock', 'Move a return to the marked returns area.', false],
    ['Isolate unidentified returns', 'Keep unidentified returns separate and ask the shift lead to identify them.', false],
    ['Quarantine returns', 'returns hold area until an authorised checker records its disposition.', true],
    ['Restock authorised quantities', 'for the approved quantity.', false],
  ] },
] as const

const skeleton = () => ({ units: procedures.map((unit) => ({
  name: unit.name,
  summary: `${unit.name} procedure.`,
  concepts: unit.steps.map(([name, quote, critical], index) => ({
    name, summary: quote, critical, visual: false, source_quote: quote,
    prerequisites: index ? [unit.steps[index - 1][0]] : [],
    misconceptions: ['Skipping the documented check.'],
  })),
})) })

const reply = (value: unknown) => Response.json({ choices: [{ message: { content: JSON.stringify(value) }, finish_reason: 'stop' }] })
const fetchModel = vi.fn<typeof fetch>()
beforeEach(() => {
  raw.exec('SAVEPOINT test')
  request.headers = new Headers()
  vi.useFakeTimers({ toFake: ['Date'] })
  vi.setSystemTime(now)
  fetchModel.mockReset().mockImplementation(async (_url, init) => {
    const body = JSON.parse(init!.body as string)
    const schema = body.response_format.json_schema.name
    if (schema === 'curriculum_skeleton') return reply(skeleton())
    if (schema === 'self_check') return reply({ results: Array.from({ length: 6 }, (_, index) => ({ index, keep: true, reasons: [] })) })
    if (schema !== 'item_batch') throw new Error(`Unexpected model schema: ${schema}`)
    const prompt = body.messages[1].content as string
    const concept = prompt.match(/^Concept: (.+)$/m)![1]
    const quote = prompt.match(/^Quote: "(.+)"$/m)![1]
    return reply({ items: Array.from({ length: 6 }, (_, index) => ({
      format: 'mcq', stem: `${concept}: which action follows the procedure? (${index + 1})`,
      options: [
        { id: 'a', text: quote, is_correct: true, feedback: 'Follow the documented step.' },
        { id: 'b', text: 'Skip the documented check.', is_correct: false, feedback: 'The check is required.' },
        { id: 'c', text: 'Confirm before checking.', is_correct: false, feedback: 'Check before confirming.' },
      ],
      accepted_answers: [], model_answer: quote, explanation: quote, difficulty: 3,
      source_quote: quote, grounded: true, bloom: 'apply',
    })) })
  })
  vi.stubGlobal('fetch', fetchModel)
})
afterEach(() => {
  vi.unstubAllGlobals()
  vi.useRealTimers()
  raw.exec('ROLLBACK TO test; RELEASE test')
})
afterAll(() => raw.close())

const passwords = () => ({ ownerPassword: crypto.randomUUID(), learnerPassword: crypto.randomUUID() })
async function signIn(email: string, password: string) {
  const response = await getAuth().api.signInEmail({ body: { email, password }, asResponse: true })
  expect(response.status).toBe(200)
  request.headers = new Headers({ cookie: response.headers.getSetCookie().map((cookie) => cookie.split(';')[0]).join('; ') })
}

it('seeds the three employee stages through the real SOP pipeline and preserves later progress on rerun', async () => {
  const secret = passwords()
  const result = await seedNorthwind({ sopText, ...secret, now })
  expect(result).toMatchObject({ slug: 'northwind-logistics', concepts: 16, daysToProficiency: 6 })
  expect(JSON.stringify(result)).not.toContain(secret.ownerPassword)
  expect(JSON.stringify(result)).not.toContain(secret.learnerPassword)
  expect(raw.prepare('SELECT body_text FROM sources WHERE id = ?').get(NORTHWIND.sourceId)).toEqual({ body_text: sopText.trim() })
  expect(raw.prepare('SELECT status, generated_by FROM topics WHERE id = ?').get(result.topicId)).toEqual({ status: 'ready', generated_by: 'muse-spark-1.3' })
  expect(raw.prepare('SELECT COUNT(*) AS n FROM concepts WHERE topic_id = ? AND grounded = 1').get(result.topicId)).toEqual({ n: 16 })
  const calls = raw.prepare('SELECT purpose, ok, COUNT(*) AS n FROM model_calls GROUP BY purpose, ok ORDER BY purpose').all()
  expect(calls).toEqual([
    { purpose: 'curriculum', ok: 1, n: 1 },
    { purpose: 'items', ok: 1, n: 3 },
    { purpose: 'self_check', ok: 1, n: 3 },
  ])
  expect(result.questions).toBe(18)
  expect(raw.prepare('SELECT COUNT(*) AS n FROM items WHERE topic_id = ? AND generated_by = ? AND json_extract(check_json, \'$.keep\') = 1').get(result.topicId, 'muse-spark-1.3')).toEqual({ n: 18 })
  expect(raw.prepare(`SELECT c.critical, a.correct, a.confidence FROM attempts a
    JOIN concepts c ON c.id = a.concept_id JOIN user u ON u.id = a.learner_id WHERE u.email = ?`).all(NORTHWIND.emails.onboarding)).toEqual([{ critical: 1, correct: 0, confidence: 'sure' }])
  expect(raw.prepare('SELECT id FROM user WHERE email = ?').all(NORTHWIND.emails.invited)).toEqual([])

  await signIn(NORTHWIND.emails.owner, secret.ownerPassword)
  const people = await getPeople({ data: { slug: result.slug } })
  expect(people.members.map(({ email, training }) => ({ email, training }))).toEqual(expect.arrayContaining([
    { email: NORTHWIND.emails.owner, training: null },
    { email: NORTHWIND.emails.onboarding, training: { stage: 'onboarding', daysToProficiency: null, criticalConfidentErrors: 1 } },
    { email: NORTHWIND.emails.proficient, training: { stage: 'proficient', daysToProficiency: 6, criticalConfidentErrors: 0 } },
  ]))
  expect(people.members).toHaveLength(3)
  expect(people.invites).toEqual([expect.objectContaining({ email: NORTHWIND.emails.invited, expired: false, jobRole: 'Warehouse picker' })])
  expect(await getOrgOverview({ data: { slug: result.slug } })).toMatchObject({ training: { proficientEmployees: 1, daysToProficiency: 6 } })
  await signIn(NORTHWIND.emails.onboarding, secret.learnerPassword)

  raw.prepare('UPDATE learner_concept SET p_known = 0.32 WHERE learner_id = (SELECT id FROM user WHERE email = ?)').run(NORTHWIND.emails.onboarding)
  const progress = raw.prepare('SELECT * FROM learner_concept ORDER BY learner_id, concept_id').all()
  const attempts = raw.prepare('SELECT * FROM attempts ORDER BY id').all()
  const accounts = raw.prepare('SELECT id, user_id, password FROM account ORDER BY id').all()
  const modelCalls = fetchModel.mock.calls.length
  await expect(seedNorthwind({ sopText, ...passwords(), now: now + 86_400_000 })).resolves.toEqual(result)
  expect(raw.prepare('SELECT * FROM learner_concept ORDER BY learner_id, concept_id').all()).toEqual(progress)
  expect(raw.prepare('SELECT * FROM attempts ORDER BY id').all()).toEqual(attempts)
  expect(raw.prepare('SELECT id, user_id, password FROM account ORDER BY id').all()).toEqual(accounts)
  expect(fetchModel).toHaveBeenCalledTimes(modelCalls)
  await signIn(NORTHWIND.emails.owner, secret.ownerPassword)
})

it('refuses to overwrite an unrelated company using the reserved slug', async () => {
  raw.prepare('INSERT INTO organization (id, name, slug, created_at, metadata) VALUES (?, ?, ?, ?, ?)')
    .run('unrelated-company', 'Existing business', NORTHWIND.slug, now, JSON.stringify({ existing: true }))
  const before = raw.prepare('SELECT * FROM organization').all()
  await expect(seedNorthwind({ sopText, ...passwords(), now })).rejects.toMatchObject({ status: 409 })
  expect(raw.prepare('SELECT * FROM organization').all()).toEqual(before)
  expect(raw.prepare('SELECT COUNT(*) AS n FROM user').get()).toEqual({ n: 0 })
  expect(raw.prepare('SELECT COUNT(*) AS n FROM job_roles').get()).toEqual({ n: 0 })
  expect(fetchModel).not.toHaveBeenCalled()
})
