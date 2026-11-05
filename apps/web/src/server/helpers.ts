import { and, desc, eq, inArray, isNotNull, sql } from 'drizzle-orm'
import type { Db } from '@/db'
import { concepts, items, learnerConcept, sources, topics } from '@/db/schema'
import { chatJson, jobModel, LlmError } from '@/lib/llm/client'
import { ENABLED_FORMATS, itemsPrompt, selfCheckPrompt } from '@/lib/llm/prompts'
import { ItemBatch, ItemPayload, SelfCheck } from '@/lib/llm/schemas'
import { liveConcept } from '@/server/live-concept'
import { notFlaggedBy } from '@/server/topic-access'
import { assertWithinDailyCap } from '@/server/model-cap'
import { claimConcept, heartbeatClaim, STALE_CLAIM_MS } from '@/server/claim-heartbeat'

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
    .where(and(eq(items.conceptId, concept.id), eq(items.topicId, topic.id), eq(items.status, 'active'), notFlaggedBy(db, learnerId)))
    .orderBy(desc(items.createdAt))
  // Six stored items are enough unless the learner has already seen them all.
  const fresh = opts.unseen ? existing.filter((r) => !opts.unseen!.has(r.id)).length : existing.length
  if (existing.length >= 6 && fresh > 0) return existing.map(asItem)
  // A retired document gets no new questions. This read only keeps the cap untouched; the claim below enforces it atomically.
  if (await sourceRetired(db, concept)) return existing.map(asItem)
  // Only a real generation spends the cap; stored items and a join of an in-flight, already-paid generation stay readable at the cap.
  // A capped caller never claims: a claim it then refuses would make a concurrent caller join a generation that never runs.
  const capError = await assertWithinDailyCap(db, learnerId).then(() => null, (e: unknown) => e)
  // One generation per concept: an atomic claim on the row; a concurrent caller joins the in-flight one.
  let claimAt = capError ? null : await claimConcept(db, concept.id, 'ready')
  if (claimAt === null) {
    // A refused claim on a dead concept must not fall through to generating unclaimed.
    const [dead] = await db.select({ id: concepts.id }).from(concepts).where(and(eq(concepts.id, concept.id), sql`not (${liveConcept()})`))
    if (dead) return existing.map(asItem)
    const status = async () => (await db.select({ s: concepts.genStatus, startedAt: concepts.genStartedAt }).from(concepts).where(eq(concepts.id, concept.id)))[0]
    let current = await status()
    if (current?.s === 'generating') {
      const deadline = Date.now() + JOIN_MAX_WAIT_MS
      while (current?.s === 'generating' && Date.now() < deadline) {
        if ((current.startedAt ?? 0) < Date.now() - STALE_CLAIM_MS) {
          if (capError) throw capError
          claimAt = await claimConcept(db, concept.id, 'ready')
          if (claimAt !== null) break
        }
        await new Promise((r) => setTimeout(r, JOIN_POLL_MS))
        current = await status()
      }
      if (claimAt === null) {
        const stored = await db.select().from(items)
          .where(and(eq(items.conceptId, concept.id), eq(items.topicId, topic.id), eq(items.status, 'active'), notFlaggedBy(db, learnerId)))
          .orderBy(desc(items.createdAt))
        return stored.map(asItem)
      }
    }
  }
  const heartbeat = claimAt === null ? null : heartbeatClaim(db, concept.id, claimAt)
  try {
    if (capError) throw capError
    const avoidStems = existing.slice(0, 3).map((r) => (JSON.parse(r.payloadJson) as ItemPayload).stem)
    const generated = await generateConceptItems(db, concept, topic, { targetDifficulty: opts.targetDifficulty, spread: opts.spread, avoidStems, want: 3, maxRounds: 2, learnerId, sessionId: opts.sessionId, heartbeat: heartbeat?.renew })
    return [...existing.map(asItem), ...generated]
  } finally {
    // Release only our own claim; a failed release must not mask the generation's error.
    if (heartbeat) {
      await heartbeat.stop()
      await db
        .update(concepts)
        .set({ genStatus: 'ready', genStartedAt: null })
        .where(heartbeat.owned())
        .catch((e) => console.error('concept claim release failed', e))
    }
  }
}

const sourceRetired = async (db: Db, concept: typeof concepts.$inferSelect) => Boolean(concept.sourceId &&
  (await db.select({ retiredAt: sources.retiredAt }).from(sources).where(eq(sources.id, concept.sourceId)))[0]?.retiredAt)

// Generates and stores a batch of items for one concept; returns only the new ones. Callers own the cap pre-check.
export async function generateConceptItems(
  db: Db,
  concept: typeof concepts.$inferSelect,
  topic: typeof topics.$inferSelect,
  opts: { targetDifficulty: number; spread?: boolean; avoidStems: string[]; want: number; maxRounds: number; learnerId: string | null; orgId?: string | null; sessionId?: string; heartbeat?: () => Promise<void> },
): Promise<StoredItem[]> {
  const { learnerId, orgId, avoidStems } = opts
  const misconceptions = JSON.parse(concept.misconceptionsJson) as string[]

  // One read of the source serves both the prompt and the version stamp.
  const [source] = concept.sourceId ? await db.select({ version: sources.version, bodyText: sources.bodyText, retiredAt: sources.retiredAt }).from(sources).where(eq(sources.id, concept.sourceId)) : []
  // A retired document gets no questions and no model call; the learner path must not fail on it.
  if (source?.retiredAt) return []
  const kept: { payload: ItemPayload; check: unknown }[] = []
  for (let round = 0; round < opts.maxRounds && kept.length < opts.want; round++) {
    try {
      await opts.heartbeat?.()
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
          // A replacement version always sends the document: a kept quote can still match while the revision changes its meaning.
          sourceText: source && source.version > 1 ? source.bodyText : concept.sourceQuote ? null : source?.bodyText ?? null,
          avoidStems,
        }),
        maxTokens: 16000,
        learnerId,
        orgId,
        topicId: topic.id,
        sessionId: opts.sessionId,
      })
      await opts.heartbeat?.()
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
      await opts.heartbeat?.()
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
  await opts.heartbeat?.()
  if (!kept.length) throw httpError('Could not generate items for this concept', 502)

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
  const inserts = chunks(rows, 8).map((r) => db.insert(items).values(r))
  // A document replaced or retired mid-generation must not gain live items citing it. The retirement check runs in the
  // same atomic batch as the insert, so a replacement committing at any earlier moment is seen here; a read beforehand could go stale.
  const retire = concept.sourceId
    ? chunks(rows.map((r) => r.id), 50).map((ids) =>
        db.update(items).set({ status: 'retired' }).where(and(
          inArray(items.id, ids),
          inArray(items.sourceId, db.select({ id: sources.id }).from(sources).where(and(eq(sources.id, concept.sourceId!), isNotNull(sources.retiredAt)))),
        )).returning({ id: items.id }),
      )
    : []
  const [first, ...rest] = [...inserts, ...retire]
  const results = (await db.batch([first, ...rest])) as unknown[]
  const retired = new Set(results.slice(inserts.length).flatMap((r) => (r as { id: string }[]).map((x) => x.id)))
  return rows.flatMap((r, i) => retired.has(r.id) ? [] : [{ id: r.id, format: r.format, difficultyPrior: r.difficultyPrior, payload: kept[i].payload, generatedBy: r.generatedBy }])
}
