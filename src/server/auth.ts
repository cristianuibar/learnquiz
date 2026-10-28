import { betterAuth } from 'better-auth'
import { drizzleAdapter } from '@better-auth/drizzle-adapter'
import { anonymous } from 'better-auth/plugins'
import { tanstackStartCookies } from 'better-auth/tanstack-start'
import { getDb, authSchema } from '@/db'
import { getEnv } from '@/server/env'

export function facebookEnabled(): boolean {
  const { FACEBOOK_APP_ID, FACEBOOK_APP_SECRET } = getEnv()
  return Boolean(FACEBOOK_APP_ID && FACEBOOK_APP_SECRET)
}

// Per call: Cloudflare bindings are only valid inside a request.
export function getAuth() {
  const env = getEnv()
  return betterAuth({
    database: drizzleAdapter(getDb(), { provider: 'sqlite', schema: authSchema }),
    baseURL: env.BETTER_AUTH_URL,
    secret: env.BETTER_AUTH_SECRET,
    trustedOrigins: [env.BETTER_AUTH_URL],
    socialProviders: facebookEnabled()
      ? { facebook: { clientId: env.FACEBOOK_APP_ID!, clientSecret: env.FACEBOOK_APP_SECRET! } }
      : {},
    plugins: [anonymous(), tanstackStartCookies()], // tanstackStartCookies must stay last
  })
}
