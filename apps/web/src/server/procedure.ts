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

// chatJson can take two 120 s attempts on Fireworks and two more on the Meta fallback, so a live claim must outlast
// that whole retry window; only a crashed request's claim is ever this old.
const STALE_CLAIM_MS = 10 * 60 * 1000

export type UnitProcedureResult =
  | ({ status: 'ready' } & UnitProcedure)
  | { status: 'pending' }
  | null

// `sources` lists every document the graph was built from as id@version, so replacing any of them rebuilds it.
type Stored = { sources: string; graph: ProcedureGraph }

function parseStored(json: string | null): Stored | null {
  if (!json) return null
  try {
    const v = JSON.parse(json) as Stored
    const graph = ProcedureGraph.safeParse(v.graph)
    return typeof v.sources === 'string' && graph.success ? { sources: v.sources, graph: graph.data } : null
  } catch {
    return null
  }
}

// The flowchart is stored once per unit and shared by everyone who can open the topic; it is rebuilt only when the
// version of any of the unit's documents changes. Returns null when the unit has no usable source (no model call, no claim).
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

    // Every usable document the unit's concepts cite, in concept order; a blank body counts as unusable.
    const linked = await db.select({ id: sources.id, title: sources.title, version: sources.version, bodyText: sources.bodyText })
      .from(concepts).innerJoin(sources, eq(sources.id, concepts.sourceId))
      .where(and(eq(concepts.unitId, unit.id), isNull(sources.retiredAt), isNull(sources.deletedAt), eq(sources.status, 'ready')))
      .orderBy(asc(concepts.order))
    const documents = linked.filter((s, i) => s.bodyText.trim() && linked.findIndex((o) => o.id === s.id) === i)
    if (!documents.length) return null

    const stored = parseStored(unit.procedureJson)
    // The caption names the unit's first document.
    const meta = { title: documents[0]!.title, version: documents[0]!.version }
    const key = documents.map((d) => `${d.id}@${d.version}`).join(',')
    if (stored?.sources === key) return { status: 'ready', graph: stored.graph, source: meta }

    if (topic.orgId) await assertWithinCompanyCap(db, topic.orgId)
    const now = Date.now()
    // Atomic D1 claim works across worker instances. A crashed request can be retried once its claim is stale.
    const claimed = await db.update(units).set({ procedureStartedAt: now })
      .where(and(eq(units.id, unit.id),
        unit.procedureJson === null ? isNull(units.procedureJson) : eq(units.procedureJson, unit.procedureJson),
        or(isNull(units.procedureStartedAt), lt(units.procedureStartedAt, now - STALE_CLAIM_MS))))
      .returning({ id: units.id })
    if (!claimed.length) return { status: 'pending' }
    const claim = and(eq(units.id, unit.id), eq(units.procedureStartedAt, now))
    try {
      const graph = await chatJson({
        purpose: 'procedure',
        schema: ProcedureGraph,
        schemaName: 'procedure_graph',
        ...procedurePrompt({ topic: topic.title, unit: { name: unit.name, summary: unit.summary }, documents }),
        learnerId,
        orgId: topic.orgId,
        topicId: topic.id,
      })
      const value: Stored = { sources: key, graph }
      await db.update(units).set({ procedureJson: JSON.stringify(value), procedureStartedAt: null }).where(claim)
      return { status: 'ready', graph, source: meta }
    } catch (e) {
      await db.update(units).set({ procedureStartedAt: null }).where(claim).catch(() => {})
      throw e
    }
  })
