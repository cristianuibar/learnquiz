import { createServerFn } from '@tanstack/react-start'
import { asc, eq } from 'drizzle-orm'
import { getDb } from '@/db'
import { organization, user } from '@/db/auth-schema'
import { concepts, itemFlags, items, jobRoles, topics, units } from '@/db/schema'
import { requireStaff } from '@/server/authz'

export const getContentFlags = createServerFn({ method: 'GET' }).handler(async () => {
  await requireStaff()
  const db = getDb()
  const question = {
    payloadJson: items.payloadJson, itemId: items.id, unit: units.name,
    company: organization.name, slug: organization.slug, roleId: jobRoles.id,
  }
  const [reports, retirements, companies] = await Promise.all([
    db.select({ ...question, id: itemFlags.id, reason: itemFlags.reason, note: itemFlags.note,
      createdAt: itemFlags.createdAt, personName: user.name, resolvedAt: itemFlags.resolvedAt })
      .from(itemFlags).innerJoin(items, eq(items.id, itemFlags.itemId))
      .innerJoin(concepts, eq(concepts.id, items.conceptId)).innerJoin(units, eq(units.id, concepts.unitId))
      .innerJoin(topics, eq(topics.id, items.topicId)).innerJoin(jobRoles, eq(jobRoles.id, topics.jobRoleId))
      .innerJoin(organization, eq(organization.id, jobRoles.orgId)).leftJoin(user, eq(user.id, itemFlags.userId)),
    db.select({ ...question, id: items.id, createdAt: items.createdAt, retiredAt: items.retiredAt, personName: user.name })
      .from(items).innerJoin(concepts, eq(concepts.id, items.conceptId)).innerJoin(units, eq(units.id, concepts.unitId))
      .innerJoin(topics, eq(topics.id, items.topicId)).innerJoin(jobRoles, eq(jobRoles.id, topics.jobRoleId))
      .innerJoin(organization, eq(organization.id, jobRoles.orgId)).leftJoin(user, eq(user.id, items.retiredBy))
      .where(eq(items.status, 'retired')),
    db.select({ name: organization.name, slug: organization.slug }).from(organization).orderBy(asc(organization.name)),
  ])
  const rows = [
    ...reports.map((r) => ({ ...r, type: 'learner' as const, retiredAt: null })),
    ...retirements.map((r) => ({ ...r, type: 'partner' as const, createdAt: r.retiredAt ?? r.createdAt, reason: null, note: null, resolvedAt: null })),
  ].map(({ payloadJson, ...r }) => ({ ...r, stem: (JSON.parse(payloadJson) as { stem: string }).stem }))
    .sort((a, b) => b.createdAt - a.createdAt || a.type.localeCompare(b.type) || a.id.localeCompare(b.id))
  return { rows, companies, counts: { all: rows.length, learner: reports.length, partner: retirements.length } }
})
