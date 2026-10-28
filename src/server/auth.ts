import { betterAuth } from 'better-auth'
import { drizzleAdapter } from '@better-auth/drizzle-adapter'
import { APIError, createAuthMiddleware } from 'better-auth/api'
import { admin, anonymous, organization } from 'better-auth/plugins'
import { tanstackStartCookies } from 'better-auth/tanstack-start'
import { and, eq, inArray } from 'drizzle-orm'
import { getDb, authSchema } from '@/db'
import { attempts, badges, jobRoles, learnerConcept, learnerItem, learnerTopic, memberRoleAssignments, modelCalls, placements, sessions, topics } from '@/db/schema'
import { getEnv } from '@/server/env'

export function facebookEnabled(): boolean {
  const { FACEBOOK_APP_ID, FACEBOOK_APP_SECRET } = getEnv()
  return Boolean(FACEBOOK_APP_ID && FACEBOOK_APP_SECRET)
}

// Tables keyed by learner_id. The guest user row is deleted after linking, so its data must move to the new user first. A new table keyed by learner_id must be added here.
const LEARNER_TABLES = [topics, learnerTopic, learnerConcept, learnerItem, attempts, placements, sessions, modelCalls, badges]

async function moveGuestData(guestId: string, userId: string) {
  const db = getDb()
  const owned = db.select({ badge: badges.badge }).from(badges).where(eq(badges.learnerId, userId))
  await db.batch([
    // The account may already hold a badge the guest earned too; keep the existing one.
    db.delete(badges).where(and(eq(badges.learnerId, guestId), inArray(badges.badge, owned))),
    ...LEARNER_TABLES.map((t) => db.update(t).set({ learnerId: userId }).where(eq(t.learnerId, guestId))),
  ])
}

const PEOPLE_ENDPOINTS = ['/organization/list-members', '/organization/list-invitations', '/organization/get-full-organization']

// Per call: Cloudflare bindings are only valid inside a request.
export function getAuth() {
  const env = getEnv()
  return betterAuth({
    database: drizzleAdapter(getDb(), { provider: 'sqlite', schema: authSchema }),
    baseURL: env.BETTER_AUTH_URL,
    secret: env.BETTER_AUTH_SECRET,
    trustedOrigins: [env.BETTER_AUTH_URL],
    // shortcut: no email service, so no email verification; add it with invite emails when a provider is chosen.
    emailAndPassword: { enabled: true },
    socialProviders: facebookEnabled()
      ? { facebook: { clientId: env.FACEBOOK_APP_ID!, clientSecret: env.FACEBOOK_APP_SECRET! } }
      : {},
    hooks: {
      // These plugin endpoints let any member read the company's people and the invite ids, which are the join secrets. The app reads them through getPeople (company admins only).
      before: createAuthMiddleware(async (ctx) => {
        if (PEOPLE_ENDPOINTS.includes(ctx.path)) throw new APIError('FORBIDDEN', { message: 'Not available' })
      }),
    },
    plugins: [
      anonymous({ onLinkAccount: ({ anonymousUser, newUser }) => moveGuestData(anonymousUser.user.id, newUser.user.id) }),
      admin(),
      organization({
        allowUserToCreateOrganization: (user) => !user.isAnonymous,
        invitationExpiresIn: 60 * 60 * 24 * 7,
        schema: { invitation: { additionalFields: { jobRoleId: { type: 'string', required: true }, inviteeName: { type: 'string', required: true } } } },
        organizationHooks: {
          // Whoever calls the endpoint, an invitation can only point at a job role of its own company.
          beforeCreateInvitation: async ({ invitation }) => {
            const role = await getDb()
              .select({ id: jobRoles.id })
              .from(jobRoles)
              .where(and(eq(jobRoles.id, invitation.jobRoleId), eq(jobRoles.orgId, invitation.organizationId)))
              .get()
            if (!role) throw new APIError('BAD_REQUEST', { message: 'Pick a job role of this company' })
          },
          afterAcceptInvitation: async ({ invitation, user }) => {
            const row = { userId: user.id, orgId: invitation.organizationId, jobRoleId: invitation.jobRoleId as string, assignedAt: Date.now() }
            await getDb()
              .insert(memberRoleAssignments)
              .values(row)
              .onConflictDoUpdate({ target: [memberRoleAssignments.userId, memberRoleAssignments.orgId], set: { jobRoleId: row.jobRoleId, assignedAt: row.assignedAt } })
          },
        },
      }),
      tanstackStartCookies(), // must stay last
    ],
  })
}
