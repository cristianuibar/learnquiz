import { createServerFn } from '@tanstack/react-start'
import { eq } from 'drizzle-orm'
import { z } from 'zod'
import { getDb } from '@/db'
import { orgSettings } from '@/db/schema'
import { requireOrgReader } from '@/server/authz'
import { companyLogoUrl } from '@/server/org-settings'

// What the partner portal's side navigation needs: the company, who is looking, and whether they can edit.
export const getPortalShell = createServerFn({ method: 'GET' })
  .validator(z.object({ slug: z.string().min(1).max(100) }))
  .handler(async ({ data }) => {
    const access = await requireOrgReader(data.slug)
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
