import { readFileSync, readdirSync } from 'node:fs'
import { DatabaseSync } from 'node:sqlite'
import { drizzle } from 'drizzle-orm/sqlite-proxy'
import { afterAll, afterEach, beforeAll, beforeEach, expect, it, vi } from 'vitest'
import type { ItemPayload } from '@/lib/llm/schemas'

const holder = vi.hoisted(() => ({ db: null as unknown, learnerId: 'u1' }))
vi.mock('@/db', () => ({ getDb: () => holder.db }))
vi.mock('@/server/session', () => ({ requireLearnerId: async () => holder.learnerId }))
vi.mock('cloudflare:workers', () => ({ env: {
  LLM_PROFILE: 'meta', LLM_BASE_URL: 'https://llm.example/v1', LLM_MODEL: 'muse-spark-1.3',
} }))
// Keep validation, handlers, the model client and database writes real; replace
// only request transport, authentication, Cloudflare bindings and provider HTTP.
vi.mock('@tanstack/react-start', () => ({ createServerFn: () => ({
  validator: (validator: { parse: (data: unknown) => unknown }) => ({
    handler: (fn: (input: { data: unknown }) => unknown) => ({ data }: { data: unknown }) => fn({ data: validator.parse(data) }),
  }),
}) }))

import { answerItem, endSession, getSession, nextItem, startSession } from './play'

let raw: DatabaseSync
const fetchModel = vi.fn()
const row = (sql: string) => raw.prepare(sql).get() as Record<string, unknown>
const payload: ItemPayload = {
  format: 'short', stem: 'Explain why subtracting one from both sides preserves an equation.', options: [], accepted_answers: [],
  model_answer: 'Applying the same subtraction to equal quantities keeps them equal.',
  explanation: 'Both sides change by the same amount.', difficulty: 2,
  source_quote: 'Subtracting the same quantity from equal quantities leaves equal quantities.', grounded: true, bloom: 'understand',
}
const request = { data: { sessionId: 's1', itemId: 'i1', answer: { text: 'Both sides get smaller.' }, confidence: 'sure' as const, responseMs: 1500 } }
const completion = (value: unknown) => Response.json({
  choices: [{ message: { content: JSON.stringify(value) }, finish_reason: 'stop' }],
  usage: { prompt_tokens: 100, completion_tokens: 30 },
})

beforeAll(() => {
  raw = new DatabaseSync(':memory:')
  for (const file of readdirSync('drizzle').filter((f) => f.endsWith('.sql')).sort()) {
    raw.exec(readFileSync(`drizzle/${file}`, 'utf8').replaceAll('--> statement-breakpoint', ''))
  }
  const run = (sql: string, params: unknown[], method: string) => {
    const stmt = raw.prepare(sql)
    stmt.setReturnArrays(true)
    const values = params as (string | number | null)[]
    if (method === 'run') { stmt.run(...values); return { rows: [] } }
    return { rows: (method === 'get' ? stmt.get(...values) : stmt.all(...values)) as unknown[] }
  }
  holder.db = drizzle(async (sql, params, method) => run(sql, params, method), async (batch) => batch.map((q) => run(q.sql, q.params, q.method)))
  raw.exec(`
    INSERT INTO topics (id, learner_id, title, status, created_at) VALUES ('t1', 'u1', 'Algebra', 'ready', 1);
    INSERT INTO learner_topic (learner_id, topic_id) VALUES ('u1', 't1');
    INSERT INTO units (id, topic_id, "order", name) VALUES ('un1', 't1', 0, 'Basics');
    INSERT INTO learner_unit (learner_id, unit_id, unlocked_at) VALUES ('u1', 'un1', 1);
    INSERT INTO concepts (id, topic_id, unit_id, "order", name, summary) VALUES ('c1', 't1', 'un1', 0, 'Equality', 'Equivalent equations');
    INSERT INTO learner_concept (learner_id, concept_id, p_known, n_attempts, updated_at) VALUES ('u1', 'c1', 0.6, 2, 1);
    INSERT INTO sessions (id, learner_id, topic_id, kind, started_at, item_ids_json, plan_json)
    VALUES ('s1', 'u1', 't1', 'session', 1, '["i1","i2"]', '{"position":0,"answered":false,"queue":["i1","i2"],"reinserted":[],"reasons":{"due":2,"frontier":0,"closers":0},"unitStart":{}}');
  `)
  for (const id of ['i1', 'i2']) {
    raw.prepare('INSERT INTO items (id, concept_id, topic_id, format, payload_json, difficulty_prior, created_at) VALUES (?, ?, ?, ?, ?, ?, ?)')
      .run(id, 'c1', 't1', 'short', JSON.stringify(payload), 2, 1)
  }
})
beforeEach(() => {
  raw.exec('SAVEPOINT short_test')
  holder.learnerId = 'u1'
  vi.useFakeTimers({ toFake: ['Date'] })
  vi.setSystemTime(new Date('2026-11-02T12:00:00Z'))
  fetchModel.mockReset()
  vi.stubGlobal('fetch', fetchModel)
})
afterEach(() => { raw.exec('ROLLBACK TO short_test; RELEASE short_test'); vi.unstubAllGlobals(); vi.useRealTimers() })
afterAll(() => raw.close())

it.each([0.5, 0.8, 1])('returns and stores a short-answer score of %s with feedback, missing points and a grade log', async (score) => {
  const grade = { score, feedback: 'Explain why equality is preserved.', missing_points: score === 1 ? [] : ['The same amount is subtracted from both sides.'] }
  fetchModel.mockResolvedValueOnce(completion(grade))

  const reveal = await answerItem(request)

  expect(reveal).toMatchObject({ score, feedback: grade.feedback, missingPoints: grade.missing_points, correct: score >= 0.8, state: score >= 0.8 ? 'A' : 'D', correctAnswer: payload.model_answer })
  expect(row('SELECT score, correct, answer_json, grade_json FROM attempts')).toEqual({
    score, correct: score >= 0.8 ? 1 : 0, answer_json: JSON.stringify(request.data.answer),
    grade_json: JSON.stringify({ correctAnswer: payload.model_answer, ...grade }),
  })
  expect(row('SELECT learner_id, session_id, purpose, model, ok, error FROM model_calls')).toEqual({
    learner_id: 'u1', session_id: 's1', purpose: 'grade', model: 'muse-spark-1.3', ok: 1, error: null,
  })
  const [url, options] = fetchModel.mock.calls[0] as [string, RequestInit]
  expect(url).toBe('https://llm.example/v1/chat/completions')
  const body = JSON.parse(options.body as string)
  expect(body.response_format.json_schema.name).toBe('grade')
  expect(JSON.parse(body.messages[1].content)).toEqual({ question: payload.stem, model_answer: payload.model_answer, source_quote: payload.source_quote, learner_answer: request.data.answer.text })
  expect(JSON.parse(row('SELECT plan_json FROM sessions').plan_json as string).answered).toBe(true)
})

const PLAIN_FEEDBACK = 'Compare your answer with the model answer. Your learning progress has not changed.'

it.each([
  { name: 'provider failure', response: () => new Response('Unavailable', { status: 503 }), calls: 1 },
  { name: 'provider rate limit (HTTP 429)', response: () => new Response('Too many', { status: 429 }), calls: 1 },
  { name: 'invalid score after retry', response: () => completion({ score: 2, feedback: 'Incorrect scale', missing_points: [] }), calls: 2 },
  { name: 'network failure', response: () => { throw new TypeError('Failed to fetch') }, calls: 1 },
])('reveals neutrally after $name without changing learning progress and allows Continue', async ({ response, calls }) => {
  fetchModel.mockImplementation(response)
  raw.prepare('INSERT INTO learner_item (learner_id, item_id, due, stability, difficulty, state, reps, last_wrong_confident_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?)')
    .run('u1', 'i1', Date.now(), 5, 4, 2, 3, 1)
  const before = row('SELECT * FROM learner_concept')
  const scheduleBefore = row('SELECT * FROM learner_item')

  const reveal = await answerItem(request)

  expect(reveal.feedback).toBe(PLAIN_FEEDBACK)
  expect(reveal).toMatchObject({ state: 'ungraded', score: null, attemptId: null, correctAnswer: payload.model_answer, missingPoints: [], mixUps: [], returnsThisSession: false, pKnownBefore: 0.6, pKnownAfter: 0.6 })
  expect(row('SELECT * FROM learner_concept')).toEqual(before)
  expect(row('SELECT * FROM learner_item')).toEqual(scheduleBefore)
  expect(row('SELECT COUNT(*) AS n FROM attempts').n).toBe(0)
  expect(row('SELECT xp FROM learner_topic').xp).toBe(0)
  expect(raw.prepare('SELECT purpose, ok FROM model_calls').all()).toEqual(Array.from({ length: calls }, () => ({ purpose: 'grade', ok: 0 })))
  expect((await nextItem({ data: { sessionId: 's1', why: 'my reflection' } })).item?.id).toBe('i2')
  expect(await endSession({ data: { sessionId: 's1' } })).toMatchObject({ correct: 0, total: 0, ungraded: 1 })
})

it.each([
  { who: 'guest', anonymous: true, calls: 20, graded: false },
  { who: 'signed-in learner', anonymous: false, calls: 20, graded: true },
  { who: 'signed-in learner', anonymous: false, calls: 150, graded: false },
])('grades a $who with $calls calls today only below their daily cap', async ({ anonymous, calls, graded }) => {
  raw.prepare('INSERT INTO user (id, name, email, is_anonymous) VALUES (?, ?, ?, ?)').run('u1', 'Learner', 'u1@learnquiz.test', anonymous ? 1 : 0)
  const insert = raw.prepare('INSERT INTO model_calls (id, learner_id, purpose, model, latency_ms, ok, created_at) VALUES (?, ?, ?, ?, ?, ?, ?)')
  for (let i = 0; i < calls; i++) insert.run(`call-${i}`, 'u1', 'items', 'muse-spark-1.3', 0, 1, Date.now())
  fetchModel.mockResolvedValueOnce(completion({ score: 1, feedback: 'Equality is preserved.', missing_points: [] }))

  const reveal = await answerItem(request)

  if (graded) {
    expect(reveal).toMatchObject({ state: 'A', score: 1, feedback: 'Equality is preserved.' })
    expect(row('SELECT COUNT(*) AS n FROM model_calls').n).toBe(calls + 1)
    expect(row('SELECT COUNT(*) AS n FROM attempts').n).toBe(1)
  } else {
    expect(reveal).toMatchObject({ state: 'ungraded', score: null, returnsThisSession: false })
    expect(reveal.feedback).toBe(`Daily grading limit reached; back tomorrow. ${PLAIN_FEEDBACK}`)
    expect(fetchModel).not.toHaveBeenCalled()
    expect(row('SELECT COUNT(*) AS n FROM model_calls').n).toBe(calls)
    expect(row('SELECT COUNT(*) AS n FROM attempts').n).toBe(0)
  }
})

it.each([
  { name: 'every item fails to grade, the last on the daily cap', graded: false, xp: 0 },
  { name: 'items are graded', graded: true, xp: 40 },
])('finishes a session where $name with $xp XP', async ({ graded, xp }) => {
  // A guest one call below the cap: a failed first grade spends the last call, so the second hits the cap.
  raw.prepare('INSERT INTO user (id, name, email, is_anonymous) VALUES (?, ?, ?, ?)').run('u1', 'Learner', 'u1@learnquiz.test', graded ? 0 : 1)
  const insert = raw.prepare('INSERT INTO model_calls (id, learner_id, purpose, model, latency_ms, ok, created_at) VALUES (?, ?, ?, ?, ?, ?, ?)')
  for (let i = 0; i < 19; i++) insert.run(`call-${i}`, 'u1', 'items', 'muse-spark-1.3', 0, 1, Date.now())
  fetchModel.mockImplementation(() => graded ? completion({ score: 1, feedback: 'Correct.', missing_points: [] }) : new Response('Unavailable', { status: 503 }))
  const topicBefore = row('SELECT * FROM learner_topic')

  await answerItem(request)
  await nextItem({ data: { sessionId: 's1' } })
  const last = await answerItem({ data: { ...request.data, itemId: 'i2' } })
  expect(last.state).toBe(graded ? 'A' : 'ungraded')
  if (!graded) expect(last.feedback).toBe(`Daily grading limit reached; back tomorrow. ${PLAIN_FEEDBACK}`)
  expect(await nextItem({ data: { sessionId: 's1' } })).toMatchObject({ ended: true })
  await endSession({ data: { sessionId: 's1' } })

  expect(row('SELECT xp FROM sessions').xp).toBe(xp)
  expect(row('SELECT * FROM learner_topic')).toEqual({ ...topicBefore, xp })
  expect(row('SELECT COUNT(*) AS n FROM learner_item').n).toBe(graded ? 2 : 0)
})

it.each([
  { name: 'another learner', status: 404, setup: () => { holder.learnerId = 'u2' } },
  { name: 'ended session', status: 409, setup: () => { raw.exec('UPDATE sessions SET ended_at = 2') } },
  { name: 'stale question', status: 409, setup: () => { raw.exec(`UPDATE sessions SET item_ids_json = '["i2"]'`) } },
  { name: 'already answered question', status: 409, setup: () => { raw.exec(`UPDATE sessions SET plan_json = json_set(plan_json, '$.answered', json('true'))`) } },
])('refuses $name before spending a grading call', async ({ status, setup }) => {
  setup()
  await expect(answerItem(request)).rejects.toMatchObject({ status })
  expect(fetchModel).not.toHaveBeenCalled()
  expect(row('SELECT COUNT(*) AS n FROM model_calls').n).toBe(0)
  expect(row('SELECT COUNT(*) AS n FROM attempts').n).toBe(0)
})

const graded = () => completion({ score: 1, feedback: 'Correct.', missing_points: [] })
// Holds the grading response until the test releases it.
function heldGrade() {
  let release!: (response: Response | Error) => void
  fetchModel.mockImplementationOnce(() => new Promise<Response>((resolve, reject) => {
    release = (r) => (r instanceof Error ? reject(r) : resolve(r))
  }))
  return (r: Response | Error) => release(r)
}

it('scores concurrent submits of one question once', async () => {
  const release = heldGrade()
  const first = answerItem(request)
  await vi.waitFor(() => expect(fetchModel).toHaveBeenCalledTimes(1))
  const others = await Promise.allSettled([answerItem(request), answerItem(request)])
  release(graded())

  expect(await first).toMatchObject({ correct: true, score: 1 })
  expect(others).toMatchObject([{ status: 'rejected', reason: { status: 409 } }, { status: 'rejected', reason: { status: 409 } }])
  expect(fetchModel).toHaveBeenCalledTimes(1)
  expect(row('SELECT COUNT(*) AS n FROM attempts').n).toBe(1)
  expect(row('SELECT correct_count, xp FROM sessions')).toEqual({ correct_count: 1, xp: 10 })
  expect(row('SELECT xp FROM learner_topic').xp).toBe(10)
  expect(row('SELECT reps FROM learner_item WHERE item_id = \'i1\'').reps).toBe(1)
  expect(row('SELECT n_attempts FROM learner_concept').n_attempts).toBe(3)
})

it('drops a grade that returns after the session ended', async () => {
  const release = heldGrade()
  const answer = answerItem(request)
  await vi.waitFor(() => expect(fetchModel).toHaveBeenCalledTimes(1))
  await endSession({ data: { sessionId: 's1' } })
  const ended = row('SELECT ended_at, plan_json, xp, correct_count FROM sessions')
  release(graded())

  await expect(answer).rejects.toMatchObject({ status: 409, message: 'This session has ended' })
  expect(row('SELECT ended_at, plan_json, xp, correct_count FROM sessions')).toEqual(ended)
  expect(row('SELECT COUNT(*) AS n FROM attempts').n).toBe(0)
  expect(row('SELECT COUNT(*) AS n FROM learner_item').n).toBe(0)
  expect(row('SELECT n_attempts FROM learner_concept').n_attempts).toBe(2)
  expect(row('SELECT xp FROM learner_topic').xp).toBe(0)
})

it.each([
  { name: 'success', late: graded },
  { name: 'failure', late: () => new TypeError('Failed to fetch') },
])('keeps an advanced session when an abandoned grading $name arrives late', async ({ late }) => {
  const release = heldGrade()
  const stale = answerItem(request)
  await vi.waitFor(() => expect(fetchModel).toHaveBeenCalledTimes(1))
  // Past the grading timeout the first claim is abandoned, so a retry takes the slot and advances.
  vi.setSystemTime(Date.now() + 200_000)
  fetchModel.mockResolvedValueOnce(graded())
  expect(await answerItem(request)).toMatchObject({ correct: true })
  expect((await nextItem({ data: { sessionId: 's1' } })).item?.id).toBe('i2')
  release(late())

  await expect(stale).rejects.toMatchObject({ status: 409 })
  expect(JSON.parse(row('SELECT plan_json FROM sessions').plan_json as string)).toMatchObject({ position: 1, answered: false })
  expect(row('SELECT COUNT(*) AS n FROM attempts').n).toBe(1)
  expect(row('SELECT correct_count, xp FROM sessions')).toEqual({ correct_count: 1, xp: 10 })
  expect(row('SELECT reps FROM learner_item WHERE item_id = \'i1\'').reps).toBe(1)
})

it.each([1, 12])('moves past an ungraded placement question and respects the question limit (presented=%s)', async (presented) => {
  const ids = [...Array.from({ length: presented - 1 }, (_, i) => `previous-${i}`), 'i1']
  raw.prepare('UPDATE sessions SET kind = ?, item_ids_json = ?, plan_json = ?').run('placement', JSON.stringify(ids), JSON.stringify({
    position: presented - 1, answered: false, workingLevel: 2, log: [], pool: [{ id: 'i1', conceptId: 'c1', difficulty: 2 }, { id: 'i2', conceptId: 'c1', difficulty: 2 }],
  }))
  fetchModel.mockResolvedValueOnce(new Response('Unavailable', { status: 503 }))
  expect(await answerItem(request)).toMatchObject({ state: 'ungraded' })
  const next = await nextItem({ data: { sessionId: 's1' } })
  expect(next.ended).toBe(presented === 12)
  expect(next.item?.id ?? null).toBe(presented === 12 ? null : 'i2')
  expect(JSON.parse(row('SELECT plan_json FROM sessions').plan_json as string).log).toEqual([])
})

it('allows short items in practice generation and serves the checked items without leaking answers', async () => {
  raw.exec('DELETE FROM items')
  const drafts = Array.from({ length: 6 }, (_, i) => ({ ...payload, stem: `${payload.stem} (${i + 1})` }))
  fetchModel.mockResolvedValueOnce(completion({ items: drafts }))
    .mockResolvedValueOnce(completion({ results: drafts.map((_, index) => ({ index, keep: true, reasons: [] })) }))
    .mockImplementationOnce(async (_url: string, request: RequestInit) => completion({
      steps: JSON.parse(JSON.parse(request.body as string).messages[1].content).candidates
        .map((c: { itemId: string }) => ({ itemId: c.itemId, reason: 'Practise explaining equality.' })),
    }))

  const { sessionId } = await startSession({ data: { topicId: 't1' } })
  const view = await getSession({ data: { sessionId } })

  expect(view.item).toMatchObject({ format: 'short', options: [] })
  expect(view.item).not.toHaveProperty('model_answer')
  expect(row('SELECT COUNT(*) AS n FROM items WHERE format = \'short\'').n).toBe(6)
  const body = JSON.parse((fetchModel.mock.calls[0] as [string, RequestInit])[1].body as string)
  expect(body.messages[0].content).toContain('Allowed formats: mcq, cloze, short.')
  expect(raw.prepare('SELECT purpose, ok FROM model_calls').all()).toEqual([{ purpose: 'items', ok: 1 }, { purpose: 'self_check', ok: 1 }, { purpose: 'plan', ok: 1 }])
})
