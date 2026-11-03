import { and, desc, eq, lt, or } from 'drizzle-orm'
import type { Db } from '@/db'
import { concepts, items, learnerConcept, sources, topics } from '@/db/schema'
import { chatJson, jobModel, LlmError } from '@/lib/llm/client'
import { ENABLED_FORMATS, itemsPrompt, selfCheckPrompt } from '@/lib/llm/prompts'
import { ItemBatch, ItemPayload, SelfCheck } from '@/lib/llm/schemas'
import { assertWithinDailyCap } from '@/server/model-cap'

// Server-only helpers shared by the server-function files. They live apart from them so no server-only import reaches the client bundle.

export const httpError = (message: string, status: number) => Object.assign(new Error(message), { status })

// D1 allows 100 bound parameters per statement, so multi-row inserts go in small chunks.
export const chunks = <T>(rows: T[], size: number) =>
  Array.from({ length: Math.ceil(rows.length / size) }, (_, i) => rows.slice(i * size, (i + 1) * size))

export const mean = (xs: number[]) => (xs.length ? xs.reduce((a, b) => a + b, 0) / xs.length : 0)

// Desirable difficulty: half a step above the learner's level.
export const targetFor = (level: number) => Math.min(5, Math.max(1, Math.round(level + 0.5)))

// p_known per concept for one topic; concepts the learner has not met are absent.
export async function loadPKnown(db: Db, learnerId: string, topicId: string) {
  const rows = await db
    .select({ conceptId: learnerConcept.conceptId, pKnown: learnerConcept.pKnown })
    .from(learnerConcept)
    .innerJoin(concepts, eq(concepts.id, learnerConcept.conceptId))
    .where(and(eq(learnerConcept.learnerId, learnerId), eq(concepts.topicId, topicId)))
  return new Map(rows.map((r) => [r.conceptId, r.pKnown]))
}

export type StoredItem = { id: string; format: ItemPayload['format']; difficultyPrior: number; payload: ItemPayload; generatedBy: string | null }

export const asItem = (r: typeof items.$inferSelect): StoredItem => ({
  id: r.id,
  format: r.format as ItemPayload['format'],
  difficultyPrior: r.difficultyPrior,
  payload: JSON.parse(r.payloadJson) as ItemPayload,
  generatedBy: r.generatedBy,
})

// Same 10 minutes as concept-gen's STALE_CLAIM_MS; importing it would cycle (concept-gen imports helpers).
const STALE_CLAIM_MS = 10 * 60 * 1000
const JOIN_POLL_MS = 1000
const JOIN_MAX_WAIT_MS = 120_000

// Returns the concept's active items, generating a batch first when fewer than 6 exist. The caller has checked that the learner owns the topic.
export async function ensureConceptItems(
  db: Db,
  learnerId: string,
  concept: typeof concepts.$inferSelect,
  topic: typeof topics.$inferSelect,
  opts: { targetDifficulty: number; spread?: boolean; unseen?: Set<string>; sessionId?: string },
): Promise<StoredItem[]> {
  const existing = await db
    .select()
    .from(items)
    .where(and(eq(items.conceptId, concept.id), eq(items.topicId, topic.id), eq(items.status, 'active')))
    .orderBy(desc(items.createdAt))
  // Six stored items are enough unless the learner has already seen them all.
  const fresh = opts.unseen ? existing.filter((r) => !opts.unseen!.has(r.id)).length : existing.length
  if (existing.length >= 6 && fresh > 0) return existing.map(asItem)
  // Only a real generation spends the cap; stored items stay readable at the cap.
  await assertWithinDailyCap(db, learnerId)
  // One generation per concept: an atomic claim on the row; a concurrent caller joins the in-flight one.
  const now = Date.now()
  const claimed = await db
    .update(concepts)
    .set({ genStatus: 'generating', genStartedAt: now })
    .where(and(eq(concepts.id, concept.id), or(eq(concepts.genStatus, 'ready'), and(eq(concepts.genStatus, 'generating'), lt(concepts.genStartedAt, now - STALE_CLAIM_MS)))))
    .returning({ id: concepts.id })
  if (!claimed.length) {
    const status = async () => (await db.select({ s: concepts.genStatus }).from(concepts).where(eq(concepts.id, concept.id)))[0]?.s
    if ((await status()) === 'generating') {
      // Wait for the in-flight writer, then read what it stored without spending the cap again.
      const deadline = Date.now() + JOIN_MAX_WAIT_MS
      while ((await status()) === 'generating' && Date.now() < deadline) await new Promise((r) => setTimeout(r, JOIN_POLL_MS))
      const stored = await db
        .select()
        .from(items)
        .where(and(eq(items.conceptId, concept.id), eq(items.topicId, topic.id), eq(items.status, 'active')))
        .orderBy(desc(items.createdAt))
      return stored.map(asItem)
    }
  }

  try {
    const avoidStems = existing.slice(0, 3).map((r) => (JSON.parse(r.payloadJson) as ItemPayload).stem)
    const generated = await generateConceptItems(db, concept, topic, { targetDifficulty: opts.targetDifficulty, spread: opts.spread, avoidStems, want: 3, maxRounds: 2, learnerId, sessionId: opts.sessionId })
    return [...existing.map(asItem), ...generated]
  } finally {
    // Release only our own claim; a failed release must not mask the generation's error.
    if (claimed.length) {
      await db
        .update(concepts)
        .set({ genStatus: 'ready', genStartedAt: null })
        .where(and(eq(concepts.id, concept.id), eq(concepts.genStatus, 'generating'), eq(concepts.genStartedAt, now)))
        .catch((e) => console.error('concept claim release failed', e))
    }
  }
}

// Generates and stores a batch of items for one concept; returns only the new ones. Callers own the cap pre-check.
export async function generateConceptItems(
  db: Db,
  concept: typeof concepts.$inferSelect,
  topic: typeof topics.$inferSelect,
  opts: { targetDifficulty: number; spread?: boolean; avoidStems: string[]; want: number; maxRounds: number; learnerId: string | null; orgId?: string | null; sessionId?: string },
): Promise<StoredItem[]> {
  const { learnerId, orgId, avoidStems } = opts
  const misconceptions = JSON.parse(concept.misconceptionsJson) as string[]

  const kept: { payload: ItemPayload; check: unknown }[] = []
  for (let round = 0; round < opts.maxRounds && kept.length < opts.want; round++) {
    try {
      const batch = await chatJson({
        purpose: 'items',
        schema: ItemBatch,
        schemaName: 'item_batch',
        ...itemsPrompt({
          topic: topic.title,
          goal: topic.goal,
          concept,
          misconceptions,
          targetDifficulty: opts.targetDifficulty,
          spread: opts.spread,
          sourceQuote: concept.sourceQuote,
          avoidStems,
        }),
        maxTokens: 16000,
        learnerId,
        orgId,
        topicId: topic.id,
        sessionId: opts.sessionId,
      })
      const drafted = batch.items.flatMap((i) => {
        // A valid draft in a format learners cannot answer yet is dropped, whatever the prompt asked for.
        const ok = ItemPayload.safeParse(i)
        return ok.success && ENABLED_FORMATS.includes(ok.data.format) ? [ok.data] : []
      })
      if (!drafted.length) continue
      let verdicts: SelfCheck['results'] | null = null
      try {
        verdicts = (
          await chatJson({
            purpose: 'self_check',
            schema: SelfCheck,
            schemaName: 'self_check',
            ...selfCheckPrompt({ items: drafted }),
            reasoningEffort: 'minimal',
            learnerId,
            orgId,
            topicId: topic.id,
            sessionId: opts.sessionId,
          })
        ).results
      } catch (e) {
        if (e instanceof LlmError && e.status === 429) throw httpError(e.message, 429)
        if (!(e instanceof LlmError)) throw e
      }
      drafted.forEach((payload, index) => {
        const verdict = verdicts?.find((v) => v.index === index)
        if (verdict?.keep) kept.push({ payload, check: verdict ?? null })
      })
    } catch (e) {
      if (e instanceof LlmError && e.status === 429) throw httpError(e.message, 429)
      if (!(e instanceof LlmError)) throw e
      console.error('item generation failed', e.message)
      break
    }
  }
  if (!kept.length) throw httpError('Could not generate items for this concept', 502)

  const [source] = concept.sourceId ? await db.select({ version: sources.version }).from(sources).where(eq(sources.id, concept.sourceId)) : []
  const now = Date.now()
  const rows = kept.map(({ payload, check }) => ({
    id: crypto.randomUUID(),
    conceptId: concept.id,
    topicId: topic.id,
    format: payload.format,
    payloadJson: JSON.stringify(payload),
    generatedBy: jobModel('items').model,
    difficultyPrior: payload.difficulty,
    checkJson: check === null ? null : JSON.stringify(check),
    sourceId: concept.sourceId ?? null,
    sourceVersion: source?.version ?? null,
    createdAt: now,
  }))
  // Each item binds 12 parameters including defaults; eight rows stay below D1's 100-parameter limit.
  const [first, ...rest] = chunks(rows, 8).map((r) => db.insert(items).values(r))
  await db.batch([first, ...rest])
  return rows.map((r, i) => ({ id: r.id, format: r.format, difficultyPrior: r.difficultyPrior, payload: kept[i].payload, generatedBy: r.generatedBy }))
}
