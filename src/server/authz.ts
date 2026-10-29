import { and, eq, or } from 'drizzle-orm'
import { getDb, type Db } from '@/db'
import { member, organization } from '@/db/auth-schema'
import { httpError } from '@/server/helpers'
import { getSessionUser } from '@/server/session'

// Server-only checks for every server function that reads or writes a company's data. `org` is an organization id or slug.
// The membership row is joined on the user, so a slug that happens to equal another company's id still resolves to the user's own company or nothing.

export async function checkMembership(db: Db, userId: string, org: string, adminOnly: boolean) {
  const row = await db
    .select({ org: organization, role: member.role })
    .from(member)
    .innerJoin(organization, eq(organization.id, member.organizationId))
    .where(and(eq(member.userId, userId), or(eq(organization.id, org), eq(organization.slug, org))))
    .get()
  if (!row) throw httpError('You are not a member of this company', 403)
  if (adminOnly && !row.role.split(',').some((r) => r === 'owner' || r === 'admin')) throw httpError('Only company admins can do this', 403)
  return row
}

async function requireUser() {
  const user = await getSessionUser()
  if (!user) throw httpError('Sign in first', 401)
  return user
}

export async function requireMember(org: string) {
  const user = await requireUser()
  return { user, ...(await checkMembership(getDb(), user.id, org, false)) }
}

// Company role owner or admin: the partner portal.
export async function requireOrgAdmin(org: string) {
  const user = await requireUser()
  return { user, ...(await checkMembership(getDb(), user.id, org, true)) }
}

// Learn Quiz team: Better Auth admin plugin role.
export async function requireStaff() {
  const user = await requireUser()
  if (user.role !== 'admin') throw httpError('Staff only', 403)
  return user
}
