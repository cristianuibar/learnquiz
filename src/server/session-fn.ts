import { createServerFn } from '@tanstack/react-start'
import { and, eq, isNull } from 'drizzle-orm'
import { getDb } from '@/db'
import { member } from '@/db/auth-schema'
import { consents } from '@/db/schema'
import { facebookEnabled } from '@/server/auth'
import { httpError } from '@/server/helpers'
import { getSessionUser } from '@/server/session'

// Lives apart from the request helpers so no server-only import reaches the client bundle.
export const getSessionFn = createServerFn({ method: 'GET' }).handler(
  async (): Promise<{
    user: { id: string; name: string; isAnonymous: boolean } | null
    facebookEnabled: boolean
    needsDisclosure: boolean
  }> => {
    const user = await getSessionUser()
    // A signed-in member of any company who has not accepted the disclosure yet.
    const unconsented =
      user &&
      !user.isAnonymous &&
      (await getDb()
        .select({ id: member.id })
        .from(member)
        .leftJoin(consents, and(eq(consents.userId, member.userId), eq(consents.kind, 'disclosure-v1')))
        .where(and(eq(member.userId, user.id), isNull(consents.userId)))
        .limit(1)
        .get())
    return {
      user: user && { id: user.id, name: user.name, isAnonymous: Boolean(user.isAnonymous) },
      facebookEnabled: facebookEnabled(),
      needsDisclosure: Boolean(unconsented),
    }
  },
)

export const acceptDisclosure = createServerFn({ method: 'POST' }).handler(async (): Promise<void> => {
  const user = await getSessionUser()
  if (!user || user.isAnonymous) throw httpError('Sign in first', 401)
  await getDb().insert(consents).values({ userId: user.id, kind: 'disclosure-v1', acceptedAt: Date.now() }).onConflictDoNothing()
})
