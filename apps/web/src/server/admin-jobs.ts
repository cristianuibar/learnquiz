import { createServerFn } from '@tanstack/react-start'
import { and, asc, count, eq, inArray, sql } from 'drizzle-orm'
import { z } from 'zod'
import { getDb } from '@/db'
import { member, organization } from '@/db/auth-schema'
import { concepts, jobRoles, sources, topics } from '@/db/schema'
import { plural } from '@/lib/utils'
import { requireStaff } from '@/server/authz'
import { drainConceptQueue } from '@/server/concept-gen'
import { retryFailedConcept } from '@/server/concept-retry'
import { runInBackground } from '@/server/env'
import { liveConcept } from '@/server/live-concept'
import { claimRoleBuild, releaseStaleBuild } from '@/server/role-curriculum'

export const JOB_FILTERS = ['notReady', 'failed', 'generating', 'pending', 'ready'] as const
export type JobFilter = (typeof JOB_FILTERS)[number]
export type JobState = 'failed' | 'generating' | 'pending' | 'ready'
export type JobRow = { id: string; kind: 'concept' | 'curriculum'; company: string; role: string | null; target: string; state: JobState; startedAt: number | null; error: string | null }
export const JOB_PAGE_SIZE = 25

const RANK: Record<JobState, number> = { failed: 0, generating: 1, pending: 2, ready: 3 }
const statesOf = (filter: JobFilter): JobState[] => (filter === 'notReady' ? ['failed', 'generating', 'pending'] : [filter])

// Company concepts and role curriculum builds. A retired document's concepts cannot be retried, so they are left out.
export const getGenerationJobs = createServerFn({ method: 'GET' })
  .validator(z.object({ filter: z.enum(JOB_FILTERS), offset: z.number().int().min(0).max(100_000) }))
  .handler(async ({ data }): Promise<{ counts: Record<JobState, number>; total: number; rows: JobRow[]; updatedAt: number }> => {
    await requireStaff()
    const db = getDb()
    // A build abandoned in 'generating' (its request died) shows as failed so it can be retried.
    await releaseStaleBuild(db)
    const states = statesOf(data.filter)
    const roleStates = states.filter((s): s is 'failed' | 'generating' => s === 'failed' || s === 'generating')
    const limit = data.offset + JOB_PAGE_SIZE
    const rank = sql<number>`case ${concepts.genStatus} when 'failed' then 0 when 'generating' then 1 when 'pending' then 2 else 3 end`
    const documents = sql<number>`(select count(*) from ${sources} where ${sources.topicId} = ${topics.id} and ${sources.deletedAt} is null and ${sources.retiredAt} is null)`.mapWith(Number)
    const [conceptCounts, roleCounts, conceptRows, roleRows] = await Promise.all([
      db.select({ state: concepts.genStatus, n: count() }).from(concepts).innerJoin(topics, eq(topics.id, concepts.topicId)).innerJoin(organization, eq(organization.id, topics.orgId))
        .where(liveConcept()).groupBy(concepts.genStatus),
      db.select({ state: topics.status, n: count() }).from(topics).innerJoin(organization, eq(organization.id, topics.orgId)).innerJoin(jobRoles, eq(jobRoles.id, topics.jobRoleId))
        .where(inArray(topics.status, ['generating', 'failed'])).groupBy(topics.status),
      db.select({ id: concepts.id, company: organization.name, role: jobRoles.name, target: concepts.name, state: concepts.genStatus, startedAt: concepts.genStartedAt, error: concepts.genError, order: concepts.order })
        .from(concepts).innerJoin(topics, eq(topics.id, concepts.topicId)).innerJoin(organization, eq(organization.id, topics.orgId)).leftJoin(jobRoles, eq(jobRoles.id, topics.jobRoleId))
        .where(and(inArray(concepts.genStatus, states), liveConcept())).orderBy(rank, asc(concepts.order), asc(concepts.id)).limit(limit),
      roleStates.length
        ? db.select({ id: topics.id, company: organization.name, role: jobRoles.name, documents, state: topics.status, startedAt: topics.genStartedAt })
          .from(topics).innerJoin(organization, eq(organization.id, topics.orgId)).innerJoin(jobRoles, eq(jobRoles.id, topics.jobRoleId))
          .where(inArray(topics.status, roleStates)).orderBy(asc(topics.id))
        : [],
    ])
    const counts = { failed: 0, generating: 0, pending: 0, ready: 0 }
    for (const { state, n } of conceptCounts) counts[state] += n
    for (const { state, n } of roleCounts) if (state === 'failed' || state === 'generating') counts[state] += n
    const merged = [
      ...conceptRows.map((c) => ({ key: [RANK[c.state], 0, c.order, c.id] as const, row: { id: `concept:${c.id}`, kind: 'concept', company: c.company, role: c.role, target: c.target, state: c.state, startedAt: c.startedAt, error: c.error } satisfies JobRow })),
      ...roleRows.map((r) => ({ key: [RANK[r.state as JobState], 1, 0, r.id] as const, row: { id: `curriculum:${r.id}`, kind: 'curriculum', company: r.company, role: r.role, target: plural(r.documents, 'document', 'documents'), state: r.state as JobState, startedAt: r.startedAt, error: null } satisfies JobRow })),
    ].sort((a, b) => a.key[0] - b.key[0] || a.key[1] - b.key[1] || a.key[2] - b.key[2] || (a.key[3] < b.key[3] ? -1 : a.key[3] > b.key[3] ? 1 : 0))
    return {
      counts, total: states.reduce((sum, s) => sum + counts[s], 0),
      rows: merged.slice(data.offset, limit).map((m) => m.row), updatedAt: Date.now(),
    }
  })

const status = (e: unknown) => (e as { status?: number } | null)?.status

// Retries failed jobs one by one; jobs that are no longer retryable are skipped, not failed.
export const retryJobs = createServerFn({ method: 'POST' })
  .validator(z.object({ ids: z.array(z.string().min(1).max(120)).min(1).max(100) }))
  .handler(async ({ data }): Promise<{ queued: number; skipped: number; failed: number }> => {
    await requireStaff()
    const db = getDb()
    let queued = 0
    let skipped = 0
    let failed = 0
    let conceptsQueued = 0
    const runs: Array<() => Promise<unknown>> = []
    for (const id of new Set(data.ids)) {
      if (id.startsWith('concept:')) {
        try {
          await retryFailedConcept(id.slice('concept:'.length), undefined, false)
          queued++
          conceptsQueued++
        } catch (e) {
          if (status(e) !== 404 && status(e) !== 409) throw e
          skipped++
        }
      } else if (id.startsWith('curriculum:')) {
        const topicId = id.slice('curriculum:'.length)
        const [row] = await db.select({ orgId: organization.id, roleId: jobRoles.id }).from(topics)
          .innerJoin(jobRoles, and(eq(jobRoles.id, topics.jobRoleId), eq(jobRoles.status, 'active')))
          .innerJoin(organization, eq(organization.id, jobRoles.orgId))
          .where(and(eq(topics.id, topicId), eq(topics.status, 'failed')))
        if (!row) { skipped++; continue }
        const members = await db.select({ userId: member.userId, role: member.role }).from(member).where(eq(member.organizationId, row.orgId))
        const ownerId = members.find((m) => m.role.split(',').includes('owner'))?.userId
        if (!ownerId) { skipped++; continue }
        try {
          runs.push(await claimRoleBuild({ orgId: row.orgId, ownerId, roleId: row.roleId }))
        } catch (e) {
          if (![404, 409, 422, 429].includes(status(e) ?? 0)) throw e
          skipped++
        }
      } else skipped++
    }
    if (conceptsQueued) runInBackground(drainConceptQueue())
    // Awaited, not backgrounded: background work lasts about 30 s and a build can take minutes. A failed build marks its own topic failed.
    // A claimed role build counts as queued only once its build finishes; a rejected build counts as failed.
    const results = await Promise.allSettled(runs.map((run) => run()))
    for (const r of results) { if (r.status === 'fulfilled') queued++; else failed++ }
    return { queued, skipped, failed }
  })
