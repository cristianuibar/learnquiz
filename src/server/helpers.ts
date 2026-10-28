import { and, desc, eq } from 'drizzle-orm'
import type { Db } from '@/db'
import { concepts, items, learnerConcept, topics } from '@/db/schema'
import { chatJson, LlmError } from '@/lib/llm/client'
import { itemsPrompt, selfCheckPrompt } from '@/lib/llm/prompts'
import { ItemBatch, ItemPayload, SelfCheck } from '@/lib/llm/schemas'

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

export type StoredItem = { id: string; format: ItemPayload['format']; difficultyPrior: number; payload: ItemPayload }

export const asItem = (r: typeof items.$inferSelect): StoredItem => ({
  id: r.id,
  format: r.format as ItemPayload['format'],
  difficultyPrior: r.difficultyPrior,
  payload: JSON.parse(r.payloadJson) as ItemPayload,
})

// Returns the concept's active items, generating a batch first when fewer than 6 exist. The caller has checked that the learner owns the topic.
export async function ensureConceptItems(
  db: Db,
  learnerId: string,
  concept: typeof concepts.$inferSelect,
  topic: typeof topics.$inferSelect,
  opts: { targetDifficulty: number; spread?: boolean; unseen?: Set<string> },
): Promise<StoredItem[]> {
  const existing = await db
    .select()
    .from(items)
    .where(and(eq(items.conceptId, concept.id), eq(items.status, 'active')))
    .orderBy(desc(items.createdAt))
  // Six stored items are enough unless the learner has already seen them all.
  const fresh = opts.unseen ? existing.filter((r) => !opts.unseen!.has(r.id)).length : existing.length
  if (existing.length >= 6 && fresh > 0) return existing.map(asItem)
  // shortcut: no lock, two concurrent calls for one concept may both generate; add a claim row if the UI double-fires.

  const avoidStems = existing.slice(0, 3).map((r) => (JSON.parse(r.payloadJson) as ItemPayload).stem)
  const misconceptions = JSON.parse(concept.misconceptionsJson) as string[]

  const kept: { payload: ItemPayload; check: unknown }[] = []
  for (let round = 0; round < 2 && kept.length < 3; round++) {
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
          formats: ['mcq', 'cloze'],
          sourceQuote: concept.sourceQuote,
          avoidStems,
        }),
        maxTokens: 16000,
        learnerId,
      })
      const drafted = batch.items.flatMap((i) => {
        const ok = ItemPayload.safeParse(i)
        return ok.success ? [ok.data] : []
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
          })
        ).results
      } catch (e) {
        if (!(e instanceof LlmError)) throw e // check unusable: keep the Zod-valid items
      }
      drafted.forEach((payload, index) => {
        const verdict = verdicts?.find((v) => v.index === index)
        if (!verdicts || verdict?.keep) kept.push({ payload, check: verdict ?? null })
      })
    } catch (e) {
      if (!(e instanceof LlmError)) throw e
      console.error('item generation failed', e.message)
      break
    }
  }
  if (!kept.length) throw httpError('Could not generate items for this concept', 502)

  const now = Date.now()
  const rows = kept.map(({ payload, check }) => ({
    id: crypto.randomUUID(),
    conceptId: concept.id,
    topicId: topic.id,
    format: payload.format,
    payloadJson: JSON.stringify(payload),
    difficultyPrior: payload.difficulty,
    checkJson: check === null ? null : JSON.stringify(check),
    createdAt: now,
  }))
  const [first, ...rest] = chunks(rows, 10).map((r) => db.insert(items).values(r))
  await db.batch([first, ...rest])
  return [...existing.map(asItem), ...rows.map((r, i) => ({ id: r.id, format: r.format, difficultyPrior: r.difficultyPrior, payload: kept[i].payload }))]
}
