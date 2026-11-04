import { and, eq, gt } from 'drizzle-orm'
import { getDb } from '@/db'
import { verification } from '@/db/auth-schema'
import { getEnv } from './env'

// Called only by Better Auth's successful Facebook callback after-hook.
// callbackURL is client-supplied and only locates the flow. Authorization requires
// the server-minted OAuth nonce that /start saved with its browser binding.
export async function bindMobileFacebookSession(callbackURL: string, oauthState: string, token: string) {
  const prefix = `${new URL(getEnv().BETTER_AUTH_URL).origin}/api/v1/auth/facebook/callback?state=`
  if (!callbackURL.startsWith(prefix)) return false
  const state = callbackURL.slice(prefix.length)
  if (!/^[a-f0-9]{64}$/.test(state)) return false
  const db = getDb()
  const row = await db.select().from(verification).where(and(eq(verification.id, `mobile-facebook:flow:${state}`), gt(verification.expiresAt, new Date()))).get()
  if (!row) return false
  const flow = JSON.parse(row.value)
  if (!flow.browserHash || !flow.oauthState || flow.oauthState !== oauthState || flow.token) return false
  const bound = await db.update(verification).set({ value: JSON.stringify({ ...flow, token }) })
    .where(and(eq(verification.id, row.id), eq(verification.value, row.value), gt(verification.expiresAt, new Date()))).returning()
  return bound.length === 1
}
