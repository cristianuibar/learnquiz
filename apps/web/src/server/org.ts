import { createServerFn, createServerOnlyFn } from '@tanstack/react-start'
import { getRequestHeaders } from '@tanstack/react-start/server'
import { and, asc, count, eq, gt, lte, notExists, or } from 'drizzle-orm'
import { alias } from 'drizzle-orm/sqlite-core'
import type { InviteView } from '@learnquiz/api/invite'
import { brandProblem } from '@learnquiz/tokens'
import { z } from 'zod'
import { getDb } from '@/db'
import { invitation, member, organization } from '@/db/auth-schema'
import { attempts, concepts, jobRoles, learnerConcept, memberRoleAssignments, orgSettings, topics } from '@/db/schema'
import { roleMastery } from '@/lib/learning/path'
import { WEEK, benchmarkMet } from '@/lib/learning/profile'
import { getAuth } from '@/server/auth'
import { requireOrgAdmin, requireOrgReader } from '@/server/authz'
import { httpError, mean } from '@/server/helpers'
import { liveConcept } from '@/server/live-concept'
import { getSessionUser } from '@/server/session'

const Slug = z.object({ slug: z.string().min(1).max(100) })
const benchmarkMessage = 'Enter a whole percentage from 50 to 100'
const Role = z.object({
  name: z.string().trim().min(1, 'Enter a role name').min(2, 'Use at least 2 characters for the role name').max(80, 'Use at most 80 characters for the role name'),
  // Entered as a whole percentage, stored as a fraction.
  benchmark: z.number().int(benchmarkMessage).min(50, benchmarkMessage).max(100, benchmarkMessage).default(85).transform((percent) => percent / 100),
  onboardingDays: z.number().int('Use whole days for the onboarding period').min(1, 'Use at least 1 day for the onboarding period').max(365, 'Use at most 365 days for the onboarding period').default(30),
})

const slugify = (name: string) =>
  name
    .toLowerCase()
    .normalize('NFKD')
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-|-$/g, '')
    .slice(0, 40) || 'company'

// Server-only so exporting them for People keeps the database out of the client bundle.
export const rolesOf = createServerOnlyFn((orgId: string) =>
  getDb()
    .select({ id: jobRoles.id, name: jobRoles.name, benchmark: jobRoles.benchmark, onboardingDays: jobRoles.onboardingDays, topicId: topics.id, topicStatus: topics.status })
    .from(jobRoles)
    .innerJoin(topics, eq(topics.jobRoleId, jobRoles.id))
    .where(and(eq(jobRoles.orgId, orgId), eq(jobRoles.status, 'active')))
    .orderBy(asc(jobRoles.createdAt)))

export type Training = { assignedAt: number; stage: 'onboarding' | 'proficient'; progress: number; daysToProficiency: number | null; criticalConfidentErrors: number; mastery: number; benchmark: number }

export const trainingOf = createServerOnlyFn(async (orgId: string) => {
  const db = getDb()
  const now = Date.now()
  const correction = alias(attempts, 'correction')
  const [rows, errors] = await Promise.all([
    db.select({ userId: memberRoleAssignments.userId, assignedAt: memberRoleAssignments.assignedAt, proficientAt: memberRoleAssignments.proficientAt, benchmark: jobRoles.benchmark, conceptId: concepts.id, critical: concepts.critical, pKnown: learnerConcept.pKnown })
      .from(memberRoleAssignments)
      .innerJoin(member, and(eq(member.userId, memberRoleAssignments.userId), eq(member.organizationId, memberRoleAssignments.orgId)))
      .innerJoin(jobRoles, and(eq(jobRoles.id, memberRoleAssignments.jobRoleId), eq(jobRoles.orgId, memberRoleAssignments.orgId), eq(jobRoles.status, 'active')))
      .leftJoin(topics, and(eq(topics.jobRoleId, jobRoles.id), eq(topics.status, 'ready')))
      .leftJoin(concepts, and(eq(concepts.topicId, topics.id), liveConcept()))
      .leftJoin(learnerConcept, and(eq(learnerConcept.conceptId, concepts.id), eq(learnerConcept.learnerId, memberRoleAssignments.userId)))
      .where(eq(memberRoleAssignments.orgId, orgId)),
    db.selectDistinct({ userId: attempts.learnerId, itemId: attempts.itemId })
      .from(attempts)
      .innerJoin(concepts, and(eq(concepts.id, attempts.conceptId), eq(concepts.critical, true), liveConcept()))
      .innerJoin(topics, and(eq(topics.id, concepts.topicId), eq(topics.status, 'ready')))
      .innerJoin(memberRoleAssignments, and(eq(memberRoleAssignments.userId, attempts.learnerId), eq(memberRoleAssignments.jobRoleId, topics.jobRoleId)))
      .where(and(eq(memberRoleAssignments.orgId, orgId), eq(attempts.correct, false), eq(attempts.confidence, 'sure'), lte(attempts.at, now), notExists(
        db.select({ id: correction.id }).from(correction).where(and(
          eq(correction.learnerId, attempts.learnerId), eq(correction.itemId, attempts.itemId), eq(correction.correct, true), lte(correction.at, now),
          or(gt(correction.at, attempts.at), and(eq(correction.at, attempts.at), gt(correction.id, attempts.id))),
        )),
      ))),
  ])
  const progress = new Map<string, { assignedAt: number; proficientAt: number | null; benchmark: number; list: { id: string; critical: boolean; pKnown: number }[] }>()
  for (const row of rows) {
    const current = progress.get(row.userId) ?? { assignedAt: row.assignedAt, proficientAt: row.proficientAt, benchmark: row.benchmark, list: [] }
    if (row.conceptId !== null) {
      current.list.push({ id: row.conceptId, critical: row.critical ?? false, pKnown: row.pKnown ?? 0 })
    }
    progress.set(row.userId, current)
  }
  const training = new Map<string, Training>()
  for (const [userId, progressRow] of progress) {
    const proficient = benchmarkMet(progressRow.list, progressRow.benchmark)
    const reachedAt = progressRow.proficientAt
    training.set(userId, {
      assignedAt: progressRow.assignedAt,
      stage: proficient ? 'proficient' : 'onboarding',
      // Critical concepts must each reach the benchmark too, so the weakest one caps progress below 100% until proficiency is met.
      progress: progressRow.list.length ? (progressRow.benchmark > 0 ? Math.min(1, ...[mean(progressRow.list.map((c) => c.pKnown)), ...progressRow.list.filter((c) => c.critical).map((c) => c.pKnown)].map((p) => p / progressRow.benchmark)) : 1) : 0,
      daysToProficiency: proficient && reachedAt !== null && reachedAt >= progressRow.assignedAt && reachedAt <= now ? Math.ceil((reachedAt - progressRow.assignedAt) / 86_400_000) : null,
      criticalConfidentErrors: 0,
      mastery: Math.round(roleMastery(progressRow.list.map((c) => ({ conceptId: c.id, pKnown: c.pKnown })), progressRow.list.map((c) => c.id)) * 100),
      benchmark: Math.round(progressRow.benchmark * 100),
    })
  }
  for (const error of errors) {
    const row = training.get(error.userId)
    if (row) row.criticalConfidentErrors++
  }
  return training
})

async function insertRole(orgId: string, data: { name: string } & Partial<z.output<typeof Role>>) {
  const db = getDb()
  const id = crypto.randomUUID()
  const createdAt = Date.now()
  // A role and its single draft topic must be stored together.
  await db.batch([
    db.insert(jobRoles).values({ id, orgId, ...data, createdAt }),
    db.insert(topics).values({ id: crypto.randomUUID(), orgId, jobRoleId: id, title: data.name, status: 'draft', createdAt }),
  ])
  return { id }
}

export const createCompany = createServerFn({ method: 'POST' })
  .validator(z.object({ name: z.string().trim().min(1, 'Enter a company name').min(2, 'Use at least 2 characters for the company name').max(80, 'Use at most 80 characters for the company name'), roleName: Role.shape.name }))
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
    await insertRole(org.id, { name: data.roleName })
    return { slug: org.slug }
  })

export const listRoles = createServerFn({ method: 'GET' })
  .validator(Slug)
  .handler(async ({ data }) => {
    const { org } = await requireOrgAdmin(data.slug)
    return { name: org.name, slug: org.slug, roles: await rolesOf(org.id) }
  })

export const createRole = createServerFn({ method: 'POST' })
  .validator(Slug.extend(Role.shape))
  .handler(async ({ data: { slug, ...role } }) => {
    const { org } = await requireOrgAdmin(slug)
    // Partners pick roles by name, so two active roles in one company must not share a name.
    const key = role.name.trim().toLowerCase()
    const roles = await getDb().select({ name: jobRoles.name }).from(jobRoles).where(and(eq(jobRoles.orgId, org.id), eq(jobRoles.status, 'active')))
    if (roles.some((r) => r.name.trim().toLowerCase() === key)) throw httpError(JSON.stringify([{ code: 'custom', path: ['name'], message: 'A role with this name already exists' }]), 409)
    return insertRole(org.id, role)
  })

export const getOrgOverview = createServerFn({ method: 'GET' })
  .validator(Slug)
  .handler(async ({ data }) => {
    const { org, readOnly } = await requireOrgReader(data.slug)
    const db = getDb()
    const now = Date.now()
    const [roles, progress, [invited], [errors]] = await Promise.all([
      rolesOf(org.id),
      trainingOf(org.id),
      // Invited employees count before they join, the same ones People shows as Invited rather than Expired.
      db.select({ n: count() })
        .from(invitation)
        .where(and(eq(invitation.organizationId, org.id), eq(invitation.status, 'pending'), gt(invitation.expiresAt, new Date(now)))),
      db.select({ n: count() })
        .from(attempts)
        .innerJoin(concepts, and(eq(concepts.id, attempts.conceptId), eq(concepts.critical, true)))
        .innerJoin(topics, and(eq(topics.id, concepts.topicId), eq(topics.status, 'ready')))
        .innerJoin(memberRoleAssignments, and(eq(memberRoleAssignments.userId, attempts.learnerId), eq(memberRoleAssignments.jobRoleId, topics.jobRoleId)))
        .innerJoin(member, and(eq(member.userId, memberRoleAssignments.userId), eq(member.organizationId, memberRoleAssignments.orgId)))
        .where(and(eq(memberRoleAssignments.orgId, org.id), eq(attempts.correct, false), gt(attempts.at, now - WEEK), lte(attempts.at, now))),
    ])
    const proficient = [...progress.values()].filter((row) => row.stage === 'proficient')
    const days = proficient.flatMap((row) => row.daysToProficiency === null ? [] : [row.daysToProficiency])
    return { name: org.name, slug: org.slug, roles, readOnly, training: { employees: progress.size + (invited?.n ?? 0), proficientEmployees: proficient.length, daysToProficiency: days.length ? Math.ceil(mean(days)) : null, criticalErrorsThisWeek: errors?.n ?? 0, documentsToReview: null as number | null } }
  })

// Public on purpose: the invitation id is the secret in the invite link, and the page needs it before the invitee has an account.
export const getInvite = createServerFn({ method: 'GET' })
  .validator(z.object({ id: z.string().min(1).max(100) }))
  .handler(async ({ data }): Promise<InviteView | null> => {
    const row = await getDb()
      .select({ company: organization.name, email: invitation.email, name: invitation.inviteeName, status: invitation.status, expiresAt: invitation.expiresAt, roleName: jobRoles.name, accent: orgSettings.accent, logoKey: orgSettings.logoKey })
      .from(invitation)
      .innerJoin(organization, eq(organization.id, invitation.organizationId))
      .innerJoin(jobRoles, and(eq(jobRoles.id, invitation.jobRoleId), eq(jobRoles.orgId, invitation.organizationId)))
      .leftJoin(orgSettings, eq(orgSettings.orgId, invitation.organizationId))
      .where(eq(invitation.id, data.id))
      .get()
    if (!row) return null
    const status = row.status === 'pending' && row.expiresAt.getTime() < Date.now() ? 'expired' : (row.status as InviteView['status'])
    const viewer = await getSessionUser()
    const otherAccount = !!viewer && !viewer.isAnonymous && viewer.email.toLowerCase() !== row.email.toLowerCase()
    return { company: row.company, email: row.email, name: row.name, status, otherAccount, roleName: row.roleName, accent: row.accent !== null && brandProblem(row.accent) === null ? row.accent : null, logoUrl: row.logoKey ? `/api/invites/${encodeURIComponent(data.id)}/logo?v=${encodeURIComponent(row.logoKey)}` : null }
  })
