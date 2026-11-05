import { and, eq, isNull } from 'drizzle-orm'
import type { Db } from '@/db'
import { concepts } from '@/db/schema'
import { liveConcept } from '@/server/live-concept'

export const STALE_CLAIM_MS = 90_000
const HEARTBEAT_MS = 25_000

// Compare against the observed heartbeat: two joiners cannot both replace the same owner.
export async function claimConcept(db: Db, conceptId: string, available: 'ready' | 'pending'): Promise<number | null> {
  const [current] = await db.select({ status: concepts.genStatus, at: concepts.genStartedAt })
    .from(concepts).where(eq(concepts.id, conceptId))
  const now = Date.now()
  if (!current || (current.status !== available && !(current.status === 'generating' && (current.at ?? 0) < now - STALE_CLAIM_MS))) return null
  const at = Math.max(now, (current.at ?? 0) + 1)
  const claimed = await db.update(concepts).set({ genStatus: 'generating', genStartedAt: at })
    .where(and(eq(concepts.id, conceptId), liveConcept(), eq(concepts.genStatus, current.status),
      current.at === null ? isNull(concepts.genStartedAt) : eq(concepts.genStartedAt, current.at)))
    .returning({ id: concepts.id })
  return claimed.length ? at : null
}

export function heartbeatClaim(db: Db, conceptId: string, initialAt: number) {
  let at = initialAt
  let pending: Promise<void> = Promise.resolve()
  const owned = () => and(eq(concepts.id, conceptId), eq(concepts.genStatus, 'generating'), eq(concepts.genStartedAt, at))
  // Serialize interval and between-step updates so they always compare against our latest timestamp.
  const renew = () => {
    pending = pending.then(async () => {
      const next = Math.max(Date.now(), at + 1)
      const renewed = await db.update(concepts).set({ genStartedAt: next }).where(owned()).returning({ id: concepts.id })
      if (!renewed.length) throw new Error('Concept generation claim was replaced')
      at = next
    })
    return pending
  }
  const timer = setInterval(() => { void renew().catch((e) => console.error('concept heartbeat failed', e)) }, HEARTBEAT_MS)
  return {
    renew,
    owned,
    async stop() {
      clearInterval(timer)
      await pending.catch(() => {})
    },
  }
}
