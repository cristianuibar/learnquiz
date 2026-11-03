import { createServerFn } from '@tanstack/react-start'
import type { DisclosureAccepted } from '@learnquiz/api'
import { and, asc, eq, isNull } from 'drizzle-orm'
import { getDb } from '@/db'
import { member, organization } from '@/db/auth-schema'
import { consents } from '@/db/schema'
import { facebookEnabled } from '@/server/auth'
import { httpError } from '@/server/helpers'
import { getSessionUser } from '@/server/session'
import { assignedRoleTopic } from '@/server/topic-access'

// Lives apart from the request helpers so no server-only import reaches the client bundle.
export const getSessionFn = createServerFn({ method: 'GET' }).handler(
  async (): Promise<{
    user: { id: string; name: string; isAnonymous: boolean; role?: string | null } | null
    facebookEnabled: boolean
    needsDisclosure: boolean
    adminCompanies: { name: string; slug: string }[]
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
    const adminCompanies =
      user && !user.isAnonymous
        ? (await getDb()
            .select({ name: organization.name, slug: organization.slug, role: member.role })
            .from(member)
            .innerJoin(organization, eq(organization.id, member.organizationId))
            .where(eq(member.userId, user.id))
            .orderBy(asc(member.createdAt), asc(organization.id)))
            .filter(({ role }) => role.split(',').some((r) => r === 'owner' || r === 'admin'))
            .map(({ name, slug }) => ({ name, slug }))
        : []
    return {
      user: user && { id: user.id, name: user.name, isAnonymous: Boolean(user.isAnonymous), role: user.role },
      facebookEnabled: facebookEnabled(),
      needsDisclosure: Boolean(unconsented),
      adminCompanies,
    }
  },
)

// Returns the assigned role's ready topic so the invite flow can land on the training path.
export const acceptDisclosure = createServerFn({ method: 'POST' }).handler(async (): Promise<DisclosureAccepted> => {
  const user = await getSessionUser()
  if (!user || user.isAnonymous) throw httpError('Sign in first', 401)
  const db = getDb()
  await db.insert(consents).values({ userId: user.id, kind: 'disclosure-v1', acceptedAt: Date.now() }).onConflictDoNothing()
  const role = await assignedRoleTopic(db, user.id)
  return { roleTopicId: role?.topic.status === 'ready' ? role.topic.id : null }
})
