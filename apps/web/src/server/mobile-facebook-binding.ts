import { and, eq, gt } from 'drizzle-orm'
import { getDb } from '@/db'
import { verification } from '@/db/auth-schema'
import { getEnv } from './env'

// Called only by Better Auth's successful Facebook callback after-hook. The
// callbackURL comes from parsed OAuth state, never this handoff's query/cookies.
export async function bindMobileFacebookSession(callbackURL: string, token: string) {
  const prefix = `${new URL(getEnv().BETTER_AUTH_URL).origin}/api/v1/auth/facebook/callback?state=`
  if (!callbackURL.startsWith(prefix)) return false
  const state = callbackURL.slice(prefix.length)
  if (!/^[a-f0-9]{64}$/.test(state)) return false
  const db = getDb()
  const row = await db.select().from(verification).where(and(eq(verification.id, `mobile-facebook:flow:${state}`), gt(verification.expiresAt, new Date()))).get()
  if (!row) return true
  const flow = JSON.parse(row.value)
  if (!flow.browserHash || flow.token) return true
  await db.update(verification).set({ value: JSON.stringify({ ...flow, token }) })
    .where(and(eq(verification.id, row.id), eq(verification.value, row.value), gt(verification.expiresAt, new Date())))
  return true
}
