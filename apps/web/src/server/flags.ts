import { createServerFn } from '@tanstack/react-start'
import { and, desc, eq } from 'drizzle-orm'
import { z } from 'zod'
import { getDb } from '@/db'
import { member } from '@/db/auth-schema'
import { attempts, itemFlags, items } from '@/db/schema'
import { httpError } from '@/server/helpers'
import { getSessionUser } from '@/server/session'
import { openFlag } from '@/server/topic-access'

// A company member disputes the result of their latest answer on a concept; it lands in the admins' question review.
export const flagResult = createServerFn({ method: 'POST' })
  .validator(z.object({ conceptId: z.string().min(1), note: z.string().min(1).max(500).optional() }))
  .handler(async ({ data }): Promise<{ ok: true }> => {
    const user = await getSessionUser()
    if (!user) throw httpError('Sign in first', 401)
    const db = getDb()
    const isMember = !user.isAnonymous && await db.select({ id: member.id }).from(member).where(eq(member.userId, user.id)).limit(1).get()
    if (!isMember) throw httpError('Only company members can flag a result', 403)
    const attempt = await db
      .select({ id: attempts.id, itemId: attempts.itemId, sourceVersion: items.sourceVersion })
      .from(attempts).innerJoin(items, eq(items.id, attempts.itemId))
      .where(and(eq(attempts.learnerId, user.id), eq(attempts.conceptId, data.conceptId)))
      .orderBy(desc(attempts.at)).limit(1).get()
    if (!attempt) throw httpError('No attempt for this concept', 404)
    if (await openFlag(db, user.id, attempt.itemId)) return { ok: true }
    await db.insert(itemFlags).values({
      id: crypto.randomUUID(), itemId: attempt.itemId, userId: user.id, reason: 'unfair-result', note: data.note ?? null,
      attemptId: attempt.id, sourceVersion: attempt.sourceVersion, createdAt: Date.now(),
    })
    return { ok: true }
  })
