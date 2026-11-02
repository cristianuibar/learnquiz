import { and, count, eq, gte } from 'drizzle-orm'
import { z } from 'zod'
import { getDb } from '@/db'
import { modelCalls } from '@/db/schema'
import { isOverDailyCap, utcDayStart } from '@/lib/limits'
import { META_MODELS, PROVIDERS, type ModelJob } from '@/lib/llm/models'
import { getEnv } from '@/server/env'
import { assertWithinDailyCap } from '@/server/model-cap'

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

type Usage = { prompt_tokens?: number; completion_tokens?: number; completion_tokens_details?: { reasoning_tokens?: number } }
type Message = { role: 'system' | 'user' | 'assistant'; content: string }

function jobModel(job: ModelJob) {
  const env = getEnv()
  try {
    // Wrangler JSON bindings are objects; .dev.vars can supply JSON strings.
    const mapping: unknown = typeof env.JOB_MODELS === 'string' ? JSON.parse(env.JOB_MODELS) : env.JOB_MODELS === undefined ? {} : env.JOB_MODELS
    const jobs = z.record(z.string(), z.unknown()).parse(mapping)
    const selected = jobs[job] === undefined
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

// Calls the model for JSON matching `schema`; one retry with the error appended, then throws LlmError.
export async function chatJson<T>(opts: {
  purpose: ModelJob
  schema: z.ZodType<T>
  schemaName: string
  system: string
  user: string
  reasoningEffort?: 'minimal' | 'low' | 'medium' | 'high'
  maxTokens?: number
  learnerId?: string | null
  sessionId?: string | null
}): Promise<T> {
  const selected = jobModel(opts.purpose)
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
  for (let attempt = 0; attempt < 2; attempt++) {
    // Daily cap backstop for every attempt: reject before fetch and before logCall,
    // so a capped learner gets a 429 and no new model_calls row.
    // shortcut: count-then-call is not atomic, so concurrent calls can overshoot by a few; the per-handler check keeps the common path exact.
    if (opts.learnerId) {
      try {
        const [row] = await getDb()
          .select({ n: count() })
          .from(modelCalls)
          .where(and(eq(modelCalls.learnerId, opts.learnerId), gte(modelCalls.createdAt, utcDayStart(Date.now()))))
        if (isOverDailyCap(row?.n ?? 0)) throw new LlmError('You have reached the daily limit for generating new content. Try again tomorrow.', 429)
      } catch (e) {
        if (e instanceof LlmError) throw e
        console.error('daily cap check failed, allowing call', e instanceof Error ? e.message : e)
      }
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
          signal: AbortSignal.timeout(120_000),
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
      await logCall(log, started, usage, null)
      return parsed.data
    } catch (e) {
      failure = clean(e instanceof Error ? e.message : String(e))
      await logCall(log, started, usage, failure)
      // Only bad output is worth a second try; transport and HTTP errors fail fast.
      if (e instanceof LlmError) throw new LlmError(`LLM request failed (${e.status})`, e.status)
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
  throw new LlmError(`LLM output invalid after retry: ${failure}`, 422)
}

// The one-shot voice contract uses a JSON request part and a WAV audio part.
export async function transcribeAudio(opts: { audio: File; learnerId: string; sessionId: string }): Promise<string> {
  if (!isVoiceEnabled()) throw new LlmError('Voice answers are unavailable.', 404)
  const selected = jobModel('voice')
  await assertWithinDailyCap(getDb(), opts.learnerId)
  const model = selected.model
  const log = { learnerId: opts.learnerId, sessionId: opts.sessionId, purpose: 'voice', model }
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
    if (typeof result.transcript !== 'string' || !result.transcript.trim()) throw new LlmError('No speech was recognised. Please try again.', 422)
    if (result.transcript.trim().length > 1000) throw new LlmError('Please record a shorter answer.', 422)
    await logCall(log, started, undefined, null)
    return result.transcript.trim()
  } catch (e) {
    // Never log the recording, transcript, credentials or provider response body.
    const error = e instanceof LlmError ? e : new LlmError('Voice transcription failed. Please try again.', 502)
    await logCall(log, started, undefined, error.message)
    throw error
  }
}

async function logCall(
  opts: { purpose: string; model: string; learnerId?: string | null; sessionId?: string | null },
  started: number,
  usage: Usage | undefined,
  error: string | null,
) {
  try {
    const promptTokens = usage?.prompt_tokens ?? 0
    const completionTokens = usage?.completion_tokens ?? 0
    const model = opts.model
    const price = PRICES[model.replace(/^accounts\/fireworks\/models\//, '')]
    await getDb()
      .insert(modelCalls)
      .values({
        id: crypto.randomUUID(),
        learnerId: opts.learnerId ?? null,
        sessionId: opts.sessionId ?? null,
        purpose: opts.purpose,
        model,
        latencyMs: Date.now() - started,
        promptTokens,
        completionTokens,
        reasoningTokens: usage?.completion_tokens_details?.reasoning_tokens ?? 0,
        costUsd: price ? (promptTokens * price.in + completionTokens * price.out) / 1_000_000 : null,
        ok: error === null,
        error,
        createdAt: Date.now(),
      })
  } catch (e) {
    console.error('model_calls log failed', e instanceof Error ? e.message : e)
  }
}
