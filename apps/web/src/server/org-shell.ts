import { createServerFn } from '@tanstack/react-start'
import { setResponseStatus } from '@tanstack/react-start/server'
import { and, eq } from 'drizzle-orm'
import { z } from 'zod'
import { getDb } from '@/db'
import { member, organization, user as authUser } from '@/db/auth-schema'
import { orgSettings } from '@/db/schema'
import { requireOrgReader, requireUser } from '@/server/authz'
import { companyLogoUrl } from '@/server/org-settings'

// What the partner portal's side navigation needs: the company, who is looking, and whether they can edit.
export const getPortalShell = createServerFn({ method: 'GET' })
  .validator(z.object({ slug: z.string().min(1).max(100) }))
  .handler(async ({ data }) => {
    const access = await requireOrgReader(data.slug).catch((e: { status?: unknown }) => {
      // Keep the 403/404 on the server-rendered document; the router alone would report 500.
      if (typeof e.status === 'number') setResponseStatus(e.status)
      throw e
    })
    const { org, user, readOnly } = access
    const settings = await getDb().select({ logoKey: orgSettings.logoKey }).from(orgSettings).where(eq(orgSettings.orgId, org.id)).get()
    const role = 'role' in access ? (access.role.split(',').includes('owner') ? ('owner' as const) : ('admin' as const)) : null
    return {
      orgId: org.id,
      name: org.name,
      slug: org.slug,
      // The logo endpoint requires membership, so a staff viewer who is not a member would get a 403.
      logoUrl: readOnly ? null : companyLogoUrl(org.id, settings?.logoKey),
      userName: user.name,
      role,
      readOnly,
    }
  })

// For the "No access to this portal" page: the viewer's email, plus the company and its owner only if the viewer is a member (a non-member learns nothing about the company).
export const getAccessContext = createServerFn({ method: 'GET' })
  .validator(z.object({ slug: z.string().min(1).max(100) }))
  .handler(async ({ data }): Promise<{ email: string; company: string | null; owner: string | null }> => {
    const viewer = await requireUser()
    const db = getDb()
    const own = await db
      .select({ id: organization.id, name: organization.name })
      .from(member)
      .innerJoin(organization, eq(organization.id, member.organizationId))
      .where(and(eq(member.userId, viewer.id), eq(organization.slug, data.slug)))
      .get()
    if (!own) return { email: viewer.email, company: null, owner: null }
    const owners = await db
      .select({ name: authUser.name, role: member.role })
      .from(member)
      .innerJoin(authUser, eq(authUser.id, member.userId))
      .where(eq(member.organizationId, own.id))
      .all()
    const owner = owners.find((o) => o.role.split(',').includes('owner'))
    return { email: viewer.email, company: own.name, owner: owner?.name ?? null }
  })
