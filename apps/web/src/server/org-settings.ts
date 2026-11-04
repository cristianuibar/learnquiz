import type { Branding } from '@learnquiz/api'
import { createServerFn } from '@tanstack/react-start'
import { getRequestHeaders } from '@tanstack/react-start/server'
import { and, asc, eq } from 'drizzle-orm'
import { z } from 'zod'
import { getDb } from '@/db'
import { member, organization } from '@/db/auth-schema'
import { orgSettings } from '@/db/schema'
import { accessibleAccent, CompanySettings, defaultWorkingHours } from '@/lib/company-settings'
import { getAuth } from '@/server/auth'
import { requireOrgAdmin } from '@/server/authz'
import { getEnv } from '@/server/env'
import { httpError } from '@/server/helpers'

const Slug = z.object({ slug: z.string().min(1).max(100) })

export const getCompanySettings = createServerFn({ method: 'GET' })
  .validator(Slug)
  .handler(async ({ data }) => {
    const { org } = await requireOrgAdmin(data.slug)
    const settings = await getDb().select().from(orgSettings).where(eq(orgSettings.orgId, org.id)).get()
    return {
      slug: org.slug,
      name: settings?.companyName ?? org.name,
      timezone: settings?.timezone ?? 'UTC',
      workingHours: settings?.workingHours ?? defaultWorkingHours,
      accent: settings?.accent ?? null,
      hasLogo: Boolean(settings?.logoKey),
    }
  })

export const saveCompanySettings = createServerFn({ method: 'POST' })
  .validator((input: FormData) => {
    if (!(input instanceof FormData)) throw httpError('Expected a settings form', 400)
    return input
  })
  .handler(async ({ data: form }) => {
    const slug = Slug.parse({ slug: form.get('slug') }).slug
    const { org } = await requireOrgAdmin(slug)
    const parsed = CompanySettings.safeParse({
      name: form.get('name'), timezone: form.get('timezone'), accent: form.get('accent') || null,
      workingHours: { days: form.getAll('days').map(Number), start: form.get('start'), end: form.get('end') },
    })
    if (!parsed.success) throw httpError(parsed.error.issues[0].message, 400)
    const data = parsed.data
    const file = form.get('logo')
    let upload: { bytes: ArrayBuffer; type: string } | undefined
    if (file instanceof File && file.size > 0) {
      if (file.size > 2 * 1024 * 1024) throw httpError('Logo must be 2 MB or smaller', 400)
      const bytes = await file.arrayBuffer()
      const b = new Uint8Array(bytes)
      // Accept only raster formats; never serve an uploaded SVG or HTML document.
      const type = [137, 80, 78, 71, 13, 10, 26, 10].every((v, i) => b[i] === v) ? 'image/png'
        : b[0] === 255 && b[1] === 216 && b[2] === 255 ? 'image/jpeg'
        : String.fromCharCode(...b.slice(0, 4)) === 'RIFF' && String.fromCharCode(...b.slice(8, 12)) === 'WEBP' ? 'image/webp' : null
      if (!type || file.type !== type) throw httpError('Upload a PNG, JPEG or WebP logo', 400)
      upload = { bytes, type }
    } else if (file !== null && !(file instanceof File)) throw httpError('Choose a logo file', 400)

    const db = getDb()
    const previous = await db.select().from(orgSettings).where(eq(orgSettings.orgId, org.id)).get()
    const removeLogo = form.get('removeLogo') === 'on'
    const newKey = upload ? `org-logos/${org.id}/${crypto.randomUUID()}` : null
    const logoKey = newKey ?? (removeLogo ? null : previous?.logoKey ?? null)
    const bucket = getEnv().MEDIA
    if (upload && newKey) await bucket.put(newKey, upload.bytes, { httpMetadata: { contentType: upload.type } })
    try {
      const settings = { companyName: data.name, timezone: data.timezone, workingHours: data.workingHours, accent: data.accent, logoKey }
      await db.batch([
        db.insert(orgSettings).values({ orgId: org.id, ...settings }).onConflictDoUpdate({ target: orgSettings.orgId, set: settings }),
        db.update(organization).set({ name: data.name }).where(eq(organization.id, org.id)),
      ])
    } catch (error) {
      if (newKey) await bucket.delete(newKey).catch(() => {})
      throw error
    }
    // A failed cleanup must not report a successfully saved settings form as unsaved.
    if (previous?.logoKey && previous.logoKey !== logoKey) await bucket.delete(previous.logoKey).catch(() => {})
  })

export const getCompanyBranding = createServerFn({ method: 'GET' }).handler(async (): Promise<Branding | null> => {
  const session = await getAuth().api.getSession({ headers: getRequestHeaders() })
  if (!session || session.user.isAnonymous) return null
  const active = session.session.activeOrganizationId
  const row = await getDb()
    .select({ orgId: organization.id, name: organization.name, logoKey: orgSettings.logoKey, accent: orgSettings.accent })
    .from(member)
    .innerJoin(organization, eq(organization.id, member.organizationId))
    .leftJoin(orgSettings, eq(orgSettings.orgId, organization.id))
    .where(and(eq(member.userId, session.user.id), active ? eq(member.organizationId, active) : undefined))
    .orderBy(asc(member.createdAt), asc(member.id))
    .limit(1).get()
  if (!row) return null
  return { name: row.name, logoUrl: row.logoKey ? `/api/org/${encodeURIComponent(row.orgId)}/logo?v=${encodeURIComponent(row.logoKey)}` : null, accent: row.accent && accessibleAccent(row.accent) ? row.accent : null }
})
