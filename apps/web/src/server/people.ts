import { createServerFn } from '@tanstack/react-start'
import { and, desc, eq, max } from 'drizzle-orm'
import { z } from 'zod'
import { getDb } from '@/db'
import { invitation, member, user } from '@/db/auth-schema'
import { jobRoles, memberRoleAssignments, sessions, topics } from '@/db/schema'
import { requireOrgReader } from '@/server/authz'
import { getEnv } from '@/server/env'
import { rolesOf, trainingOf } from '@/server/org'

const Slug = z.object({ slug: z.string().min(1).max(100) })

export type Person =
  | { kind: 'member'; userId: string; name: string; email: string; jobRole: string; status: 'active' | 'proficient'; day: number; onboardingDays: number; proficientInDays: number | null; lastActiveAt: number | null; mastery: number; benchmark: number; openCriticalErrors: number }
  | { kind: 'invite'; invitationId: string; name: string; email: string; jobRole: string | null; jobRoleId: string; status: 'invited' | 'expired'; invitedAt: number; expiresAt: number }

export const getPeople = createServerFn({ method: 'GET' })
  .validator(Slug)
  .handler(async ({ data }) => {
    const { org, readOnly } = await requireOrgReader(data.slug)
    const db = getDb()
    const [roles, members, invites, training, active] = await Promise.all([
      rolesOf(org.id),
      db
        .select({ userId: member.userId, name: user.name, email: user.email, jobRole: jobRoles.name, onboardingDays: jobRoles.onboardingDays })
        .from(member)
        .innerJoin(user, eq(user.id, member.userId))
        .innerJoin(memberRoleAssignments, and(eq(memberRoleAssignments.userId, member.userId), eq(memberRoleAssignments.orgId, member.organizationId)))
        .innerJoin(jobRoles, and(eq(jobRoles.id, memberRoleAssignments.jobRoleId), eq(jobRoles.status, 'active')))
        .where(eq(member.organizationId, org.id)),
      readOnly ? [] : db
        .select({ id: invitation.id, name: invitation.inviteeName, email: invitation.email, jobRole: jobRoles.name, jobRoleId: invitation.jobRoleId, createdAt: invitation.createdAt, expiresAt: invitation.expiresAt })
        .from(invitation)
        .leftJoin(jobRoles, eq(jobRoles.id, invitation.jobRoleId))
        .where(and(eq(invitation.organizationId, org.id), eq(invitation.status, 'pending')))
        .orderBy(desc(invitation.createdAt)),
      trainingOf(org.id),
      db.select({ userId: sessions.learnerId, at: max(sessions.startedAt) })
        .from(sessions)
        .innerJoin(topics, eq(topics.id, sessions.topicId))
        .innerJoin(jobRoles, and(eq(jobRoles.id, topics.jobRoleId), eq(jobRoles.orgId, org.id)))
        .groupBy(sessions.learnerId),
    ])
    const lastActive = new Map(active.map((row) => [row.userId, row.at]))
    const now = Date.now()
    const people: Person[] = [
      ...members.flatMap((row): Person[] => {
        const t = training.get(row.userId)
        if (!t) return []
        return [{ kind: 'member', userId: row.userId, name: row.name, email: row.email, jobRole: row.jobRole, status: t.stage === 'proficient' ? 'proficient' : 'active', day: Math.min(row.onboardingDays, Math.floor((now - t.assignedAt) / 86_400_000) + 1), onboardingDays: row.onboardingDays, proficientInDays: t.daysToProficiency, lastActiveAt: lastActive.get(row.userId) ?? null, mastery: t.mastery, benchmark: t.benchmark, openCriticalErrors: t.criticalConfidentErrors }]
      }),
      ...invites.map((i): Person => ({ kind: 'invite', invitationId: i.id, name: i.name, email: i.email, jobRole: i.jobRole, jobRoleId: i.jobRoleId, status: i.expiresAt.getTime() < now ? 'expired' : 'invited', invitedAt: i.createdAt.getTime(), expiresAt: i.expiresAt.getTime() })),
    ].sort((a, b) => a.name.localeCompare(b.name, 'en', { sensitivity: 'base' }))
    return { id: org.id, name: org.name, slug: org.slug, baseUrl: getEnv().BETTER_AUTH_URL, readOnly, roles, people }
  })
