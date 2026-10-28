import { createServerFn } from '@tanstack/react-start'
import { and, asc, count, eq, gte, inArray, isNotNull, isNull, lte, sql } from 'drizzle-orm'
import { z } from 'zod'
import { getDb, type Db } from '@/db'
import { attempts, concepts, items, learnerConcept, learnerItem, learnerTopic, placements, sessions, topics, units } from '@/db/schema'
import { BKT, guessFor, MASTERY, placementPrior, update } from '@/lib/learning/bkt'
import { ratingFor, retrievability, review } from '@/lib/learning/fsrs'
import { gradeAnswer, revealState, toItemView } from '@/lib/learning/grade'
import { levelResult, nextLevel, pickNext, PLACEMENT, shouldStop } from '@/lib/learning/placement'
import { composeSession, reinsert, SESSION_BONUS, streakAfter, xpFor } from '@/lib/learning/session'
import type { Confidence, ItemView, Reveal, SessionView, SummaryView } from '@/lib/learning/types'
import { chatJson } from '@/lib/llm/client'
import type { ItemPayload } from '@/lib/llm/schemas'
import { chunks, ensureConceptItems, httpError, loadPKnown, mean, targetFor } from '@/server/helpers'
import { requireLearnerId } from '@/server/session'

// shortcut: 12 instead of the spec's 20 while generation is slow, raise it once items are generated ahead of play.
const SESSION_SIZE = 12
const PLACEMENT_TOTAL = 10 // what the header shows while placement runs; it may take up to PLACEMENT.max
const CLOSER_MIN = 0.7
const DAY = 86_400_000

type SessionRow = typeof sessions.$inferSelect
type TopicRow = typeof topics.$inferSelect
type Stmt = Parameters<Db['batch']>[0][number]

// planJson. position indexes itemIdsJson; answered gates answerItem (once per slot) and nextItem (only after an answer).
type Plan = { position: number; answered: boolean; lastAttemptId?: string }
type PlacementPlan = Plan & {
  workingLevel: number
  log: { itemId: string; correct: boolean; confidence: Confidence; level: number }[]
  pool: { id: string; conceptId: string; difficulty: number }[]
}
// queue is the composed plan for the trace; the live queue (with re-asks) is itemIdsJson.
type QueuePlan = Plan & {
  queue: string[]
  reinserted: string[]
  reasons: { due: number; frontier: number; closers: number }
  unitStart: Record<string, number>
}

const readPlan = (s: SessionRow) => JSON.parse(s.planJson ?? '{}') as PlacementPlan | QueuePlan
const batch = (db: Db, stmts: Stmt[]) => db.batch(stmts as [Stmt, ...Stmt[]])

async function ownedTopic(db: Db, learnerId: string, topicId: string) {
  const [topic] = await db
    .select()
    .from(topics)
    .where(and(eq(topics.id, topicId), eq(topics.learnerId, learnerId)))
  if (!topic) throw httpError('Topic not found', 404)
  if (topic.status !== 'ready') throw httpError('This topic is not ready yet', 409)
  return topic
}

async function loadSession(db: Db, learnerId: string, sessionId: string) {
  const [row] = await db
    .select({ session: sessions, topic: topics })
    .from(sessions)
    .innerJoin(topics, eq(topics.id, sessions.topicId))
    .where(and(eq(sessions.id, sessionId), eq(sessions.learnerId, learnerId), eq(topics.learnerId, learnerId)))
  if (!row) throw httpError('Session not found', 404)
  return row
}

async function loadLearnerTopic(db: Db, learnerId: string, topicId: string) {
  const [lt] = await db
    .select()
    .from(learnerTopic)
    .where(and(eq(learnerTopic.learnerId, learnerId), eq(learnerTopic.topicId, topicId)))
  if (!lt) throw httpError('Topic not found', 404)
  return lt
}

// The topic scope keeps a forged item id from another topic out.
async function loadItem(db: Db, topicId: string, itemId: string) {
  const [row] = await db
    .select({ item: items, concept: concepts })
    .from(items)
    .innerJoin(concepts, eq(concepts.id, items.conceptId))
    .where(and(eq(items.id, itemId), eq(items.topicId, topicId)))
  if (!row) throw httpError('Item not found', 404)
  return { ...row, payload: JSON.parse(row.item.payloadJson) as ItemPayload }
}

// Unlocked-unit concepts the learner has not mastered, in play order. A concept never met counts as BKT.L0.
// shortcut: prerequisite edges are ignored, only unit unlocks gate the frontier; add the 0.6 prerequisite rule when units unlock during play.
async function loadFrontier(db: Db, learnerId: string, topicId: string) {
  const rows = await db
    .select({ concept: concepts, unitOrder: units.order, pKnown: learnerConcept.pKnown })
    .from(concepts)
    .innerJoin(units, eq(units.id, concepts.unitId))
    .leftJoin(learnerConcept, and(eq(learnerConcept.conceptId, concepts.id), eq(learnerConcept.learnerId, learnerId)))
    .where(and(eq(concepts.topicId, topicId), isNotNull(units.unlockedAt)))
  return rows
    .map((r) => ({ concept: r.concept, unitOrder: r.unitOrder, pKnown: r.pKnown ?? BKT.L0 }))
    .filter((r) => r.pKnown < MASTERY)
    .sort((a, b) => a.unitOrder - b.unitOrder || a.pKnown - b.pKnown || a.concept.order - b.concept.order)
}

async function unitMastery(db: Db, learnerId: string, topicId: string) {
  const [unitRows, conceptRows, known] = await Promise.all([
    db.select({ id: units.id, name: units.name }).from(units).where(eq(units.topicId, topicId)).orderBy(asc(units.order)),
    db.select({ id: concepts.id, unitId: concepts.unitId }).from(concepts).where(eq(concepts.topicId, topicId)),
    loadPKnown(db, learnerId, topicId),
  ])
  return unitRows.map((u) => ({
    unitId: u.id,
    unitName: u.name,
    mastery: mean(conceptRows.filter((c) => c.unitId === u.id).map((c) => known.get(c.id) ?? 0)),
  }))
}

async function viewOf(db: Db, session: SessionRow, topic: Pick<TopicRow, 'title'>, plan: Plan): Promise<SessionView> {
  const ids = JSON.parse(session.itemIdsJson) as string[]
  const ended = session.endedAt !== null
  let item: ItemView | null = null
  if (!ended && ids[plan.position]) {
    const { item: row, concept, payload } = await loadItem(db, session.topicId, ids[plan.position])
    item = toItemView(
      { id: row.id, conceptId: concept.id, conceptName: concept.name, format: payload.format, difficultyPrior: row.difficultyPrior, payload },
      session.id + row.id,
    )
  }
  const placement = session.kind === 'placement'
  return {
    id: session.id,
    kind: session.kind,
    topicId: session.topicId,
    topicTitle: topic.title,
    progress: { position: plan.position + 1, total: placement ? Math.max(PLACEMENT_TOTAL, plan.position + 1) : ids.length },
    item,
    ended,
  }
}

export const startPlacement = createServerFn({ method: 'POST' })
  .validator(z.object({ topicId: z.string().min(1) }))
  .handler(async ({ data }): Promise<{ sessionId: string }> => {
    const learnerId = await requireLearnerId()
    const db = getDb()
    const topic = await ownedTopic(db, learnerId, data.topicId)
    const [unitRows, conceptRows] = await Promise.all([
      db.select({ id: units.id }).from(units).where(eq(units.topicId, topic.id)).orderBy(asc(units.order)),
      db.select().from(concepts).where(eq(concepts.topicId, topic.id)).orderBy(asc(concepts.order)),
    ])
    // The first concept of the first, middle and last unit.
    const picks = [...new Set([0, Math.floor((unitRows.length - 1) / 2), unitRows.length - 1])]
      .map((i) => conceptRows.find((c) => c.unitId === unitRows[i]?.id))
      .filter((c) => c !== undefined)
    if (!picks.length) throw httpError('This topic has no concepts', 409)

    // A failed concept keeps the others' stored items, so a retry only regenerates what is missing.
    const generated = await Promise.all(
      picks.map((c) => ensureConceptItems(db, learnerId, c, topic, { targetDifficulty: PLACEMENT.start, spread: true })),
    )
    const pool = generated.flatMap((list, i) => list.map((it) => ({ id: it.id, conceptId: picks[i].id, difficulty: it.difficultyPrior })))
    const first = pickNext(PLACEMENT.start, pool, [])
    if (!first) throw httpError('Could not generate placement questions', 502)

    const sessionId = crypto.randomUUID()
    const plan: PlacementPlan = { position: 0, answered: false, workingLevel: PLACEMENT.start, log: [], pool }
    // itemIdsJson holds the items served so far (the first is picked here); nextItem appends the rest.
    await db.insert(sessions).values({
      id: sessionId,
      learnerId,
      topicId: topic.id,
      kind: 'placement',
      itemIdsJson: JSON.stringify([first]),
      planJson: JSON.stringify(plan),
      startedAt: Date.now(),
    })
    return { sessionId }
  })

export const startSession = createServerFn({ method: 'POST' })
  .validator(z.object({ topicId: z.string().min(1) }))
  .handler(async ({ data }): Promise<{ sessionId: string }> => {
    const learnerId = await requireLearnerId()
    const db = getDb()
    const topic = await ownedTopic(db, learnerId, data.topicId)
    const now = new Date()
    const [lt, scheduled, frontier] = await Promise.all([
      loadLearnerTopic(db, learnerId, topic.id),
      db
        .select({ row: learnerItem, conceptId: items.conceptId })
        .from(learnerItem)
        .innerJoin(items, eq(items.id, learnerItem.itemId))
        .where(and(eq(learnerItem.learnerId, learnerId), eq(items.topicId, topic.id), eq(items.status, 'active'))),
      loadFrontier(db, learnerId, topic.id),
    ])
    const targetDifficulty = targetFor(lt.level)
    const seen = new Set(scheduled.map((s) => s.row.itemId))
    const due = scheduled
      .filter((s) => s.row.due <= now.getTime())
      .map((s) => ({
        id: s.row.itemId,
        conceptId: s.conceptId,
        confidentError: s.row.lastWrongConfidentAt !== null,
        retrievability: retrievability(s.row, now),
      }))

    // Seen items come back through the due list, not as fresh frontier questions.
    const top = frontier.slice(0, 4)
    const generated = await Promise.all(top.map((f) => ensureConceptItems(db, learnerId, f.concept, topic, { targetDifficulty, unseen: seen })))
    const frontierInput = top.map((f, i) => ({
      conceptId: f.concept.id,
      unitOrder: f.unitOrder,
      pKnown: f.pKnown,
      items: generated[i].filter((it) => !seen.has(it.id)).map((it) => ({ id: it.id, difficulty: it.difficultyPrior })),
    }))

    // shortcut: a closer may be an item seen recently (unseen ones go first); upgrade once items are generated ahead of play.
    const taken = new Set([...due.map((d) => d.id), ...frontierInput.flatMap((f) => f.items.map((it) => it.id))])
    const closerRows = await db
      .select({ id: items.id, conceptId: items.conceptId })
      .from(items)
      .innerJoin(learnerConcept, and(eq(learnerConcept.conceptId, items.conceptId), eq(learnerConcept.learnerId, learnerId)))
      .where(and(eq(items.topicId, topic.id), eq(items.status, 'active'), gte(learnerConcept.pKnown, CLOSER_MIN), lte(items.difficultyPrior, lt.level)))
    const closers = closerRows
      .filter((c) => !taken.has(c.id))
      .sort((a, b) => Number(seen.has(a.id)) - Number(seen.has(b.id)))
      .slice(0, 2)

    const queue = composeSession({ size: SESSION_SIZE, due, frontier: frontierInput, closers, targetDifficulty })
    if (!queue.length) throw httpError('Nothing to practise yet', 409)

    const dueIds = new Set(due.map((d) => d.id))
    const closerIds = new Set(closers.map((c) => c.id))
    const plan: QueuePlan = {
      queue,
      position: 0,
      answered: false,
      reinserted: [],
      reasons: {
        due: queue.filter((id) => dueIds.has(id)).length,
        frontier: queue.filter((id) => !dueIds.has(id) && !closerIds.has(id)).length,
        closers: queue.filter((id) => closerIds.has(id)).length,
      },
      unitStart: Object.fromEntries((await unitMastery(db, learnerId, topic.id)).map((u) => [u.unitId, u.mastery])),
    }
    const sessionId = crypto.randomUUID()
    await db.insert(sessions).values({
      id: sessionId,
      learnerId,
      topicId: topic.id,
      kind: 'session',
      itemIdsJson: JSON.stringify(queue),
      planJson: JSON.stringify(plan),
      startedAt: now.getTime(),
    })
    return { sessionId }
  })

export const getSession = createServerFn({ method: 'GET' })
  .validator(z.object({ sessionId: z.string().min(1) }))
  .handler(async ({ data }): Promise<SessionView> => {
    const learnerId = await requireLearnerId()
    const db = getDb()
    const { session, topic } = await loadSession(db, learnerId, data.sessionId)
    const plan = readPlan(session)
    // A reload during the reveal moves on: the answer is already recorded.
    if (session.endedAt === null && plan.answered) return advance(db, learnerId, session, topic, plan)
    return viewOf(db, session, topic, plan)
  })

export const answerItem = createServerFn({ method: 'POST' })
  .validator(
    z.object({
      sessionId: z.string().min(1),
      itemId: z.string().min(1),
      answer: z.object({ optionId: z.string().max(8).optional(), text: z.string().max(1000).optional() }),
      confidence: z.enum(['sure', 'unsure', 'guess']),
      responseMs: z.number().int().min(0),
    }),
  )
  .handler(async ({ data }): Promise<Reveal> => {
    const learnerId = await requireLearnerId()
    const db = getDb()
    const { session } = await loadSession(db, learnerId, data.sessionId)
    if (session.endedAt !== null) throw httpError('This session has ended', 409)
    const plan = readPlan(session)
    const ids = JSON.parse(session.itemIdsJson) as string[]
    if (ids[plan.position] !== data.itemId) throw httpError('That is not the current question', 409)
    if (plan.answered) throw httpError('Already answered. Continue to the next question.', 409)
    // shortcut: no row lock, two concurrent answers to one slot would both count; add a version check if the UI double-fires.

    const { item, concept, payload } = await loadItem(db, session.topicId, data.itemId)
    const [[lc], [li]] = await Promise.all([
      db.select().from(learnerConcept).where(and(eq(learnerConcept.learnerId, learnerId), eq(learnerConcept.conceptId, concept.id))),
      db.select().from(learnerItem).where(and(eq(learnerItem.learnerId, learnerId), eq(learnerItem.itemId, item.id))),
    ])

    const now = Date.now()
    const grade = gradeAnswer(payload, data.answer)
    const { correct } = grade
    const state = revealState(correct, data.confidence)
    const pKnownBefore = lc?.pKnown ?? BKT.L0
    const pKnownAfter = update(pKnownBefore, correct, guessFor(payload.format, payload.options.length, data.confidence))
    const { next, retrievabilityBefore } = review(li ?? null, correct, data.confidence, new Date(now))
    // A wrong-and-sure miss is flagged until the item is answered right again.
    const lastWrongConfidentAt = state === 'D' ? now : correct ? null : (li?.lastWrongConfidentAt ?? null)
    const masteredAt = lc?.masteredAt ?? (pKnownAfter >= MASTERY ? now : null)
    const xp = xpFor({ correct, kind: session.kind })
    const attemptId = crypto.randomUUID()

    let itemIds = ids
    let returnsThisSession = false
    let nextPlan: PlacementPlan | QueuePlan
    if ('log' in plan) {
      const level = nextLevel(plan.workingLevel, correct, data.confidence)
      nextPlan = { ...plan, workingLevel: level, log: [...plan.log, { itemId: item.id, correct, confidence: data.confidence, level }] }
    } else {
      // The closers stay last, so a missed closer is not re-asked.
      const body = ids.length - plan.reasons.closers
      returnsThisSession = (state === 'C' || state === 'D') && !plan.reinserted.includes(item.id) && plan.position < body
      if (returnsThisSession) itemIds = [...reinsert(ids.slice(0, body), item.id, plan.position), ...ids.slice(body)]
      nextPlan = { ...plan, reinserted: returnsThisSession ? [...plan.reinserted, item.id] : plan.reinserted }
    }
    nextPlan.answered = true
    nextPlan.lastAttemptId = attemptId

    const stmts: Stmt[] = [
      db.insert(attempts).values({
        id: attemptId,
        learnerId,
        sessionId: session.id,
        itemId: item.id,
        conceptId: concept.id,
        at: now,
        answerJson: JSON.stringify(data.answer),
        correct,
        score: correct ? 1 : 0,
        confidence: data.confidence,
        responseMs: Math.min(data.responseMs, 600_000),
        gradeJson: JSON.stringify({ correctAnswer: grade.correctAnswer }),
        rating: ratingFor(correct, data.confidence),
        pKnownBefore,
        pKnownAfter,
        retrievabilityBefore,
      }),
      db
        .insert(learnerItem)
        .values({ learnerId, itemId: item.id, ...next, lastWrongConfidentAt })
        .onConflictDoUpdate({ target: [learnerItem.learnerId, learnerItem.itemId], set: { ...next, lastWrongConfidentAt } }),
      db
        .insert(learnerConcept)
        .values({ learnerId, conceptId: concept.id, pKnown: pKnownAfter, nAttempts: 1, masteredAt, updatedAt: now })
        .onConflictDoUpdate({
          target: [learnerConcept.learnerId, learnerConcept.conceptId],
          set: { pKnown: pKnownAfter, nAttempts: sql`${learnerConcept.nAttempts} + 1`, masteredAt, updatedAt: now },
        }),
      db
        .update(sessions)
        .set({
          itemIdsJson: JSON.stringify(itemIds),
          planJson: JSON.stringify(nextPlan),
          correctCount: sql`${sessions.correctCount} + ${correct ? 1 : 0}`,
          xp: sql`${sessions.xp} + ${xp}`,
        })
        .where(eq(sessions.id, session.id)),
    ]
    // Topic XP moves per answer, so a session abandoned without endSession loses nothing.
    if (xp) {
      stmts.push(
        db
          .update(learnerTopic)
          .set({ xp: sql`${learnerTopic.xp} + ${xp}` })
          .where(and(eq(learnerTopic.learnerId, learnerId), eq(learnerTopic.topicId, session.topicId))),
      )
    }
    await batch(db, stmts)

    // State D only, built in code from the chosen option's feedback and the concept's known mix-ups; no model call.
    const mixUps = state === 'D' ? (JSON.parse(concept.misconceptionsJson) as string[]) : []
    const misconception =
      state === 'D' ? [grade.chosenFeedback, mixUps.length ? `Common mix-up: ${mixUps.join('; ')}` : null].filter(Boolean).join(' ') || null : null
    return {
      attemptId,
      state,
      correct,
      correctAnswer: grade.correctAnswer,
      chosenFeedback: grade.chosenFeedback,
      explanation: payload.explanation,
      sourceQuote: payload.source_quote,
      misconception,
      returnsThisSession,
      pKnownBefore,
      pKnownAfter,
    }
  })

async function advance(db: Db, learnerId: string, session: SessionRow, topic: TopicRow, plan: PlacementPlan | QueuePlan): Promise<SessionView> {
  const ids = JSON.parse(session.itemIdsJson) as string[]
  let nextId: string | null
  if ('log' in plan) {
    const conceptOf = new Map(plan.pool.map((p) => [p.id, p.conceptId]))
    nextId = shouldStop(plan.log)
      ? null
      : pickNext(plan.workingLevel, plan.pool, plan.log.map((l) => ({ id: l.itemId, conceptId: conceptOf.get(l.itemId) ?? '' })))
    if (nextId) ids.push(nextId)
  } else {
    nextId = ids[plan.position + 1] ?? null
  }

  if (!nextId) {
    await finalise(db, learnerId, session, topic)
    const done = await loadSession(db, learnerId, session.id)
    return viewOf(db, done.session, done.topic, plan)
  }
  const advanced = { ...plan, position: plan.position + 1, answered: false }
  await db
    .update(sessions)
    .set({ itemIdsJson: JSON.stringify(ids), planJson: JSON.stringify(advanced) })
    .where(eq(sessions.id, session.id))
  return viewOf(db, { ...session, itemIdsJson: JSON.stringify(ids) }, topic, advanced)
}

export const nextItem = createServerFn({ method: 'POST' })
  .validator(z.object({ sessionId: z.string().min(1), why: z.string().trim().max(300).optional() }))
  .handler(async ({ data }): Promise<SessionView> => {
    const learnerId = await requireLearnerId()
    const db = getDb()
    const { session, topic } = await loadSession(db, learnerId, data.sessionId)
    const plan = readPlan(session)
    // Repeated calls (double tap, reload) are no-ops: only an answered slot advances.
    if (session.endedAt !== null || !plan.answered) return viewOf(db, session, topic, plan)

    if (data.why && plan.lastAttemptId) {
      await db
        .update(attempts)
        .set({ gradeJson: sql`json_set(coalesce(${attempts.gradeJson}, '{}'), '$.why', ${data.why})` })
        .where(and(eq(attempts.id, plan.lastAttemptId), eq(attempts.learnerId, learnerId)))
    }

    return advance(db, learnerId, session, topic, plan)
  })

export const endSession = createServerFn({ method: 'POST' })
  .validator(z.object({ sessionId: z.string().min(1) }))
  .handler(async ({ data }): Promise<SummaryView> => {
    const learnerId = await requireLearnerId()
    const db = getDb()
    let { session, topic } = await loadSession(db, learnerId, data.sessionId)
    if (session.endedAt === null) {
      await finalise(db, learnerId, session, topic)
      ;({ session, topic } = await loadSession(db, learnerId, session.id))
    }
    return summaryOf(db, learnerId, session, topic)
  })

export const reportItem = createServerFn({ method: 'POST' })
  .validator(z.object({ itemId: z.string().min(1) }))
  .handler(async ({ data }): Promise<{ ok: true }> => {
    const learnerId = await requireLearnerId()
    const db = getDb()
    const done = await db
      .update(items)
      .set({ status: 'reported' })
      .where(and(eq(items.id, data.itemId), inArray(items.topicId, db.select({ id: topics.id }).from(topics).where(eq(topics.learnerId, learnerId)))))
      .returning({ id: items.id })
    if (!done.length) throw httpError('Item not found', 404)
    return { ok: true }
  })

// Units map to levels 1..5 by position, as in placementPrior.
const unitBand = (order: number, total: number) => 1 + Math.round((order / Math.max(1, total - 1)) * 4)

const PlacementLine = z.object({ line: z.string().max(240) })

// One Spark call; any failure falls back to a template so placement always ends.
async function placementLine(db: Db, learnerId: string, session: SessionRow, topic: TopicRow, log: PlacementPlan['log'], level: number) {
  const right = log.filter((l) => l.correct).length
  const fallback = `You got ${right} of ${log.length} right and landed at level ${level} of 5 on ${topic.title}. Your path starts there.`
  try {
    const names = await db
      .select({ id: items.id, concept: concepts.name })
      .from(items)
      .innerJoin(concepts, eq(concepts.id, items.conceptId))
      .where(inArray(items.id, log.map((l) => l.itemId)))
    const concept = new Map(names.map((n) => [n.id, n.concept]))
    const { line } = await chatJson({
      purpose: 'placement_line',
      schema: PlacementLine,
      schemaName: 'placement_line',
      system: `You write the result line shown after a placement quiz. Output JSON only.
line: exactly two sentences, second person, at most 240 characters in total. First what the learner knows, then where they will grow. Name concrete concepts from the answers. No praise filler.`,
      user: `Topic: ${topic.title}
Placed at level ${level} of 5.
Answers in order (concept, result, confidence):
${log.map((l) => `- ${concept.get(l.itemId) ?? 'unknown'}: ${l.correct ? 'right' : 'wrong'}, ${l.confidence}`).join('\n')}`,
      reasoningEffort: 'minimal',
      maxTokens: 2000,
      learnerId,
      sessionId: session.id,
    })
    return line
  } catch (e) {
    console.error('placement line failed, using template', e instanceof Error ? e.message : e)
    return fallback
  }
}

// Closes the session in one batch, so it is either fully ended or untouched. Callers check endedAt first.
async function finalise(db: Db, learnerId: string, session: SessionRow, topic: TopicRow) {
  const now = Date.now()
  const plan = readPlan(session)
  const stmts: Stmt[] = []
  let bonus = 0

  // A placement abandoned before its first answer changes nothing but its end time.
  if ('log' in plan && plan.log.length) {
    const level = levelResult(plan.log)
    const [unitRows, conceptRows, levelLine] = await Promise.all([
      db.select({ id: units.id, order: units.order }).from(units).where(eq(units.topicId, topic.id)),
      db.select({ id: concepts.id, unitId: concepts.unitId }).from(concepts).where(eq(concepts.topicId, topic.id)),
      placementLine(db, learnerId, session, topic, plan.log, level),
    ])
    const order = new Map(unitRows.map((u) => [u.id, u.order]))
    // Concepts asked already hold evidence; onConflictDoNothing seeds only the rest.
    const seeds = conceptRows.map((c) => ({
      learnerId,
      conceptId: c.id,
      pKnown: placementPrior(order.get(c.unitId) ?? 0, unitRows.length, level),
      nAttempts: 0,
      updatedAt: now,
    }))
    const unlock = unitRows.filter((u) => u.order < 2 || unitBand(u.order, unitRows.length) < level).map((u) => u.id)
    stmts.push(
      db
        .update(learnerTopic)
        .set({ level })
        .where(and(eq(learnerTopic.learnerId, learnerId), eq(learnerTopic.topicId, topic.id))),
      ...chunks(seeds, 10).map((rows) => db.insert(learnerConcept).values(rows).onConflictDoNothing()),
      db
        .update(units)
        .set({ unlockedAt: now })
        .where(and(inArray(units.id, unlock), isNull(units.unlockedAt))),
      // The placement id is the session id, and the reveal line rides along in log_json.
      db.insert(placements).values({ id: session.id, learnerId, topicId: topic.id, logJson: JSON.stringify({ log: plan.log, levelLine }), levelResult: level, createdAt: now }),
    )
  } else if (!('log' in plan)) {
    const [lt, [{ answered }]] = await Promise.all([
      loadLearnerTopic(db, learnerId, topic.id),
      db.select({ answered: count() }).from(attempts).where(eq(attempts.sessionId, session.id)),
    ])
    const ids = JSON.parse(session.itemIdsJson) as string[]
    // The bonus is for finishing the queue, not for leaving early.
    bonus = plan.answered && plan.position >= ids.length - 1 ? SESSION_BONUS : 0
    stmts.push(
      db
        .update(learnerTopic)
        .set({ xp: sql`${learnerTopic.xp} + ${bonus}`, ...streakAfter(lt, new Date(now), answered) })
        .where(and(eq(learnerTopic.learnerId, learnerId), eq(learnerTopic.topicId, topic.id))),
    )
  }

  stmts.push(
    db
      .update(sessions)
      .set({ endedAt: now, xp: session.xp + bonus })
      .where(and(eq(sessions.id, session.id), isNull(sessions.endedAt))),
  )
  await batch(db, stmts)
}

async function summaryOf(db: Db, learnerId: string, session: SessionRow, topic: TopicRow): Promise<SummaryView> {
  const plan = readPlan(session)
  const [lt, [{ total }], wrong, mastery, frontier, [{ reviews }], [placement]] = await Promise.all([
    loadLearnerTopic(db, learnerId, topic.id),
    db.select({ total: count() }).from(attempts).where(eq(attempts.sessionId, session.id)),
    db
      .select({ itemId: attempts.itemId, confidence: attempts.confidence, gradeJson: attempts.gradeJson, payloadJson: items.payloadJson })
      .from(attempts)
      .innerJoin(items, eq(items.id, attempts.itemId))
      .where(and(eq(attempts.sessionId, session.id), eq(attempts.learnerId, learnerId), eq(attempts.correct, false)))
      .orderBy(asc(attempts.at)),
    unitMastery(db, learnerId, topic.id),
    loadFrontier(db, learnerId, topic.id),
    db
      .select({ reviews: count() })
      .from(learnerItem)
      .innerJoin(items, eq(items.id, learnerItem.itemId))
      .where(and(eq(learnerItem.learnerId, learnerId), eq(items.topicId, topic.id), eq(items.status, 'active'), lte(learnerItem.due, Date.now() + DAY))),
    db
      .select({ logJson: placements.logJson })
      .from(placements)
      .where(and(eq(placements.id, session.id), eq(placements.learnerId, learnerId))),
  ])

  const before = 'unitStart' in plan ? plan.unitStart : {}
  // One entry per missed item; a later miss of the same item replaces the earlier one.
  const mistakes = new Map(
    wrong.map((w) => [
      w.itemId,
      {
        itemId: w.itemId,
        stem: (JSON.parse(w.payloadJson) as ItemPayload).stem,
        correctAnswer: (JSON.parse(w.gradeJson ?? '{}') as { correctAnswer?: string }).correctAnswer ?? '',
        wasSure: w.confidence === 'sure',
      },
    ]),
  )
  const next = [reviews > 0 ? `${reviews} review${reviews === 1 ? '' : 's'}` : null, frontier[0]?.concept.name ?? null].filter(Boolean)
  return {
    sessionId: session.id,
    kind: session.kind,
    topicId: topic.id,
    durationMs: (session.endedAt ?? Date.now()) - session.startedAt,
    correct: session.correctCount,
    total,
    xp: session.xp,
    streak: lt.streakCount,
    level: lt.level,
    levelLine: placement ? ((JSON.parse(placement.logJson) as { levelLine?: string }).levelLine ?? null) : null,
    masteryMoved: mastery
      .filter((u) => u.unitId in before && Math.abs(u.mastery - before[u.unitId]) > 0.001)
      .map((u) => ({ unitId: u.unitId, unitName: u.unitName, before: before[u.unitId], after: u.mastery })),
    mistakes: [...mistakes.values()],
    nextLine: next.length ? `Next time: ${next.join(', then ')}.` : 'Next time: come back for fresh questions.',
  }
}
