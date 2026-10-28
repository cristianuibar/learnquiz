import { integer, real, sqliteTable, text } from 'drizzle-orm/sqlite-core'

// Every model call is logged here; the trace panel and the cost counter read it.
export const modelCalls = sqliteTable('model_calls', {
  id: text('id').primaryKey(),
  learnerId: text('learner_id'),
  sessionId: text('session_id'),
  purpose: text('purpose').notNull(),
  model: text('model').notNull(),
  latencyMs: integer('latency_ms').notNull(),
  promptTokens: integer('prompt_tokens').notNull().default(0),
  completionTokens: integer('completion_tokens').notNull().default(0),
  reasoningTokens: integer('reasoning_tokens').notNull().default(0),
  costUsd: real('cost_usd').notNull().default(0),
  ok: integer('ok', { mode: 'boolean' }).notNull(),
  error: text('error'),
  createdAt: integer('created_at').notNull(),
})
