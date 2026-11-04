import { and, eq, gt } from 'drizzle-orm'
import { MOBILE_AUTH_REDIRECT } from '@learnquiz/api/mobile-auth'
import { getDb } from '@/db'
import { verification } from '@/db/auth-schema'
import { createAuth, facebookEnabled } from './auth-core'
import { getEnv } from './env'

const PREFIX = '/api/v1/auth'
const FLOW_MS = 5 * 60_000
const CODE_MS = 60_000
const secret = () => Array.from(crypto.getRandomValues(new Uint8Array(32)), (n) => n.toString(16).padStart(2, '0')).join('')
const digest = async (value: string) => Array.from(new Uint8Array(await crypto.subtle.digest('SHA-256', new TextEncoder().encode(value))), (n) => n.toString(16).padStart(2, '0')).join('')
const validSecret = (value: unknown): value is string => typeof value === 'string' && /^[a-f0-9]{64}$/.test(value)
const json = (body: unknown, status = 200) => Response.json(body, { status, headers: { 'Cache-Control': 'no-store', 'Referrer-Policy': 'no-referrer' } })
const invalid = () => json({ error: 'This Facebook sign-in has expired. Please try again.' }, 400)
const key = (kind: string, value: string) => `mobile-facebook:${kind}:${value}`
type Flow = { redirectUri: string; proofHash: string; browserHash?: string; oauthState?: string; token?: string }
type Code = Flow & { token: string }

async function save(id: string, value: Flow | Code, expiresAt: number) {
  await getDb().insert(verification).values({ id, identifier: id, value: JSON.stringify(value), expiresAt: new Date(expiresAt) })
}
async function read(id: string) {
  return getDb().select().from(verification).where(and(eq(verification.id, id), gt(verification.expiresAt, new Date()))).get()
}
async function consume(row: typeof verification.$inferSelect) {
  // DELETE RETURNING is atomic on D1: concurrent exchanges cannot both succeed.
  return (await getDb().delete(verification).where(and(eq(verification.id, row.id), eq(verification.value, row.value), gt(verification.expiresAt, new Date()))).returning()).length === 1
}
function cookieName(state: string) { return `lq-facebook-${state}` }
function cookie(state: string, value: string, maxAge: number) {
  const secure = new URL(getEnv().BETTER_AUTH_URL).protocol === 'https:' ? '; Secure' : ''
  return `${cookieName(state)}=${value}; Path=${PREFIX}/facebook; HttpOnly; SameSite=Lax; Max-Age=${maxAge}${secure}`
}
function returnToApp(state: string, result: { code: string } | { error: string }) {
  const target = new URL(MOBILE_AUTH_REDIRECT)
  target.searchParams.set('facebookState', state)
  if ('code' in result) target.searchParams.set('facebookCode', result.code)
  else target.searchParams.set('facebookError', result.error)
  const headers = new Headers({ Location: target.href, 'Set-Cookie': cookie(state, '', 0), 'Cache-Control': 'no-store', 'Referrer-Policy': 'no-referrer' })
  return new Response(null, { status: 302, headers })
}

function oauthError(error: string | null) {
  if (error === 'access_denied' || error === 'user_cancelled') return 'cancelled'
  if (error === 'account_not_linked') return 'not_linked'
  if (error?.toLowerCase() === 'banned_user') return 'banned'
  return 'failed'
}

// Raw HTTP handlers: OAuth needs browser cookies and redirects, rather than a server-function JSON envelope.
export async function handleMobileFacebook(request: Request): Promise<Response> {
  const url = new URL(request.url)
  const path = url.pathname
  if (path === `${PREFIX}/capabilities` && request.method === 'GET') return json({ facebook: facebookEnabled() })
  if (!facebookEnabled()) return json({ error: 'Facebook sign-in is unavailable.' }, 404)
  try {
    if (path === `${PREFIX}/facebook/prepare` && request.method === 'POST') {
      const body = await request.json() as { redirectUri?: unknown }
      if (body?.redirectUri !== MOBILE_AUTH_REDIRECT) return json({ error: 'Invalid redirect.' }, 400)
      // The app receives this proof over HTTPS and keeps it in SecureStore. It is
      // never in a URL; intercepting the custom-scheme code alone is insufficient.
      const state = secret()
      const verifier = secret()
      const expiresAt = Date.now() + FLOW_MS
      await save(key('flow', state), { redirectUri: MOBILE_AUTH_REDIRECT, proofHash: await digest(verifier) }, expiresAt)
      return json({ url: `${new URL(getEnv().BETTER_AUTH_URL).origin}${PREFIX}/facebook/start?state=${state}`, state, verifier, expiresAt })
    }
    if (path === `${PREFIX}/facebook/start` && request.method === 'GET') {
      const state = url.searchParams.get('state')
      if (!validSecret(state)) return returnToApp('invalid', { error: 'expired' })
      const row = await read(key('flow', state))
      if (!row) return returnToApp(state, { error: 'expired' })
      const flow: Flow = JSON.parse(row.value)
      if (flow.browserHash || flow.redirectUri !== MOBILE_AUTH_REDIRECT) return returnToApp(state, { error: 'expired' })
      const browser = secret()
      const callbackURL = `${new URL(getEnv().BETTER_AUTH_URL).origin}${PREFIX}/facebook/callback?state=${state}`
      const response = await createAuth().api.signInSocial({
        body: { provider: 'facebook', callbackURL, errorCallbackURL: `${callbackURL}&failed=1`, disableRedirect: true },
        headers: request.headers, asResponse: true,
      })
      const data = await response.json() as { url?: string }
      if (!response.ok || !data.url) return returnToApp(state, { error: 'failed' })
      const oauthState = new URL(data.url).searchParams.get('state')
      if (!oauthState) return returnToApp(state, { error: 'failed' })
      // Claim the browser and this exact server-minted OAuth leg together.
      // A different /sign-in/social request can copy callbackURL, but not this nonce.
      const claimed = await getDb().update(verification).set({ value: JSON.stringify({ ...flow, browserHash: await digest(browser), oauthState }) })
        .where(and(eq(verification.id, row.id), eq(verification.value, row.value), gt(verification.expiresAt, new Date()))).returning()
      if (!claimed.length) return returnToApp(state, { error: 'expired' })
      const headers = new Headers(response.headers)
      headers.delete('content-type')
      headers.set('Location', data.url)
      headers.set('Cache-Control', 'no-store')
      headers.set('Referrer-Policy', 'no-referrer')
      headers.append('Set-Cookie', cookie(state, browser, FLOW_MS / 1000))
      return new Response(null, { status: 302, headers })
    }
    if (path === `${PREFIX}/facebook/callback` && request.method === 'GET') {
      const state = url.searchParams.get('state')
      if (!validSecret(state)) return returnToApp('invalid', { error: 'expired' })
      const row = await read(key('flow', state))
      if (!row) return returnToApp(state, { error: 'expired' })
      const flow: Flow = JSON.parse(row.value)
      const browser = request.headers.get('cookie')?.split(';').map((part) => part.trim()).find((part) => part.startsWith(`${cookieName(state)}=`))?.slice(cookieName(state).length + 1)
      if (!validSecret(browser) || !flow.browserHash || await digest(browser) !== flow.browserHash || flow.redirectUri !== MOBILE_AUTH_REDIRECT) return returnToApp(state, { error: 'expired' })
      if (!await consume(row)) return returnToApp(state, { error: 'expired' })
      if (url.searchParams.has('failed')) return returnToApp(state, { error: oauthError(url.searchParams.get('error')) })
      if (!flow.token) return returnToApp(state, { error: 'failed' })
      const session = await createAuth().api.getSession({ headers: new Headers({ Authorization: `Bearer ${flow.token}` }), query: { disableCookieCache: true } })
      if (!session || session.user.isAnonymous || session.user.banned) return returnToApp(state, { error: 'failed' })
      const code = secret()
      await save(key('code', await digest(code)), { ...flow, token: session.session.token }, Date.now() + CODE_MS)
      return returnToApp(state, { code })
    }
    if (path === `${PREFIX}/facebook/exchange` && request.method === 'POST') {
      const body = await request.json() as { code?: unknown; verifier?: unknown; redirectUri?: unknown }
      if (body?.redirectUri !== MOBILE_AUTH_REDIRECT) return json({ error: 'Invalid redirect.' }, 400)
      if (!validSecret(body.code) || !validSecret(body.verifier)) return invalid()
      const row = await read(key('code', await digest(body.code)))
      if (!row) return invalid()
      const value: Code = JSON.parse(row.value)
      if (value.redirectUri !== body.redirectUri || value.proofHash !== await digest(body.verifier)) return invalid()
      if (!await consume(row)) return invalid()
      // A revocation, ban or expiry between callback and exchange still wins.
      const session = await createAuth().api.getSession({ headers: new Headers({ Authorization: `Bearer ${value.token}` }), query: { disableCookieCache: true } })
      if (!session || session.user.isAnonymous || session.user.banned) return invalid()
      return json({ token: session.session.token, user: { id: session.user.id } })
    }
    return json({ error: 'Not found' }, 404)
  } catch (error) {
    if (error instanceof SyntaxError) return json({ error: 'Invalid JSON body.' }, 400)
    // Do not log callback URLs, exchange bodies, cookies or session tokens.
    return json({ error: 'Facebook sign-in could not finish. Please try again.' }, 500)
  }
}
