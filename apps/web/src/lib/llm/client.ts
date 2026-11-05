import { z } from 'zod'
import { eq } from 'drizzle-orm'
import { getDb } from '@/db'
import { modelCalls } from '@/db/schema'
import { COMPANY_DAILY_MODEL_CALL_CAP, isOverDailyCap } from '@/lib/limits'
import { META_MODELS, PROVIDERS, type ModelJob } from '@/lib/llm/models'
import { getEnv } from '@/server/env'
import { abandonPendingModelCalls, COMPANY_CAP_MESSAGE, companyCallsToday, dailyCapError, reserveModelCall } from '@/server/model-cap'

// USD per million tokens; reasoning tokens bill as output. Unlisted prices are unknown.
export const PRICES: Record<string, { in: number; out: number }> = {
  'muse-spark-1.3': { in: 1.25, out: 4.25 },
}

export class LlmError extends Error {
  status: number
  constructor(message: string, status: number) {
    super(message)
    this.name = 'LlmError'
    this.status = status
  }
}

export class DailyCapError extends LlmError {
  constructor() {
    super('You have reached the daily limit for generating new content. Try again tomorrow.', 429)
    this.name = 'DailyCapError'
  }
}

type Usage = { prompt_tokens?: number; completion_tokens?: number; completion_tokens_details?: { reasoning_tokens?: number } }
type Message = { role: 'system' | 'user' | 'assistant'; content: string }

const PURPOSE_TIMEOUT_MS: Partial<Record<ModelJob, number>> = {
  curriculum: 240_000,
  items: 240_000,
  self_check: 180_000,
  procedure: 180_000,
}

// `fallback` resolves the Meta model that backs up a failed Fireworks call.
export function jobModel(job: ModelJob, fallback = false) {
  const env = getEnv()
  try {
    // Wrangler JSON bindings are objects; .dev.vars can supply JSON strings.
    const mapping: unknown = typeof env.JOB_MODELS === 'string' ? JSON.parse(env.JOB_MODELS) : env.JOB_MODELS === undefined ? {} : env.JOB_MODELS
    const jobs = z.record(z.string(), z.unknown()).parse(mapping)
    const selected = fallback
      ? { provider: 'meta' as const, model: 'muse-spark-1.3' }
      : jobs[job] === undefined
      ? { provider: env.LLM_PROFILE, model: job === 'voice' ? 'muse-voice-transcribe-1.0' : job === 'image' ? env.IMAGE_MODEL : env.LLM_MODEL }
      : z.object({ provider: z.enum(['meta', 'baseten', 'fireworks']), model: z.string().min(1) }).parse(jobs[job])
    const modelId = selected.provider === 'fireworks' ? selected.model.replace(/^accounts\/fireworks\/models\//, '') : selected.model
    if (!META_MODELS.has(modelId)) throw new Error('Only Meta models are supported')
    const provider = selected.provider === 'ollama'
      ? { baseUrl: env.LLM_BASE_URL, keyBinding: 'LLM_API_KEY' as const, jsonMode: 'json_object' as const }
      : PROVIDERS[selected.provider]
    if (!provider) throw new Error('Unknown provider')
    return {
      ...selected,
      modelId,
      baseUrl: (selected.provider === env.LLM_PROFILE ? env.LLM_BASE_URL : provider.baseUrl).replace(/\/$/, ''),
      apiKey: env[provider.keyBinding] || (selected.provider === env.LLM_PROFILE ? env.LLM_API_KEY : undefined),
      jsonMode: provider.jsonMode,
    }
  } catch {
    // Configuration errors must never include bindings or credentials.
    throw new LlmError(`Invalid model configuration for ${job}.`, 503)
  }
}

export function isVoiceEnabled(): boolean {
  if (getEnv().VOICE_ENABLED !== 'true') return false
  try {
    const selected = jobModel('voice')
    return selected.provider === 'meta' && selected.model === 'muse-voice-transcribe-1.0'
  } catch {
    return false
  }
}

export function isImageEnabled(): boolean {
  try {
    const selected = jobModel('image')
    return selected.provider !== 'ollama' && selected.modelId === 'muse-image-1.0'
  } catch {
    return false
  }
}

type ChatJsonOpts<T> = {
  purpose: ModelJob
  schema: z.ZodType<T>
  schemaName: string
  system: string
  user: string
  reasoningEffort?: 'minimal' | 'low' | 'medium' | 'high'
  maxTokens?: number
  timeoutMs?: number
  retry?: boolean
  learnerId?: string | null
  orgId?: string | null // Company calls also count against the company's daily cap.
  sessionId?: string | null
  topicId?: string | null
}

// Calls the model for JSON matching `schema`; defaults to one retry for bad output, then throws LlmError.
export async function chatJson<T>(opts: ChatJsonOpts<T>): Promise<T> {
  return (await chatJsonWithModel(opts)).data
}

// Like chatJson, also returning the model that produced the reply. A failed Fireworks call is repeated once on Meta.
export async function chatJsonWithModel<T>(opts: ChatJsonOpts<T>): Promise<{ data: T; model: string }> {
  const selected = jobModel(opts.purpose)
  try {
    return { data: await callJson(opts, selected), model: selected.model }
  } catch (e) {
    if (selected.provider !== 'fireworks' || !(e instanceof LlmError) || e instanceof DailyCapError || e.message === COMPANY_CAP_MESSAGE) throw e
    console.error('fireworks call failed, falling back to Meta', e.status)
    const meta = jobModel(opts.purpose, true)
    return { data: await callJson(opts, meta), model: meta.model }
  }
}

async function callJson<T>(opts: ChatJsonOpts<T>, selected: ReturnType<typeof jobModel>): Promise<T> {
  const log = { ...opts, model: selected.model }
  const strict = selected.jsonMode === 'json_schema'
  // Strict json_schema is a Meta feature; other profiles get json_object plus the schema in the prompt.
  const { $schema: _, ...jsonSchema } = z.toJSONSchema(opts.schema)
  const messages: Message[] = [
    {
      role: 'system',
      content: strict ? opts.system : `${opts.system}\n\nReply with one JSON object matching this JSON Schema:\n${JSON.stringify(jsonSchema)}`,
    },
    { role: 'user', content: opts.user },
  ]
  const clean = (s: string) => (selected.apiKey ? s.replaceAll(selected.apiKey, '[redacted]') : s).slice(0, 300)

  let failure = ''
  for (let attempt = 0; attempt < (opts.retry === false ? 1 : 2); attempt++) {
    // Daily cap backstop for every attempt: the slot is reserved atomically before fetch,
    // so a capped learner gets a 429 and no new model_calls row, and concurrent calls cannot overshoot.
    const reservedId = await reserve({ ...log, id: crypto.randomUUID() }, opts.orgId)
    if (reservedId === false) {
      if (opts.orgId && (await companyOverCap(opts.orgId))) throw new LlmError(COMPANY_CAP_MESSAGE, 429)
      throw new DailyCapError()
    }

    const started = Date.now()
    let usage: Usage | undefined
    let content = ''
    let cutOff = false
    try {
      let res: Response
      try {
        res = await fetch(`${selected.baseUrl}/chat/completions`, {
          method: 'POST',
          headers: { 'content-type': 'application/json', ...(selected.apiKey && { authorization: `Bearer ${selected.apiKey}` }) },
          body: JSON.stringify({
            model: selected.model,
            messages,
            max_tokens: opts.maxTokens ?? 8192, // reasoning tokens spend this budget too
            ...(selected.provider === 'meta' && opts.reasoningEffort && { reasoning_effort: opts.reasoningEffort }),
            response_format: strict
              ? { type: 'json_schema', json_schema: { name: opts.schemaName, strict: true, schema: jsonSchema } }
              : { type: 'json_object' },
          }),
          signal: AbortSignal.timeout(opts.timeoutMs ?? PURPOSE_TIMEOUT_MS[opts.purpose] ?? 120_000),
        })
      } catch (e) {
        throw new LlmError(`network: ${e instanceof Error ? e.message : e}`, 502)
      }
      if (!res.ok) throw new LlmError(`HTTP ${res.status}: ${await res.text()}`, res.status)
      const body = (await res.json()) as { choices?: { message?: { content?: string | null }; finish_reason?: string }[]; usage?: Usage }
      usage = body.usage
      content = body.choices?.[0]?.message?.content ?? ''
      cutOff = body.choices?.[0]?.finish_reason === 'length'
      if (!content) throw new Error(`empty reply (finish_reason ${body.choices?.[0]?.finish_reason ?? 'unknown'})`)
      if (cutOff) throw new Error('reply cut off by max_tokens')
      let json: unknown
      try {
        json = JSON.parse(content)
      } catch (e) {
        throw new Error(`invalid JSON: ${e instanceof Error ? e.message : e}`)
      }
      const parsed = opts.schema.safeParse(json)
      if (!parsed.success) throw new Error(z.prettifyError(parsed.error))
      await logCall(log, started, usage, null, reservedId)
      return parsed.data
    } catch (e) {
      failure = clean(e instanceof Error ? e.message : String(e))
      await logCall(log, started, usage, failure, reservedId)
      // Only bad output is worth a second try; transport and HTTP errors fail fast.
      if (e instanceof LlmError) throw new LlmError(`LLM request failed (${e.status})`, e.status)
      if (opts.retry === false) break
      // A cut-off reply is never echoed back: it is huge and the model only needs to be told to be brief.
      if (content && !cutOff) messages.push({ role: 'assistant', content })
      messages.push({
        role: 'user',
        content: cutOff
          ? 'Your reply was far too long and got cut off. Reply again with the same JSON shape, short texts, no repetition.'
          : `Your reply was rejected: ${failure}\nReply again with only the corrected JSON.`,
      })
    }
  }
  throw new LlmError(`LLM output invalid${opts.retry === false ? '' : ' after retry'}: ${failure}`, 422)
}

// The one-shot voice contract uses a JSON request part and a WAV audio part.
export async function transcribeAudio(opts: { audio: File; learnerId: string; sessionId: string; topicId: string; orgId?: string | null }): Promise<string> {
  if (!isVoiceEnabled()) throw new LlmError('Voice answers are unavailable.', 404)
  const selected = jobModel('voice')
  const model = selected.model
  const log = { learnerId: opts.learnerId, sessionId: opts.sessionId, topicId: opts.topicId, orgId: opts.orgId ?? null, purpose: 'voice', model }
  const reservedId = await reserve({ ...log, id: crypto.randomUUID() }, opts.orgId)
  if (reservedId === false) {
    if (opts.orgId && (await companyOverCap(opts.orgId))) throw new LlmError(COMPANY_CAP_MESSAGE, 429)
    throw dailyCapError()
  }
  const started = Date.now()
  try {
    const body = new FormData()
    body.append('request', new Blob([JSON.stringify({ model, mode: 'PUSH_TO_TALK', audioEncoding: 'WAV' })], { type: 'application/json' }))
    body.append('audio', opts.audio, 'answer.wav')
    const res = await fetch(`${selected.baseUrl}/asr/transcribe`, {
      method: 'POST',
      headers: { ...(selected.apiKey && { authorization: `Bearer ${selected.apiKey}` }) },
      body,
      signal: AbortSignal.timeout(120_000),
    })
    if (!res.ok) throw new LlmError(`Voice request failed (HTTP ${res.status}).`, res.status === 429 ? 429 : 502)
    const result = await res.json() as { transcript?: unknown }
    if (typeof result.transcript !== 'string' || !result.transcript.trim()) throw new LlmError('No speech was recognized. Record again or type your answer.', 422)
    if (result.transcript.trim().length > 1000) throw new LlmError('Please record a shorter answer.', 422)
    await logCall(log, started, undefined, null, reservedId)
    return result.transcript.trim()
  } catch (e) {
    // Never log the recording, transcript, credentials or provider response body.
    const error = e instanceof LlmError ? e : new LlmError("Couldn't transcribe your answer. Record again or type it.", 502)
    await logCall(log, started, undefined, error.message, reservedId)
    throw error
  }
}

async function companyOverCap(orgId: string): Promise<boolean> {
  try {
    return isOverDailyCap(await companyCallsToday(getDb(), orgId), COMPANY_DAILY_MODEL_CALL_CAP)
  } catch {
    return false
  }
}

// Returns the reserved row id, false when the cap is reached, or undefined when the reservation failed and the call is allowed.
async function reserve(row: Parameters<typeof reserveModelCall>[1], orgId?: string | null): Promise<string | false | undefined> {
  try {
    return (await reserveModelCall(getDb(), { ...row, orgId })) ? row.id : false
  } catch (e) {
    console.error('daily cap reservation failed, allowing call', e instanceof Error ? e.message : e)
    return undefined
  }
}

async function logCall(
  opts: { purpose: string; model: string; learnerId?: string | null; sessionId?: string | null; topicId?: string | null; orgId?: string | null },
  started: number,
  usage: Usage | undefined,
  error: string | null,
  reservedId?: string,
) {
  try {
    const promptTokens = usage?.prompt_tokens ?? 0
    const completionTokens = usage?.completion_tokens ?? 0
    const model = opts.model
    const price = PRICES[model.replace(/^accounts\/fireworks\/models\//, '')]
    const db = getDb()
    await abandonPendingModelCalls(db)
    const done = {
      latencyMs: Date.now() - started,
      promptTokens,
      completionTokens,
      reasoningTokens: usage?.completion_tokens_details?.reasoning_tokens ?? 0,
      costUsd: price ? (promptTokens * price.in + completionTokens * price.out) / 1_000_000 : null,
      ok: error === null,
      error,
    }
    if (reservedId) {
      await db.update(modelCalls).set(done).where(eq(modelCalls.id, reservedId))
      return
    }
    await db
      .insert(modelCalls)
      .values({
        id: crypto.randomUUID(),
        learnerId: opts.learnerId ?? null,
        sessionId: opts.sessionId ?? null,
        topicId: opts.topicId ?? null,
        orgId: opts.orgId ?? null,
        purpose: opts.purpose,
        model,
        ...done,
        createdAt: Date.now(),
      })
  } catch (e) {
    console.error('model_calls log failed', e instanceof Error ? e.message : e)
  }
}

// Images use their job's provider and model, with the same daily cap and call ledger as text.
// No automatic retry: a second paid generation needs an explicit retry by the learner.
export async function generateImage(opts: { prompt: string; learnerId: string; topicId: string; orgId?: string | null }): Promise<Uint8Array> {
  if (!isImageEnabled()) throw new LlmError('Diagrams are unavailable.', 404)
  const selected = jobModel('image')
  const log = { purpose: 'diagram', learnerId: opts.learnerId, topicId: opts.topicId, orgId: opts.orgId ?? null, model: selected.model }
  const reservedId = await reserve({ ...log, id: crypto.randomUUID() }, opts.orgId)
  if (reservedId === false) {
    if (opts.orgId && (await companyOverCap(opts.orgId))) throw new LlmError(COMPANY_CAP_MESSAGE, 429)
    throw dailyCapError()
  }
  const started = Date.now()
  let error: string | null = null
  try {
    const res = await fetch(`${selected.baseUrl}/images/generations`, {
      method: 'POST',
      headers: { 'content-type': 'application/json', ...(selected.apiKey && { authorization: `Bearer ${selected.apiKey}` }) },
      body: JSON.stringify({ model: selected.model, prompt: opts.prompt, n: 1, size: '1024x1024', response_format: 'b64_json' }),
      signal: AbortSignal.timeout(120_000),
    })
    if (!res.ok) throw new LlmError(`Image HTTP ${res.status}`, res.status)
    const body = z.object({ data: z.array(z.object({ b64_json: z.string().min(1).max(14_000_000) })).length(1) }).parse(await res.json())
    const bytes = Uint8Array.from(atob(body.data[0].b64_json), (c) => c.charCodeAt(0))
    if (bytes.length > 10_000_000 || ![137, 80, 78, 71, 13, 10, 26, 10].every((b, i) => bytes[i] === b)) {
      throw new Error('Image response is not a PNG under 10 MB')
    }
    return bytes
  } catch (e) {
    const message = e instanceof Error ? e.message : String(e)
    error = (selected.apiKey ? message.replaceAll(selected.apiKey, '[redacted]') : message).slice(0, 300)
    throw new LlmError('The diagram could not be generated. Try again.', e instanceof LlmError ? e.status : 502)
  } finally {
    await logCall(log, started, undefined, error, reservedId)
  }
}
