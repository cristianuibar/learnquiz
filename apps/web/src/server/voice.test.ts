import { readFileSync, readdirSync } from 'node:fs'
import { DatabaseSync } from 'node:sqlite'
import { drizzle } from 'drizzle-orm/sqlite-proxy'
import { afterAll, afterEach, beforeAll, beforeEach, expect, it, vi } from 'vitest'

const holder = vi.hoisted(() => ({ db: null as unknown, learnerId: 'u1' as string | null }))
vi.mock('@/db', () => ({ getDb: () => holder.db }))
vi.mock('@/server/session', () => ({ requireLearnerId: async () => {
  if (!holder.learnerId) throw Object.assign(new Error('Sign in first'), { status: 401 })
  return holder.learnerId
} }))
vi.mock('cloudflare:workers', () => ({ env: {
  LLM_PROFILE: 'meta', VOICE_ENABLED: 'true', LLM_BASE_URL: 'https://llm.example/v1', LLM_MODEL: 'muse-spark-1.3', LLM_API_KEY: 'test-key',
} }))
// Only the transport wrapper is replaced; validation, handlers, queries, model
// client and log writes run for real. HTTP and request authentication are faked.
vi.mock('@tanstack/react-start', () => ({ createServerFn: () => ({
  validator: (validator: { parse: (data: unknown) => unknown } | ((data: unknown) => unknown)) => ({
    handler: (fn: (input: { data: unknown }) => unknown) => ({ data }: { data: unknown }) => fn({
      data: typeof validator === 'function' ? validator(data) : validator.parse(data),
    }),
  }),
}) }))

import { getEnv } from '@/server/env'
import { answerItem, getSession, transcribeAnswer } from './play'

let raw: DatabaseSync
const fetchModel = vi.fn()
const row = (sql: string) => raw.prepare(sql).get() as Record<string, unknown>

beforeAll(() => {
  raw = new DatabaseSync(':memory:')
  for (const file of readdirSync('drizzle').filter((file) => file.endsWith('.sql')).sort()) {
    raw.exec(readFileSync(`drizzle/${file}`, 'utf8').replaceAll('--> statement-breakpoint', ''))
  }
  const run = (sql: string, params: unknown[], method: string) => {
    const stmt = raw.prepare(sql)
    ;(stmt as unknown as { setReturnArrays: (value: boolean) => void }).setReturnArrays(true)
    const values = params as (string | number | null)[]
    if (method === 'run') { stmt.run(...values); return { rows: [] } }
    return { rows: method === 'get' ? stmt.get(...values) as unknown as unknown[] : stmt.all(...values) as unknown as unknown[][] }
  }
  holder.db = drizzle(async (sql, params, method) => run(sql, params, method), async (batch) => batch.map((q) => run(q.sql, q.params, q.method)))
  raw.exec(`
    INSERT INTO topics (id, learner_id, title, status, created_at) VALUES ('t1', 'u1', 'Algebra', 'ready', 1);
    INSERT INTO learner_topic (learner_id, topic_id) VALUES ('u1', 't1');
    INSERT INTO units (id, topic_id, "order", name) VALUES ('un1', 't1', 0, 'Basics');
    INSERT INTO concepts (id, topic_id, unit_id, "order", name, summary) VALUES ('c1', 't1', 'un1', 0, 'Variables', '');
    INSERT INTO sessions (id, learner_id, topic_id, kind, started_at, item_ids_json, plan_json)
    VALUES ('s1', 'u1', 't1', 'session', 1, '["i1"]', '{"position":0,"answered":false,"queue":["i1"],"reinserted":[],"reasons":{"due":1,"frontier":0,"closers":0},"unitStart":{}}');
  `)
  raw.prepare('INSERT INTO items (id, concept_id, topic_id, format, payload_json, difficulty_prior, created_at) VALUES (?, ?, ?, ?, ?, ?, ?)').run(
    'i1', 'c1', 't1', 'cloze', JSON.stringify({ format: 'cloze', stem: 'x + 1 = 2; x = ____', options: [], accepted_answers: ['1'], model_answer: '1', explanation: 'Subtract one.', difficulty: 1, source_quote: null, grounded: false, bloom: 'apply' }), 1, 1,
  )
})

beforeEach(() => {
  raw.exec('SAVEPOINT voice_test')
  holder.learnerId = 'u1'
  Object.assign(getEnv(), { LLM_PROFILE: 'meta', JOB_MODELS: undefined })
  vi.useFakeTimers({ toFake: ['Date'] })
  vi.setSystemTime(new Date('2026-11-02T12:00:00Z'))
  fetchModel.mockReset().mockResolvedValue(Response.json({ transcript: 'one' }))
  vi.stubGlobal('fetch', fetchModel)
})
afterEach(() => { raw.exec('ROLLBACK TO voice_test; RELEASE voice_test'); vi.unstubAllGlobals(); vi.useRealTimers() })
afterAll(() => raw.close())

function upload() {
  const data = new FormData()
  data.append('sessionId', 's1'); data.append('itemId', 'i1'); data.append('audio', new File([new Uint8Array(48_044)], 'answer.wav', { type: 'audio/wav' }))
  return { data }
}

// The old VOICE_ENABLED flag and a Muse Voice mapping no longer turn transcription on.
it('keeps voice off, refuses a recording without a model call, and still grades the typed answer', async () => {
  getEnv().JOB_MODELS = JSON.stringify({ voice: { provider: 'meta', model: 'muse-voice-transcribe-1.0' } })
  expect((await getSession({ data: { sessionId: 's1' } })).voiceEnabled).toBeFalsy()
  await expect(transcribeAnswer(upload())).rejects.toMatchObject({ status: 404, message: 'Voice answers are unavailable. Type your answer instead.' })
  const reveal = await answerItem({ data: { sessionId: 's1', itemId: 'i1', answer: { text: '1' }, confidence: 'sure', responseMs: 1500 } })
  expect(reveal).toMatchObject({ correct: true, correctAnswer: '1', state: 'A' })
  expect(row('SELECT answer_json, correct FROM attempts')).toEqual({ answer_json: '{"text":"1"}', correct: 1 })
  expect(fetchModel).not.toHaveBeenCalled()
  expect(row('SELECT COUNT(*) AS n FROM model_calls').n).toBe(0)
})

it('refuses an unsigned learner before anything else', async () => {
  holder.learnerId = null
  await expect(transcribeAnswer(upload())).rejects.toMatchObject({ status: 401 })
  expect(fetchModel).not.toHaveBeenCalled()
})
