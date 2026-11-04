import { createServerFn } from '@tanstack/react-start'
import { getRequestHeaders, setResponseStatus } from '@tanstack/react-start/server'
import { and, asc, count, desc, eq, inArray, isNull, ne, or, sql } from 'drizzle-orm'
import { z } from 'zod'
import { getDb } from '@/db'
import { member, organization, user } from '@/db/auth-schema'
import { getAuth } from '@/server/auth'
import { requireStaff } from '@/server/authz'
import { httpError } from '@/server/helpers'

const PAGE_SIZE = 25
const contains = (column: typeof user.email | typeof user.name, q: string) => sql`instr(lower(${column}), lower(${q})) > 0`

export const listUsers = createServerFn({ method: 'GET' })
  .validator(z.object({
    search: z.string().trim().max(200).default(''),
    role: z.enum(['all', 'admin', 'user']).default('all'),
    status: z.enum(['all', 'active', 'banned']).default('all'),
    offset: z.number().int().min(0).default(0),
  }))
  .handler(async ({ data }) => {
    await requireStaff()
    const db = getDb()
    // Queried directly: the Better Auth admin plugin's list endpoint filters on one field, so role and status together cannot go through it.
    const where = and(
      data.search ? contains(data.search.includes('@') ? user.email : user.name, data.search) : undefined,
      data.role === 'admin' ? eq(user.role, 'admin') : data.role === 'user' ? or(isNull(user.role), ne(user.role, 'admin')) : undefined,
      data.status === 'banned' ? eq(user.banned, true) : data.status === 'active' ? or(isNull(user.banned), eq(user.banned, false)) : undefined,
    )
    const [rows, [total]] = await Promise.all([
      db.select({ id: user.id, name: user.name, email: user.email, role: user.role, banned: user.banned, banReason: user.banReason, createdAt: user.createdAt })
        .from(user).where(where).orderBy(desc(user.createdAt), asc(user.id)).limit(PAGE_SIZE).offset(data.offset),
      db.select({ n: count() }).from(user).where(where),
    ])
    const companies = new Map<string, { name: string; role: string }>()
    if (rows.length) {
      const memberships = await db.select({ userId: member.userId, name: organization.name, role: member.role })
        .from(member).innerJoin(organization, eq(organization.id, member.organizationId))
        .where(inArray(member.userId, rows.map((r) => r.id))).orderBy(asc(member.createdAt))
      for (const m of memberships) if (!companies.has(m.userId)) companies.set(m.userId, { name: m.name, role: m.role })
    }
    return {
      users: rows.map((r) => ({
        id: r.id, name: r.name, email: r.email, admin: r.role === 'admin', banned: !!r.banned, banReason: r.banReason,
        createdAt: r.createdAt.getTime(), company: companies.get(r.id) ?? null,
      })),
      total: total.n,
    }
  })

export const setUserBan = createServerFn({ method: 'POST' })
  .validator(z.object({ userId: z.string().min(1).max(100), banned: z.boolean(), reason: z.string().max(2000).optional() }))
  .handler(async ({ data }): Promise<void> => {
    const staff = await requireStaff()
    if (data.userId === staff.id) {
      setResponseStatus(403)
      throw httpError("You can't ban yourself", 403)
    }
    const auth = getAuth()
    const headers = getRequestHeaders()
    if (!data.banned) {
      await auth.api.unbanUser({ headers, body: { userId: data.userId } })
      return
    }
    const reason = data.reason?.trim() ?? ''
    if (reason.length < 1 || reason.length > 500) {
      setResponseStatus(400)
      throw httpError('Enter a reason of 1 to 500 characters', 400)
    }
    await auth.api.banUser({ headers, body: { userId: data.userId, banReason: reason } })
  })
