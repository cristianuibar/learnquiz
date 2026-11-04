import type { UnitProcedure } from '@learnquiz/api/procedure'
import { createServerFn } from '@tanstack/react-start'
import { and, asc, eq, isNull, lt, or } from 'drizzle-orm'
import { z } from 'zod'
import { getDb } from '@/db'
import { concepts, sources, topics, units } from '@/db/schema'
import { chatJson } from '@/lib/llm/client'
import { procedurePrompt } from '@/lib/llm/prompts'
import { ProcedureGraph } from '@/lib/llm/schemas'
import { httpError } from '@/server/helpers'
import { assertWithinCompanyCap } from '@/server/model-cap'
import { requireLearnerId } from '@/server/session'
import { learnerCanAccess } from '@/server/topic-access'

export type UnitProcedureResult =
  | ({ status: 'ready' } & UnitProcedure)
  | { status: 'pending' }
  | null

type Stored = { sourceId: string; version: number; graph: ProcedureGraph }

function parseStored(json: string | null): Stored | null {
  if (!json) return null
  try {
    const v = JSON.parse(json) as Stored
    const graph = ProcedureGraph.safeParse(v.graph)
    return typeof v.sourceId === 'string' && typeof v.version === 'number' && graph.success ? { ...v, graph: graph.data } : null
  } catch {
    return null
  }
}

// The flowchart is stored once per unit and shared by everyone who can open the topic; it is rebuilt only when the
// unit's source changes version. Returns null when the unit has no usable source (no model call, no claim).
export const getUnitProcedure = createServerFn({ method: 'GET' })
  .validator(z.object({ unitId: z.string().min(1) }))
  .handler(async ({ data }): Promise<UnitProcedureResult> => {
    const learnerId = await requireLearnerId()
    const db = getDb()
    const [row] = await db.select({ unit: units, topic: topics })
      .from(units).innerJoin(topics, eq(topics.id, units.topicId))
      .where(and(eq(units.id, data.unitId), learnerCanAccess(db, learnerId)))
    if (!row) throw httpError('Unit not found', 404)
    const { unit, topic } = row

    // First usable source by concept order; a blank body counts as unusable, so scan for the first non-blank one.
    const usable = (await db.select({ id: sources.id, title: sources.title, version: sources.version, bodyText: sources.bodyText })
      .from(concepts).innerJoin(sources, eq(sources.id, concepts.sourceId))
      .where(and(eq(concepts.unitId, unit.id), isNull(sources.retiredAt), isNull(sources.deletedAt), eq(sources.status, 'ready')))
      .orderBy(asc(concepts.order))).find((s) => s.bodyText.trim())
    if (!usable) return null

    const stored = parseStored(unit.procedureJson)
    const meta = { title: usable.title, version: usable.version }
    if (stored && stored.sourceId === usable.id && stored.version === usable.version) return { status: 'ready', graph: stored.graph, source: meta }

    if (topic.orgId) await assertWithinCompanyCap(db, topic.orgId)
    const now = Date.now()
    // Atomic D1 claim works across worker instances. A crashed request can be retried after three minutes.
    const claimed = await db.update(units).set({ procedureStartedAt: now })
      .where(and(eq(units.id, unit.id),
        unit.procedureJson === null ? isNull(units.procedureJson) : eq(units.procedureJson, unit.procedureJson),
        or(isNull(units.procedureStartedAt), lt(units.procedureStartedAt, now - 180_000))))
      .returning({ id: units.id })
    if (!claimed.length) return { status: 'pending' }
    const claim = and(eq(units.id, unit.id), eq(units.procedureStartedAt, now))
    try {
      const graph = await chatJson({
        purpose: 'procedure',
        schema: ProcedureGraph,
        schemaName: 'procedure_graph',
        ...procedurePrompt({ topic: topic.title, unit: { name: unit.name, summary: unit.summary }, sourceText: usable.bodyText }),
        learnerId,
        orgId: topic.orgId,
        topicId: topic.id,
      })
      const value: Stored = { sourceId: usable.id, version: usable.version, graph }
      await db.update(units).set({ procedureJson: JSON.stringify(value), procedureStartedAt: null }).where(claim)
      return { status: 'ready', graph, source: meta }
    } catch (e) {
      await db.update(units).set({ procedureStartedAt: null }).where(claim).catch(() => {})
      throw e
    }
  })
