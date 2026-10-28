import { z } from 'zod'
import { getDb } from '@/db'
import { modelCalls } from '@/db/schema'
import { getEnv } from '@/server/env'

// USD per million tokens; reasoning tokens bill as output. Unlisted models cost 0.
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

// Calls the model for JSON matching `schema`; one retry with the error appended, then throws LlmError.
export async function chatJson<T>(opts: {
  purpose: string
  schema: z.ZodType<T>
  schemaName: string
  system: string
  user: string
  reasoningEffort?: 'minimal' | 'low' | 'medium' | 'high'
  maxTokens?: number
  learnerId?: string | null
  sessionId?: string | null
}): Promise<T> {
  const env = getEnv()
  const meta = env.LLM_PROFILE === 'meta'
  // Strict json_schema is a Meta feature; other profiles get json_object plus the schema in the prompt.
  const { $schema: _, ...jsonSchema } = z.toJSONSchema(opts.schema)
  const messages: Message[] = [
    {
      role: 'system',
      content: meta ? opts.system : `${opts.system}\n\nReply with one JSON object matching this JSON Schema:\n${JSON.stringify(jsonSchema)}`,
    },
    { role: 'user', content: opts.user },
  ]
  const clean = (s: string) => (env.LLM_API_KEY ? s.replaceAll(env.LLM_API_KEY, '[redacted]') : s).slice(0, 300)

  let failure = ''
  for (let attempt = 0; attempt < 2; attempt++) {
    const started = Date.now()
    let usage: Usage | undefined
    let content = ''
    let cutOff = false
    try {
      let res: Response
      try {
        res = await fetch(`${env.LLM_BASE_URL}/chat/completions`, {
          method: 'POST',
          headers: { 'content-type': 'application/json', ...(env.LLM_API_KEY && { authorization: `Bearer ${env.LLM_API_KEY}` }) },
          body: JSON.stringify({
            model: env.LLM_MODEL,
            messages,
            max_tokens: opts.maxTokens ?? 8192, // reasoning tokens spend this budget too
            ...(meta && opts.reasoningEffort && { reasoning_effort: opts.reasoningEffort }),
            response_format: meta
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
      await logCall(opts, started, usage, null)
      return parsed.data
    } catch (e) {
      failure = clean(e instanceof Error ? e.message : String(e))
      await logCall(opts, started, usage, failure)
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

async function logCall(
  opts: { purpose: string; learnerId?: string | null; sessionId?: string | null },
  started: number,
  usage: Usage | undefined,
  error: string | null,
) {
  try {
    const env = getEnv()
    const promptTokens = usage?.prompt_tokens ?? 0
    const completionTokens = usage?.completion_tokens ?? 0
    const price = PRICES[env.LLM_MODEL] ?? { in: 0, out: 0 }
    await getDb()
      .insert(modelCalls)
      .values({
        id: crypto.randomUUID(),
        learnerId: opts.learnerId ?? null,
        sessionId: opts.sessionId ?? null,
        purpose: opts.purpose,
        model: env.LLM_MODEL,
        latencyMs: Date.now() - started,
        promptTokens,
        completionTokens,
        reasoningTokens: usage?.completion_tokens_details?.reasoning_tokens ?? 0,
        costUsd: (promptTokens * price.in + completionTokens * price.out) / 1_000_000,
        ok: error === null,
        error,
        createdAt: Date.now(),
      })
  } catch (e) {
    console.error('model_calls log failed', e instanceof Error ? e.message : e)
  }
}
