import { eq } from 'drizzle-orm'
import { getDb } from '@/db'
import { orgSettings } from '@/db/schema'
import { requireMember } from '@/server/authz'
import { getEnv } from '@/server/env'

export async function serveCompanyLogo(orgId: string) {
  try {
    const { org } = await requireMember(orgId)
    const settings = await getDb().select({ logoKey: orgSettings.logoKey }).from(orgSettings).where(eq(orgSettings.orgId, org.id)).get()
    const logo = settings?.logoKey ? await getEnv().MEDIA.get(settings.logoKey) : null
    if (!logo) return new Response('Logo not found', { status: 404 })
    return new Response(logo.body, { headers: {
      'Content-Type': logo.httpMetadata?.contentType ?? 'application/octet-stream',
      'Cache-Control': 'private, no-store',
      'X-Content-Type-Options': 'nosniff',
      'Content-Security-Policy': "default-src 'none'; sandbox",
    } })
  } catch (error) {
    const status = (error as { status?: number }).status
    if (status === 401 || status === 403) return new Response(status === 401 ? 'Sign in first' : 'Forbidden', { status })
    throw error
  }
}
