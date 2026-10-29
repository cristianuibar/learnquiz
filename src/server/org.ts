import { createServerFn } from '@tanstack/react-start'
import { getRequestHeaders } from '@tanstack/react-start/server'
import { and, asc, desc, eq } from 'drizzle-orm'
import { z } from 'zod'
import { getDb } from '@/db'
import { invitation, member, organization, user } from '@/db/auth-schema'
import { jobRoles, memberRoleAssignments } from '@/db/schema'
import { getAuth } from '@/server/auth'
import { requireOrgAdmin } from '@/server/authz'
import { getEnv } from '@/server/env'
import { httpError } from '@/server/helpers'
import { getSessionUser } from '@/server/session'

const Slug = z.object({ slug: z.string().min(1).max(100) })

const slugify = (name: string) =>
  name
    .toLowerCase()
    .normalize('NFKD')
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-|-$/g, '')
    .slice(0, 40) || 'company'

const rolesOf = (orgId: string) =>
  getDb()
    .select({ id: jobRoles.id, name: jobRoles.name })
    .from(jobRoles)
    .where(and(eq(jobRoles.orgId, orgId), eq(jobRoles.status, 'active')))
    .orderBy(asc(jobRoles.createdAt))

export const createCompany = createServerFn({ method: 'POST' })
  .validator(z.object({ name: z.string().trim().min(2).max(80), roleName: z.string().trim().min(2).max(80) }))
  .handler(async ({ data }): Promise<{ slug: string }> => {
    const me = await getSessionUser()
    if (!me) throw httpError('Sign in first', 401)
    if (me.isAnonymous) throw httpError('Create an account first', 403)
    const db = getDb()
    const base = slugify(data.name)
    const taken = await db.select({ id: organization.id }).from(organization).where(eq(organization.slug, base)).get()
    const slug = taken || base === 'new' ? `${base}-${crypto.randomUUID().slice(0, 4)}` : base
    // The creator becomes owner and the company becomes their active organization.
    const org = await getAuth().api.createOrganization({ headers: getRequestHeaders(), body: { name: data.name, slug } })
    await db.insert(jobRoles).values({ id: crypto.randomUUID(), orgId: org.id, name: data.roleName, createdAt: Date.now() })
    return { slug: org.slug }
  })

export const getOrgOverview = createServerFn({ method: 'GET' })
  .validator(Slug)
  .handler(async ({ data }) => {
    const { org } = await requireOrgAdmin(data.slug)
    return { name: org.name, slug: org.slug, roles: await rolesOf(org.id) }
  })

export const getPeople = createServerFn({ method: 'GET' })
  .validator(Slug)
  .handler(async ({ data }) => {
    const { org } = await requireOrgAdmin(data.slug)
    const db = getDb()
    const [roles, members, invites] = await Promise.all([
      rolesOf(org.id),
      db
        .select({ id: member.id, name: user.name, email: user.email, role: member.role, jobRole: jobRoles.name })
        .from(member)
        .innerJoin(user, eq(user.id, member.userId))
        .leftJoin(memberRoleAssignments, and(eq(memberRoleAssignments.userId, member.userId), eq(memberRoleAssignments.orgId, member.organizationId)))
        .leftJoin(jobRoles, eq(jobRoles.id, memberRoleAssignments.jobRoleId))
        .where(eq(member.organizationId, org.id))
        .orderBy(asc(member.createdAt)),
      db
        .select({ id: invitation.id, name: invitation.inviteeName, email: invitation.email, jobRole: jobRoles.name, expiresAt: invitation.expiresAt })
        .from(invitation)
        .leftJoin(jobRoles, eq(jobRoles.id, invitation.jobRoleId))
        .where(and(eq(invitation.organizationId, org.id), eq(invitation.status, 'pending')))
        .orderBy(desc(invitation.createdAt)),
    ])
    return { id: org.id, name: org.name, slug: org.slug, baseUrl: getEnv().BETTER_AUTH_URL, roles, members, invites: invites.map((i) => ({ ...i, expired: i.expiresAt.getTime() < Date.now() })) }
  })

// Public on purpose: the invitation id is the secret in the invite link, and the page needs it before the invitee has an account.
export const getInvite = createServerFn({ method: 'GET' })
  .validator(z.object({ id: z.string().min(1).max(100) }))
  .handler(async ({ data }) => {
    const row = await getDb()
      .select({ company: organization.name, email: invitation.email, name: invitation.inviteeName, status: invitation.status, expiresAt: invitation.expiresAt })
      .from(invitation)
      .innerJoin(organization, eq(organization.id, invitation.organizationId))
      .where(eq(invitation.id, data.id))
      .get()
    if (!row) return null
    const status = row.status === 'pending' && row.expiresAt.getTime() < Date.now() ? 'expired' : row.status
    return { company: row.company, email: row.email, name: row.name, status }
  })
