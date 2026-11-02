import { readFileSync } from 'node:fs'
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
import { MAX_VOICE_BYTES } from '@/lib/voice'

let raw: DatabaseSync
const fetchModel = vi.fn()
const row = (sql: string) => raw.prepare(sql).get() as Record<string, unknown>

beforeAll(() => {
  raw = new DatabaseSync(':memory:')
  raw.exec(readFileSync(new URL('../../drizzle/0000_scaffold.sql', import.meta.url), 'utf8').replaceAll('--> statement-breakpoint', ''))
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
  Object.assign(getEnv(), { VOICE_ENABLED: 'true', LLM_PROFILE: 'meta' })
  vi.useFakeTimers({ toFake: ['Date'] })
  vi.setSystemTime(new Date('2026-11-02T12:00:00Z'))
  fetchModel.mockReset().mockResolvedValue(Response.json({ transcript: 'one' }))
  vi.stubGlobal('fetch', fetchModel)
})
afterEach(() => { raw.exec('ROLLBACK TO voice_test; RELEASE voice_test'); vi.unstubAllGlobals(); vi.useRealTimers() })
afterAll(() => raw.close())

function recording() {
  const bytes = new ArrayBuffer(48_044)
  const view = new DataView(bytes)
  const text = (at: number, value: string) => [...value].forEach((c, i) => view.setUint8(at + i, c.charCodeAt(0)))
  text(0, 'RIFF'); text(8, 'WAVEfmt '); text(36, 'data')
  view.setUint32(4, bytes.byteLength - 8, true); view.setUint32(16, 16, true)
  view.setUint16(20, 1, true); view.setUint16(22, 1, true)
  view.setUint32(24, 24_000, true); view.setUint32(28, 48_000, true)
  view.setUint16(32, 2, true); view.setUint16(34, 16, true); view.setUint32(40, 48_000, true)
  return new File([bytes], 'answer.wav', { type: 'audio/wav' })
}
function upload(audio = recording(), itemId = 'i1') {
  const data = new FormData()
  data.append('sessionId', 's1'); data.append('itemId', itemId); data.append('audio', audio)
  return { data }
}

it('transcribes an owned current answer, logs voice, and grades the learner’s edited transcript', async () => {
  expect((await getSession({ data: { sessionId: 's1' } })).voiceEnabled).toBe(true)
  const transcript = await transcribeAnswer(upload())
  expect(transcript).toBe('one')
  expect(fetchModel).toHaveBeenCalledTimes(1)
  const [url, request] = fetchModel.mock.calls[0] as [string, RequestInit]
  expect(url).toBe('https://llm.example/v1/asr/transcribe')
  expect(request.method).toBe('POST')
  expect(request.headers).toEqual({ authorization: 'Bearer test-key' })
  const body = request.body as FormData
  expect(JSON.parse(await (body.get('request') as Blob).text())).toEqual({ model: 'muse-voice-transcribe-1.0', mode: 'PUSH_TO_TALK', audioEncoding: 'WAV' })
  expect(new Uint8Array(await (body.get('audio') as File).arrayBuffer())).toEqual(new Uint8Array(await recording().arrayBuffer()))
  expect(row('SELECT learner_id, session_id, purpose, model, ok, error FROM model_calls')).toEqual({
    learner_id: 'u1', session_id: 's1', purpose: 'voice', model: 'muse-voice-transcribe-1.0', ok: 1, error: null,
  })
  expect(row('SELECT COUNT(*) AS n FROM attempts').n).toBe(0)
  const reveal = await answerItem({ data: { sessionId: 's1', itemId: 'i1', answer: { text: '1' }, confidence: 'sure', responseMs: 1500 } })
  expect(reveal).toMatchObject({ correct: true, correctAnswer: '1', state: 'A' })
  expect(row('SELECT answer_json, correct FROM attempts')).toEqual({ answer_json: '{"text":"1"}', correct: 1 })
})

it.each([
  { name: 'unsigned learner', status: 401, setup: () => { holder.learnerId = null } },
  { name: 'another learner’s session', status: 404, setup: () => { holder.learnerId = 'u2' } },
  { name: 'disabled flag', status: 404, setup: () => { getEnv().VOICE_ENABLED = 'false' } },
  { name: 'local profile', status: 404, setup: () => { getEnv().LLM_PROFILE = 'ollama' } },
  { name: 'ended session', status: 409, setup: () => { raw.exec('UPDATE sessions SET ended_at = 2') } },
  { name: 'answered question', status: 409, setup: () => { raw.exec(`UPDATE sessions SET plan_json = json_set(plan_json, '$.answered', json('true'))`) } },
  { name: 'stale question', status: 409, setup: () => { raw.exec(`UPDATE sessions SET item_ids_json = '["i2"]'`) } },
  { name: 'multiple choice', status: 400, setup: () => { raw.exec(`UPDATE items SET payload_json = json_set(payload_json, '$.format', 'mcq')`) } },
])('refuses $name before calling or logging the model', async ({ status, setup }) => {
  setup()
  await expect(transcribeAnswer(upload())).rejects.toMatchObject({ status })
  expect(fetchModel).not.toHaveBeenCalled()
  expect(row('SELECT COUNT(*) AS n FROM model_calls').n).toBe(0)
})

it.each([
  { name: 'WebM disguised as WAV', audio: () => new File(['this is not a WAV'.repeat(4)], 'answer.wav', { type: 'audio/wav' }) },
  { name: 'empty recording', audio: () => new File([], 'answer.wav') },
  { name: 'overlong recording', audio: () => new File([new Uint8Array(MAX_VOICE_BYTES + 2)], 'answer.wav') },
  { name: 'unsupported sample rate', audio: async () => {
    const bytes = await recording().arrayBuffer(); new DataView(bytes).setUint32(24, 48_000, true)
    return new File([bytes], 'answer.wav')
  } },
])('rejects $name without spending a model call', async ({ audio }) => {
  await expect(transcribeAnswer(upload(await audio()))).rejects.toMatchObject({ status: 400 })
  expect(fetchModel).not.toHaveBeenCalled()
  expect(row('SELECT COUNT(*) AS n FROM model_calls').n).toBe(0)
})

it('enforces the daily cap for voice without logging an extra call', async () => {
  const insert = raw.prepare('INSERT INTO model_calls (id, learner_id, purpose, model, latency_ms, ok, created_at) VALUES (?, ?, ?, ?, ?, ?, ?)')
  for (let i = 0; i < 20; i++) insert.run(`call-${i}`, 'u1', 'items', 'muse-spark-1.3', 0, 1, Date.now())
  await expect(transcribeAnswer(upload())).rejects.toMatchObject({ status: 429 })
  expect(fetchModel).not.toHaveBeenCalled()
  expect(row('SELECT COUNT(*) AS n FROM model_calls').n).toBe(20)
})

it.each([
  { name: 'provider error', response: () => new Response('sensitive provider body test-key', { status: 503 }), status: 502 },
  { name: 'empty transcript', response: () => Response.json({ transcript: ' ' }), status: 422 },
  { name: 'network error', response: () => { throw new Error('sensitive network error test-key') }, status: 502 },
])('logs a safe voice failure for $name and keeps the question unanswered', async ({ response, status }) => {
  fetchModel.mockImplementationOnce(response)
  await expect(transcribeAnswer(upload())).rejects.toMatchObject({ status })
  const log = row('SELECT purpose, model, ok, error FROM model_calls')
  expect(log).toMatchObject({ purpose: 'voice', model: 'muse-voice-transcribe-1.0', ok: 0 })
  expect(log.error).not.toMatch(/sensitive|test-key/)
  expect(row('SELECT COUNT(*) AS n FROM attempts').n).toBe(0)
  expect(JSON.parse(row('SELECT plan_json FROM sessions').plan_json as string).answered).toBe(false)
})
