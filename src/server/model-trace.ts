import { createServerFn } from '@tanstack/react-start'
import { and, asc, eq, inArray } from 'drizzle-orm'
import { z } from 'zod'
import { getDb } from '@/db'
import { modelCalls, sessions, topics } from '@/db/schema'
import { httpError } from '@/server/helpers'
import { requireLearnerId } from '@/server/session'

export const getModelTrace = createServerFn({ method: 'GET' })
  .validator(z.discriminatedUnion('scope', [
    z.object({ scope: z.literal('session'), sessionId: z.string().min(1) }),
    z.object({ scope: z.literal('topic'), topicId: z.string().min(1) }),
  ]))
  .handler(async ({ data }) => {
    const learnerId = await requireLearnerId()
    const db = getDb()
    if (data.scope === 'session') {
      const [owned] = await db.select({ id: sessions.id }).from(sessions)
        .innerJoin(topics, eq(topics.id, sessions.topicId))
        .where(and(eq(sessions.id, data.sessionId), eq(sessions.learnerId, learnerId), eq(topics.learnerId, learnerId)))
      if (!owned) throw httpError('Session not found', 404)
    } else {
      const [owned] = await db.select({ id: topics.id }).from(topics)
        .where(and(eq(topics.id, data.topicId), eq(topics.learnerId, learnerId)))
      if (!owned) throw httpError('Topic not found', 404)
    }
    const calls = await db.select({
      id: modelCalls.id,
      purpose: modelCalls.purpose,
      model: modelCalls.model,
      latencyMs: modelCalls.latencyMs,
      promptTokens: modelCalls.promptTokens,
      completionTokens: modelCalls.completionTokens,
      reasoningTokens: modelCalls.reasoningTokens,
      costUsd: modelCalls.costUsd,
      ok: modelCalls.ok,
      createdAt: modelCalls.createdAt,
    }).from(modelCalls).where(and(
      eq(modelCalls.learnerId, learnerId),
      data.scope === 'session'
        ? eq(modelCalls.sessionId, data.sessionId)
        : and(eq(modelCalls.topicId, data.topicId), inArray(modelCalls.purpose, ['curriculum', 'items', 'self_check'])),
    )).orderBy(asc(modelCalls.createdAt), asc(modelCalls.id))
    return { calls, totalCostUsd: calls.reduce((total, call) => total + call.costUsd, 0) }
  })
