import { modelUnavailable } from '@learnquiz/api/system-copy'
import { z } from 'zod'
import { eq } from 'drizzle-orm'
import { getDb } from '@/db'
import { modelCalls } from '@/db/schema'
import { COMPANY_DAILY_MODEL_CALL_CAP, isOverDailyCap } from '@/lib/limits'
import { META_MODELS, PROVIDERS, type ModelJob } from '@/lib/llm/models'
import { getEnv } from '@/server/env'
import { COMPANY_CAP_MESSAGE, companyCallsToday, reserveModelCall } from '@/server/model-cap'

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

export const MODEL_UNAVAILABLE_MESSAGE = modelUnavailable

// `fallback` resolves the Meta model that backs up a failed Fireworks call.
export function jobModel(job: ModelJob, fallback = false) {
  const env = getEnv()
  try {
    // Wrangler JSON bindings are objects; .dev.vars can supply JSON strings.
    const mapping: unknown = typeof env.JOB_MODELS === 'string' ? JSON.parse(env.JOB_MODELS) : env.JOB_MODELS === undefined ? {} : env.JOB_MODELS
    const jobs = z.record(z.string(), z.unknown()).parse(mapping)
    // The checked-in configuration names no model: the Muse API is closed and no official path replaces it yet.
    const profile = env.LLM_PROFILE
    if (!fallback && jobs[job] === undefined && !profile) throw new LlmError(MODEL_UNAVAILABLE_MESSAGE, 503)
    const selected = fallback
      ? { provider: 'meta' as const, model: 'muse-spark-1.3' }
      : jobs[job] === undefined
      ? { provider: profile!, model: env.LLM_MODEL ?? '' }
      : z.object({ provider: z.enum(['meta', 'baseten', 'fireworks']), model: z.string().min(1) }).parse(jobs[job])
    const modelId = selected.provider === 'fireworks' ? selected.model.replace(/^accounts\/fireworks\/models\//, '') : selected.model
    if (!META_MODELS.has(modelId)) throw new Error('Only Meta models are supported')
    const provider = selected.provider === 'ollama'
      ? { baseUrl: env.LLM_BASE_URL ?? '', keyBinding: 'LLM_API_KEY' as const, jsonMode: 'json_object' as const }
      : PROVIDERS[selected.provider]
    if (!provider) throw new Error('Unknown provider')
    return {
      ...selected,
      modelId,
      baseUrl: (selected.provider === profile && env.LLM_BASE_URL ? env.LLM_BASE_URL : provider.baseUrl).replace(/\/$/, ''),
      apiKey: env[provider.keyBinding] || (selected.provider === profile ? env.LLM_API_KEY : undefined),
      jsonMode: provider.jsonMode,
    }
  } catch (e) {
    if (e instanceof LlmError) throw e
    // Configuration errors must never include bindings or credentials.
    throw new LlmError(`Invalid model configuration for ${job}.`, 503)
  }
}

export function isModelAvailable(job: ModelJob): boolean {
  try {
    jobModel(job)
    return true
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
