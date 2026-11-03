import { createServerFn } from '@tanstack/react-start'
import { getRequestHeaders } from '@tanstack/react-start/server'
import { and, asc, desc, eq, gt, lte, notExists, or } from 'drizzle-orm'
import { alias } from 'drizzle-orm/sqlite-core'
import { z } from 'zod'
import { getDb } from '@/db'
import { invitation, member, organization, user } from '@/db/auth-schema'
import { attempts, concepts, jobRoles, learnerConcept, memberRoleAssignments, topics } from '@/db/schema'
import { getAuth } from '@/server/auth'
import { requireOrgAdmin, requireOrgReader } from '@/server/authz'
import { getEnv } from '@/server/env'
import { httpError, mean } from '@/server/helpers'
import { getSessionUser } from '@/server/session'

const Slug = z.object({ slug: z.string().min(1).max(100) })
const Role = z.object({
  name: z.string().trim().min(2).max(80),
  benchmark: z.number().min(0).max(1).default(0.85),
  onboardingDays: z.number().int().positive().default(30),
})

const slugify = (name: string) =>
  name
    .toLowerCase()
    .normalize('NFKD')
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-|-$/g, '')
    .slice(0, 40) || 'company'

const rolesOf = (orgId: string) =>
  getDb()
    .select({ id: jobRoles.id, name: jobRoles.name, benchmark: jobRoles.benchmark, onboardingDays: jobRoles.onboardingDays, topicId: topics.id, topicStatus: topics.status })
    .from(jobRoles)
    .innerJoin(topics, eq(topics.jobRoleId, jobRoles.id))
    .where(and(eq(jobRoles.orgId, orgId), eq(jobRoles.status, 'active')))
    .orderBy(asc(jobRoles.createdAt))

type Training = { stage: 'onboarding' | 'proficient'; daysToProficiency: number | null; criticalConfidentErrors: number }

async function trainingOf(orgId: string) {
  const db = getDb()
  const now = Date.now()
  const correction = alias(attempts, 'correction')
  const [rows, errors] = await Promise.all([
    db.select({ userId: memberRoleAssignments.userId, assignedAt: memberRoleAssignments.assignedAt, proficientAt: memberRoleAssignments.proficientAt, benchmark: jobRoles.benchmark, conceptId: concepts.id, pKnown: learnerConcept.pKnown })
      .from(memberRoleAssignments)
      .innerJoin(member, and(eq(member.userId, memberRoleAssignments.userId), eq(member.organizationId, memberRoleAssignments.orgId)))
      .innerJoin(jobRoles, and(eq(jobRoles.id, memberRoleAssignments.jobRoleId), eq(jobRoles.orgId, memberRoleAssignments.orgId), eq(jobRoles.status, 'active')))
      .leftJoin(topics, and(eq(topics.jobRoleId, jobRoles.id), eq(topics.status, 'ready')))
      .leftJoin(concepts, eq(concepts.topicId, topics.id))
      .leftJoin(learnerConcept, and(eq(learnerConcept.conceptId, concepts.id), eq(learnerConcept.learnerId, memberRoleAssignments.userId)))
      .where(eq(memberRoleAssignments.orgId, orgId)),
    db.selectDistinct({ userId: attempts.learnerId, itemId: attempts.itemId })
      .from(attempts)
      .innerJoin(concepts, and(eq(concepts.id, attempts.conceptId), eq(concepts.critical, true)))
      .innerJoin(topics, and(eq(topics.id, concepts.topicId), eq(topics.status, 'ready')))
      .innerJoin(memberRoleAssignments, and(eq(memberRoleAssignments.userId, attempts.learnerId), eq(memberRoleAssignments.jobRoleId, topics.jobRoleId)))
      .where(and(eq(memberRoleAssignments.orgId, orgId), eq(attempts.correct, false), eq(attempts.confidence, 'sure'), lte(attempts.at, now), notExists(
        db.select({ id: correction.id }).from(correction).where(and(
          eq(correction.learnerId, attempts.learnerId), eq(correction.itemId, attempts.itemId), eq(correction.correct, true), lte(correction.at, now),
          or(gt(correction.at, attempts.at), and(eq(correction.at, attempts.at), gt(correction.id, attempts.id))),
        )),
      ))),
  ])
  const progress = new Map<string, { assignedAt: number; proficientAt: number | null; conceptCount: number; allKnown: boolean }>()
  for (const row of rows) {
    const current = progress.get(row.userId) ?? { assignedAt: row.assignedAt, proficientAt: row.proficientAt, conceptCount: 0, allKnown: true }
    if (row.conceptId !== null) {
      current.conceptCount++
      current.allKnown &&= (row.pKnown ?? 0) >= row.benchmark
    }
    progress.set(row.userId, current)
  }
  const training = new Map<string, Training>()
  for (const [userId, progressRow] of progress) {
    const proficient = progressRow.conceptCount > 0 && progressRow.allKnown
    const reachedAt = progressRow.proficientAt
    training.set(userId, {
      stage: proficient ? 'proficient' : 'onboarding',
      daysToProficiency: proficient && reachedAt !== null && reachedAt >= progressRow.assignedAt && reachedAt <= now ? Math.ceil((reachedAt - progressRow.assignedAt) / 86_400_000) : null,
      criticalConfidentErrors: 0,
    })
  }
  for (const error of errors) {
    const row = training.get(error.userId)
    if (row) row.criticalConfidentErrors++
  }
  return training
}

async function insertRole(orgId: string, data: z.input<typeof Role>) {
  const db = getDb()
  const id = crypto.randomUUID()
  const createdAt = Date.now()
  // A role and its single draft topic must be stored together.
  await db.batch([
    db.insert(jobRoles).values({ id, orgId, ...data, createdAt }),
    db.insert(topics).values({ id: crypto.randomUUID(), jobRoleId: id, title: data.name, status: 'draft', createdAt }),
  ])
  return { id }
}

export const createCompany = createServerFn({ method: 'POST' })
  .validator(z.object({ name: z.string().trim().min(2).max(80), roleName: Role.shape.name }))
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
    return insertRole(org.id, role)
  })

export const getOrgOverview = createServerFn({ method: 'GET' })
  .validator(Slug)
  .handler(async ({ data }) => {
    const { org, readOnly } = await requireOrgReader(data.slug)
    const [roles, progress] = await Promise.all([rolesOf(org.id), trainingOf(org.id)])
    const proficient = [...progress.values()].filter((row) => row.stage === 'proficient')
    const days = proficient.flatMap((row) => row.daysToProficiency === null ? [] : [row.daysToProficiency])
    return { name: org.name, slug: org.slug, roles, readOnly, training: { proficientEmployees: proficient.length, daysToProficiency: days.length ? Math.ceil(mean(days)) : null } }
  })

export const getPeople = createServerFn({ method: 'GET' })
  .validator(Slug)
  .handler(async ({ data }) => {
    const { org, readOnly } = await requireOrgReader(data.slug)
    const db = getDb()
    const [roles, members, invites, training] = await Promise.all([
      rolesOf(org.id),
      db
        .select({ id: member.id, userId: member.userId, name: user.name, email: user.email, role: member.role, jobRole: jobRoles.name })
        .from(member)
        .innerJoin(user, eq(user.id, member.userId))
        .leftJoin(memberRoleAssignments, and(eq(memberRoleAssignments.userId, member.userId), eq(memberRoleAssignments.orgId, member.organizationId)))
        .leftJoin(jobRoles, eq(jobRoles.id, memberRoleAssignments.jobRoleId))
        .where(eq(member.organizationId, org.id))
        .orderBy(asc(member.createdAt)),
      readOnly ? [] : db
        .select({ id: invitation.id, name: invitation.inviteeName, email: invitation.email, jobRole: jobRoles.name, expiresAt: invitation.expiresAt })
        .from(invitation)
        .leftJoin(jobRoles, eq(jobRoles.id, invitation.jobRoleId))
        .where(and(eq(invitation.organizationId, org.id), eq(invitation.status, 'pending')))
        .orderBy(desc(invitation.createdAt)),
      trainingOf(org.id),
    ])
    return { id: org.id, name: org.name, slug: org.slug, baseUrl: getEnv().BETTER_AUTH_URL, roles, members: members.map(({ userId, ...row }) => ({ ...row, training: training.get(userId) ?? null })), readOnly, invites: invites.map((i) => ({ ...i, expired: i.expiresAt.getTime() < Date.now() })) }
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
