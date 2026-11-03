import { eq } from 'drizzle-orm'
import { getDb } from '@/db'
import { invitation } from '@/db/auth-schema'
import { orgSettings } from '@/db/schema'
import { requireMember } from '@/server/authz'
import { getEnv } from '@/server/env'

export async function serveCompanyLogo(orgId: string) {
  try {
    const { org } = await requireMember(orgId)
    const settings = await getDb().select({ logoKey: orgSettings.logoKey }).from(orgSettings).where(eq(orgSettings.orgId, org.id)).get()
    return await logoResponse(settings?.logoKey)
  } catch (error) {
    const status = (error as { status?: number }).status
    if (status === 401 || status === 403) return new Response(status === 401 ? 'Sign in first' : 'Forbidden', { status })
    throw error
  }
}

// Public and invite-scoped: the invite page shows the logo before sign-in.
export async function serveInviteLogo(invitationId: string) {
  const row = await getDb()
    .select({ logoKey: orgSettings.logoKey })
    .from(invitation)
    .innerJoin(orgSettings, eq(orgSettings.orgId, invitation.organizationId))
    .where(eq(invitation.id, invitationId))
    .get()
  return logoResponse(row?.logoKey)
}

async function logoResponse(logoKey: string | null | undefined) {
  const logo = logoKey ? await getEnv().MEDIA.get(logoKey) : null
  if (!logo) return new Response('Logo not found', { status: 404 })
  return new Response(logo.body, { headers: {
    'Content-Type': logo.httpMetadata?.contentType ?? 'application/octet-stream',
    'Cache-Control': 'private, no-store',
    'X-Content-Type-Options': 'nosniff',
    'Content-Security-Policy': "default-src 'none'; sandbox",
  } })
}
