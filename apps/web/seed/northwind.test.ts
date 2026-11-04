import { readFileSync, readdirSync } from 'node:fs'
import { DatabaseSync } from 'node:sqlite'
import { afterAll, afterEach, beforeAll, beforeEach, expect, it, vi } from 'vitest'
import { getAuth } from '@/server/auth'
import { drainConceptQueue } from '@/server/concept-gen'
import { getOrgOverview } from '@/server/org'
import { getPeople } from '@/server/people'
import { getProfile } from '@/server/profile'
import { getQuestionReview } from '@/server/question-review'
import { retireRoleDocument } from '@/server/role-documents'
import { NORTHWIND, seedNorthwind } from './northwind'

const request = vi.hoisted(() => ({ headers: new Headers() }))
const background = vi.hoisted(() => [] as Promise<unknown>[])
const media = vi.hoisted(() => ({ objects: new Map<string, { body: unknown; options?: { httpMetadata?: { contentType?: string } } }>() }))
const bindings = vi.hoisted(() => ({ waitUntil: (task: Promise<unknown>) => { background.push(task) }, env: {
  DB: null as unknown,
  MEDIA: { put: async (key: string, body: unknown, options?: { httpMetadata?: { contentType?: string } }) => { media.objects.set(key, { body, options }) }, get: async (key: string) => media.objects.get(key) ?? null },
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
  createServerOnlyFn: (fn: unknown) => fn,
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
const shortOnly = new Set<string>()
beforeEach(() => {
  shortOnly.clear()
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
    const quote = prompt.match(/^Quote: "([\s\S]+?)"$/m)![1]
    if (shortOnly.has(concept)) {
      return reply({ items: Array.from({ length: 6 }, (_, index) => ({
        format: 'short', stem: `${concept}: explain the step. (${index + 1})`, options: [],
        accepted_answers: [], model_answer: quote, explanation: quote, difficulty: 3,
        source_quote: quote, grounded: true, bloom: 'apply',
      })) })
    }
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
  const learnerOf = (email: string) => (raw.prepare('SELECT id FROM user WHERE email = ?').get(email) as { id: string }).id
  const morgan = learnerOf(NORTHWIND.emails.onboarding)
  const sam = learnerOf(NORTHWIND.emails.proficient)
  expect(raw.prepare('SELECT name FROM concepts WHERE topic_id = ? AND critical = 1 ORDER BY name').all(result.topicId).map((c) => c.name)).toEqual(['Check handling labels', 'Hold discrepancies', 'Quarantine returns', 'Resolve scan mismatches', 'Separate pedestrians and vehicles'])
  const own = (id: string) => raw.prepare(`SELECT c.name, i.format, a.correct, a.confidence FROM attempts a JOIN concepts c ON c.id = a.concept_id JOIN items i ON i.id = a.item_id
    WHERE a.learner_id = ? AND a.id NOT LIKE 'northwind-demo-v1:backfill-%'`).all(id)
  expect(own(morgan)).toEqual([{ name: 'Resolve scan mismatches', format: 'mcq', correct: 0, confidence: 'sure' }])
  expect(raw.prepare('SELECT id, correct FROM attempts WHERE learner_id = ? AND item_id = (SELECT item_id FROM attempts WHERE id = ?) AND id NOT LIKE \'northwind-demo-v1:backfill-%\'').all(sam, 'northwind-demo-v1:confident-error')).toEqual([{ id: 'northwind-demo-v1:proficient-answer', correct: 1 }])
  // Each learner gets one practice attempt per concept that already has a gradable question, besides the concept they answered.
  for (const [id, stage] of [[morgan, 'onboarding'], [sam, 'proficient']] as const) {
    const withItems = raw.prepare(`SELECT c.id FROM concepts c WHERE c.topic_id = ? AND EXISTS (SELECT 1 FROM items i WHERE i.concept_id = c.id AND i.status = 'active' AND i.format IN ('mcq', 'cloze'))
      AND NOT EXISTS (SELECT 1 FROM attempts a WHERE a.concept_id = c.id AND a.learner_id = ? AND a.id NOT LIKE 'northwind-demo-v1:backfill-%') ORDER BY c.id`).all(result.topicId, id).map((c) => c.id)
    const backfill = raw.prepare('SELECT * FROM attempts WHERE learner_id = ? AND id LIKE \'northwind-demo-v1:backfill-%\' ORDER BY concept_id').all(id)
    expect(withItems.length).toBeGreaterThanOrEqual(2)
    expect(backfill.map((a) => a.concept_id)).toEqual(withItems)
    expect(backfill.map((a) => a.id)).toEqual(withItems.map((conceptId) => `northwind-demo-v1:backfill-${stage}-${conceptId}`))
    expect(backfill.map((a) => [a.session_id, a.correct, a.score, a.confidence, a.rating, a.response_ms, a.retrievability_before, a.at])).toEqual(backfill.map(() => [null, 1, 1, 'sure', 3, 4000, 0, now - (stage === 'onboarding' ? 1 : 4) * 86_400_000 - 60_000]))
    expect(raw.prepare(`SELECT COUNT(*) AS n FROM attempts a JOIN learner_concept lc ON lc.learner_id = a.learner_id AND lc.concept_id = a.concept_id
      WHERE a.learner_id = ? AND a.id LIKE 'northwind-demo-v1:backfill-%' AND (a.p_known_before IS NOT lc.p_known OR a.p_known_after IS NOT lc.p_known)`).get(id)).toEqual({ n: 0 })
  }
  // The company question queue drains every seeded concept, not only the three the seed generates itself.
  await Promise.all(background.splice(0))
  while (await drainConceptQueue()) { /* the cron drain repeats until nothing is due */ }
  expect(raw.prepare(`SELECT gen_status AS status, COUNT(*) AS n FROM concepts c WHERE topic_id = ?
    AND (SELECT COUNT(*) FROM items i WHERE i.concept_id = c.id AND i.status = 'active') >= 6 GROUP BY gen_status`).all(result.topicId)).toEqual([{ status: 'ready', n: 16 }])
  const calls = raw.prepare('SELECT purpose, ok, COUNT(*) AS n FROM model_calls GROUP BY purpose, ok ORDER BY purpose').all() as { purpose: string; ok: number; n: number }[]
  expect(calls.filter((call) => !call.ok)).toEqual([])
  expect(calls.find((call) => call.purpose === 'curriculum')).toEqual({ purpose: 'curriculum', ok: 1, n: 1 })
  const questions = raw.prepare('SELECT COUNT(*) AS n FROM items WHERE topic_id = ? AND status = \'active\'').get(result.topicId) as { n: number }
  expect(raw.prepare('SELECT COUNT(*) AS n FROM items WHERE topic_id = ? AND generated_by = ? AND json_extract(check_json, \'$.keep\') = 1').get(result.topicId, 'muse-spark-1.3')).toEqual({ n: questions.n - 1 })
  // The authored label question carries its image, stored in R2 beside the item.
  const label = raw.prepare('SELECT payload_json FROM items WHERE id = ? AND status = \'active\'').get('northwind-demo-v1:label-item') as { payload_json: string }
  expect(JSON.parse(label.payload_json).image).toMatchObject({ key: 'label.svg', width: 640, height: 300 })
  expect(media.objects.get('items/northwind-demo-v1:label-item/label.svg')).toMatchObject({ options: { httpMetadata: { contentType: 'image/svg+xml' } } })
  const labelSource = () => raw.prepare('SELECT source_id, source_version = (SELECT version FROM sources WHERE id = ?) AS same FROM items WHERE id = ?').get(NORTHWIND.sourceId, 'northwind-demo-v1:label-item')
  expect(labelSource()).toEqual({ source_id: NORTHWIND.sourceId, same: 1 })
  expect(raw.prepare('SELECT id FROM user WHERE email = ?').all(NORTHWIND.emails.invited)).toEqual([])

  await signIn(NORTHWIND.emails.owner, secret.ownerPassword)
  const people = await getPeople({ data: { slug: result.slug } })
  expect(people.people.map((p) => p.kind === 'member'
    ? { email: p.email, status: p.status, openCriticalErrors: p.openCriticalErrors, proficientInDays: p.proficientInDays, lastActiveAt: p.lastActiveAt }
    : { email: p.email, status: p.status, jobRole: p.jobRole })).toEqual(expect.arrayContaining([
    { email: NORTHWIND.emails.onboarding, status: 'active', openCriticalErrors: 1, proficientInDays: null, lastActiveAt: now - 86_400_000 - 60_000 },
    { email: NORTHWIND.emails.proficient, status: 'proficient', openCriticalErrors: 0, proficientInDays: 6, lastActiveAt: now - 4 * 86_400_000 - 60_000 },
    { email: NORTHWIND.emails.invited, status: 'invited', jobRole: 'Warehouse picker' },
  ]))
  // The owner has no job role, so does not train and is not listed.
  expect(people.people).toHaveLength(3)
  const overview = await getOrgOverview({ data: { slug: result.slug } })
  expect(overview).toMatchObject({ training: { employees: 3, proficientEmployees: 1, daysToProficiency: 6, criticalErrorsThisWeek: 1, documentsToReview: 1 } })
  const review = await getQuestionReview({ data: { slug: result.slug, roleId: NORTHWIND.roleId } })
  expect(overview.nextStep!.unreviewed).toBe(review.unreviewed)
  expect(overview.nextStep!.documentTitle).toBe('Warehouse picker SOP')
  expect((await getProfile({ data: { org: result.slug, learnerId: morgan } })).confidentErrors.map((e) => e.concept)).toEqual(['Resolve scan mismatches'])
  const samMastery = (await getProfile({ data: { org: result.slug, learnerId: sam } })).mastery

  raw.prepare('UPDATE learner_concept SET p_known = 0.32 WHERE learner_id = (SELECT id FROM user WHERE email = ?)').run(NORTHWIND.emails.onboarding)
  const progress = raw.prepare('SELECT * FROM learner_concept ORDER BY learner_id, concept_id').all()
  const attempts = raw.prepare('SELECT * FROM attempts ORDER BY id').all()
  const oldIds = new Set(attempts.map((a) => a.id))
  const accounts = raw.prepare('SELECT id, user_id, password FROM account ORDER BY id').all()
  const modelCalls = fetchModel.mock.calls.length
  // A topic seeded before it carried its company is repaired on rerun.
  raw.prepare('UPDATE topics SET org_id = NULL WHERE id = ?').run(result.topicId)
  raw.prepare('UPDATE items SET source_id = NULL, source_version = NULL WHERE id = ?').run('northwind-demo-v1:label-item')
  await expect(seedNorthwind({ sopText, ...passwords(), now: now + 86_400_000 })).resolves.toEqual({ ...result, questions: questions.n })
  expect(raw.prepare('SELECT * FROM learner_concept ORDER BY learner_id, concept_id').all()).toEqual(progress)
  const after = raw.prepare('SELECT * FROM attempts ORDER BY id').all()
  expect(after.filter((a) => oldIds.has(a.id))).toEqual(attempts)
  const withItems = raw.prepare(`SELECT c.id FROM concepts c WHERE c.topic_id = ? AND EXISTS (SELECT 1 FROM items i WHERE i.concept_id = c.id AND i.status = 'active' AND i.format IN ('mcq', 'cloze')) ORDER BY c.id`).all(result.topicId).map((c) => c.id)
  expect(withItems).toHaveLength(16)
  for (const id of [morgan, sam]) {
    expect(raw.prepare('SELECT concept_id FROM attempts WHERE learner_id = ? GROUP BY concept_id HAVING COUNT(*) = 1 ORDER BY concept_id').all(id).map((a) => a.concept_id)).toEqual(withItems)
    expect(raw.prepare('SELECT COUNT(*) AS n FROM attempts WHERE learner_id = ?').get(id)).toEqual({ n: 16 })
  }
  const added = after.filter((a) => !oldIds.has(a.id) && a.learner_id === morgan)
  expect(added).toHaveLength(16 - attempts.filter((a) => a.learner_id === morgan).length)
  expect(added.map((a) => [a.p_known_before, a.p_known_after])).toEqual(added.map(() => [0.32, 0.32]))
  expect(labelSource()).toEqual({ source_id: NORTHWIND.sourceId, same: 1 })
  await expect(seedNorthwind({ sopText, ...passwords(), now: now + 2 * 86_400_000 })).resolves.toEqual({ ...result, questions: questions.n })
  expect(raw.prepare('SELECT * FROM attempts ORDER BY id').all()).toEqual(after)
  expect(raw.prepare('SELECT id, user_id, password FROM account ORDER BY id').all()).toEqual(accounts)
  expect(fetchModel).toHaveBeenCalledTimes(modelCalls)
  expect(raw.prepare('SELECT o.slug FROM topics t JOIN organization o ON o.id = t.org_id WHERE t.id = ?').get(result.topicId)).toEqual({ slug: NORTHWIND.slug })
  await signIn(NORTHWIND.emails.owner, secret.ownerPassword)
  const samProfile = await getProfile({ data: { org: result.slug, learnerId: sam } })
  expect(samProfile.units.map((u) => u.state)).toEqual(samProfile.units.map(() => 'mastered'))
  expect(samProfile.units.flatMap((u) => u.concepts).filter((c) => withItems.includes(c.id)).every((c) => c.measured)).toBe(true)
  expect(samProfile.mastery).toBe(samMastery)
  // Retiring the SOP retires the authored label question with the generated ones.
  await retireRoleDocument({ data: { slug: result.slug, roleId: NORTHWIND.roleId, sourceId: NORTHWIND.sourceId } })
  expect(raw.prepare('SELECT status FROM items WHERE id = ?').get('northwind-demo-v1:label-item')).toEqual({ status: 'retired' })
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

it('regenerates the critical step on rerun when no multiple-choice question was kept', async () => {
  const secret = passwords()
  // The demo concept gets no multiple-choice question from the self-check, so the seed rejects until a rerun regenerates it.
  shortOnly.add('Resolve scan mismatches')
  await expect(seedNorthwind({ sopText, ...secret, now })).rejects.toMatchObject({ status: 422 })
  await Promise.all(background.splice(0))
  expect(raw.prepare(`SELECT DISTINCT i.format FROM items i JOIN concepts c ON c.id = i.concept_id WHERE c.name = ?`).all('Resolve scan mismatches')).toEqual([{ format: 'short' }])

  shortOnly.clear()
  await expect(seedNorthwind({ sopText, ...secret, now })).resolves.toMatchObject({ slug: NORTHWIND.slug, concepts: 16 })
  expect(raw.prepare(`SELECT c.name, i.format, a.correct FROM attempts a JOIN items i ON i.id = a.item_id JOIN concepts c ON c.id = a.concept_id
    JOIN user u ON u.id = a.learner_id WHERE u.email = ? AND a.id NOT LIKE 'northwind-demo-v1:backfill-%'`).all(NORTHWIND.emails.onboarding)).toEqual([{ name: 'Resolve scan mismatches', format: 'mcq', correct: 0 }])
})
