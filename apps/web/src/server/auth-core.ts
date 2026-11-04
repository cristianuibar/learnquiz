import { betterAuth } from 'better-auth'
import { drizzleAdapter } from '@better-auth/drizzle-adapter'
import { APIError, createAuthMiddleware, getOAuthState } from 'better-auth/api'
import { deleteSessionCookie } from 'better-auth/cookies'
import { admin, anonymous, bearer, organization } from 'better-auth/plugins'
import type { BetterAuthPlugin } from 'better-auth'
import { and, eq, inArray } from 'drizzle-orm'
import { getDb, authSchema } from '@/db'
import { attempts, badges, itemFlags, jobRoles, learnerConcept, learnerItem, learnerTopic, learnerUnit, memberRoleAssignments, modelCalls, placements, sessions, topics } from '@/db/schema'
import { getEnv } from '@/server/env'
import { bindMobileFacebookSession } from './mobile-facebook-binding'

export function facebookEnabled(): boolean {
  const { FACEBOOK_APP_ID, FACEBOOK_APP_SECRET } = getEnv()
  return Boolean(FACEBOOK_APP_ID && FACEBOOK_APP_SECRET)
}

// Tables keyed by learner_id. The guest user row is deleted after linking, so its data must move to the new user first. A new table keyed by learner_id must be added here.
const LEARNER_TABLES = [topics, learnerTopic, learnerUnit, learnerConcept, learnerItem, attempts, placements, sessions, modelCalls, badges]

async function moveGuestData(guestId: string, userId: string) {
  const db = getDb()
  const owned = db.select({ badge: badges.badge }).from(badges).where(eq(badges.learnerId, userId))
  await db.batch([
    // The account may already hold a badge the guest earned too; keep the existing one.
    db.delete(badges).where(and(eq(badges.learnerId, guestId), inArray(badges.badge, owned))),
    ...LEARNER_TABLES.map((t) => db.update(t).set({ learnerId: userId }).where(eq(t.learnerId, guestId))),
    db.update(itemFlags).set({ userId }).where(eq(itemFlags.userId, guestId)),
  ])
}

// The app and API live on app.learnquiz.com; the apex learnquiz.com serves the marketing site.
export const APP_ORIGINS = ['https://app.learnquiz.com']

// Share the session cookie across learnquiz.com and its subdomains, so a sign-in on the apex carries over to the app host.
function isLearnquizHost(url: string): boolean {
  const host = new URL(url).hostname
  return host === 'learnquiz.com' || host.endsWith('.learnquiz.com')
}

// A company member asks their company's admin to lift a ban. Personal users keep the library text until a support address exists.
async function bannedUserMessage(userId: string): Promise<string> {
  const { member, organization } = authSchema
  const companies = await getDb()
    .select({ name: organization.name })
    .from(member)
    .innerJoin(organization, eq(member.organizationId, organization.id))
    .where(eq(member.userId, userId))
    .orderBy(organization.name)
  if (!companies.length) return 'You have been banned from this application. Please contact support if you believe this is an error.'
  const names = new Intl.ListFormat('en', { type: 'disjunction' }).format(companies.map((c) => c.name))
  return `Your account has been suspended. To get access back, contact your company admin at ${names}.`
}

const PEOPLE_ENDPOINTS = ['/organization/list-members', '/organization/list-invitations', '/organization/get-full-organization']

// Per call: Cloudflare bindings are only valid inside a request.
export function createAuth(transportPlugins: BetterAuthPlugin[] = []) {
  const env = getEnv()
  return betterAuth({
    database: drizzleAdapter(getDb(), { provider: 'sqlite', schema: authSchema }),
    baseURL: env.BETTER_AUTH_URL,
    secret: env.BETTER_AUTH_SECRET,
    trustedOrigins: [...new Set([env.BETTER_AUTH_URL, ...APP_ORIGINS])],
    advanced: isLearnquizHost(env.BETTER_AUTH_URL) ? { crossSubDomainCookies: { enabled: true, domain: 'learnquiz.com' } } : {},
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
      after: createAuthMiddleware(async (ctx) => {
        if (ctx.path !== '/callback/:id' || ctx.params?.id !== 'facebook' || !ctx.context.newSession) return
        const state = await getOAuthState()
        if (!state?.callbackURL) return
        // Only mobile handoffs clear browser cookies; ordinary web sign-in keeps them.
        if (await bindMobileFacebookSession(state.callbackURL, ctx.context.newSession.session.token)) deleteSessionCookie(ctx)
      }),
    },
    plugins: [
      anonymous({ onLinkAccount: ({ anonymousUser, newUser }) => moveGuestData(anonymousUser.user.id, newUser.user.id) }),
      admin({ bannedUserMessage: (user) => bannedUserMessage(user.id) }),
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
      // Native clients send the session token as Authorization: Bearer; sign-in and sign-up return it in set-auth-token.
      bearer(),
      ...transportPlugins, // Cookie transport must stay last when present.
    ],
  })
}
