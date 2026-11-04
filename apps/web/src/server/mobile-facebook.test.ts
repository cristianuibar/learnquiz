import { DatabaseSync } from 'node:sqlite'
import { drizzle } from 'drizzle-orm/sqlite-proxy'
import { afterEach, beforeEach, expect, it, vi } from 'vitest'
import { MOBILE_AUTH_REDIRECT } from '@learnquiz/api/mobile-auth'
import { bindMobileFacebookSession } from './mobile-facebook-binding'
import { handleMobileFacebook } from './mobile-facebook'

const boundary = vi.hoisted(() => ({ db: null as unknown, enabled: true, session: vi.fn(), social: vi.fn() }))
vi.mock('@/db', () => ({ getDb: () => boundary.db }))
vi.mock('./env', () => ({ getEnv: () => ({ BETTER_AUTH_URL: 'https://app.learnquiz.com' }) }))
vi.mock('./auth-core', () => ({
  facebookEnabled: () => boundary.enabled,
  createAuth: () => ({ options: { baseURL: 'https://app.learnquiz.com', advanced: { crossSubDomainCookies: { enabled: true, domain: 'learnquiz.com' } } }, api: { getSession: boundary.session, signInSocial: boundary.social } }),
}))
let raw: DatabaseSync
beforeEach(() => {
  raw = new DatabaseSync(':memory:')
  raw.exec('CREATE TABLE verification (id TEXT PRIMARY KEY, identifier TEXT NOT NULL, value TEXT NOT NULL, expires_at INTEGER NOT NULL, created_at INTEGER DEFAULT 0 NOT NULL, updated_at INTEGER DEFAULT 0 NOT NULL)')
  boundary.db = drizzle(async (sql, params, method) => {
    const statement = raw.prepare(sql)
    statement.setReturnArrays(true)
    const values = params as (string | number | null)[]
    if (method === 'run') { statement.run(...values); return { rows: [] } }
    return { rows: (method === 'get' ? statement.get(...values) : statement.all(...values)) as unknown[] }
  })
  boundary.enabled = true
  boundary.social.mockReset().mockImplementation(async () => Response.json({ url: 'https://www.facebook.com/dialog/oauth?state=provider-state' }, { headers: { 'Set-Cookie': 'oauth-state=bound; HttpOnly' } }))
  boundary.session.mockReset().mockResolvedValue({ session: { token: 'private-bearer' }, user: { id: 'learner-1' } })
})
afterEach(() => { raw.close(); vi.useRealTimers() })
const call = (path: string, body?: unknown, cookie?: string) => handleMobileFacebook(new Request(`https://app.learnquiz.com/api/v1/auth${path}`, {
  method: body === undefined ? 'GET' : 'POST',
  headers: { ...(body === undefined ? {} : { 'Content-Type': 'application/json' }), ...(cookie ? { Cookie: cookie } : {}) },
  body: body === undefined ? undefined : JSON.stringify(body),
}))
async function prepare() {
  return (await call('/facebook/prepare', { redirectUri: MOBILE_AUTH_REDIRECT })).json() as Promise<{ state: string; verifier: string; url: string }>
}
async function browserStart() {
  const pending = await prepare()
  const response = await call(`/facebook/start?state=${pending.state}`)
  const cookie = response.headers.getSetCookie().find((value) => value.startsWith('lq-facebook-'))!.split(';')[0]
  return { ...pending, cookie, response }
}
async function callback() {
  const pending = await browserStart()
  // Simulate the successful OAuth after-hook; /start alone cannot authorize a handoff.
  await bindMobileFacebookSession(`https://app.learnquiz.com/api/v1/auth/facebook/callback?state=${pending.state}`, 'private-bearer')
  const response = await call(`/facebook/callback?state=${pending.state}`, undefined, pending.cookie)
  const url = new URL(response.headers.get('Location')!)
  return { ...pending, code: url.searchParams.get('facebookCode'), response, url }
}
const exchange = (flow: Awaited<ReturnType<typeof callback>>, extra: Record<string, unknown> = {}) => call('/facebook/exchange', {
  code: flow.code, verifier: flow.verifier, redirectUri: MOBILE_AUTH_REDIRECT, ...extra,
})

it('reports the configured capability and prevents starting when disabled', async () => {
  expect(await (await call('/capabilities')).json()).toEqual({ facebook: true })
  boundary.enabled = false
  expect(await (await call('/capabilities')).json()).toEqual({ facebook: false })
  expect((await call('/facebook/prepare', { redirectUri: MOBILE_AUTH_REDIRECT })).status).toBe(404)
})
it('starts Facebook in the browser, preserves OAuth cookies, and returns only an exchange code', async () => {
  const flow = await callback()
  expect(flow.response.status).toBe(302)
  expect(flow.url.protocol).toBe('learnquiz:')
  expect(flow.url.hostname).toBe('sign-in')
  expect(flow.url.searchParams.get('facebookState')).toBe(flow.state)
  expect(flow.code).toMatch(/^[a-f0-9]{64}$/)
  expect(flow.response.headers.get('Location')).not.toContain('private-bearer')
  expect(boundary.social).toHaveBeenCalledWith(expect.objectContaining({ body: {
    provider: 'facebook', disableRedirect: true,
    callbackURL: `https://app.learnquiz.com/api/v1/auth/facebook/callback?state=${flow.state}`,
    errorCallbackURL: `https://app.learnquiz.com/api/v1/auth/facebook/callback?state=${flow.state}&failed=1`,
  } }))
  const result = await exchange(flow)
  expect(result.headers.get('Cache-Control')).toBe('no-store')
  expect(await result.json()).toEqual({ token: 'private-bearer', user: { id: 'learner-1' } })
})
it('keeps provider cookies and binds the callback to this browser, once', async () => {
  const flow = await browserStart()
  expect(flow.response.headers.get('Location')).toMatch(/^https:\/\/www.facebook.com\//)
  expect(flow.response.headers.getSetCookie()).toEqual(expect.arrayContaining([expect.stringContaining('oauth-state=bound'), expect.stringContaining('HttpOnly; SameSite=Lax')]))
  expect((await call(`/facebook/callback?state=${flow.state}`)).headers.get('Location')).toContain('facebookError=expired')
  expect((await call(`/facebook/start?state=${flow.state}`)).headers.get('Location')).toContain('facebookError=expired')
  expect((await call(`/facebook/callback?state=${flow.state}`, undefined, flow.cookie)).status).toBe(302)
  expect((await call(`/facebook/callback?state=${flow.state}`, undefined, flow.cookie)).headers.get('Location')).toContain('facebookError=expired')
})
it('allows exactly one concurrent exchange', async () => {
  const flow = await callback()
  const responses = await Promise.all([exchange(flow), exchange(flow)])
  expect(responses.map((response) => response.status).sort()).toEqual([200, 400])
  expect((await exchange(flow)).status).toBe(400)
})
it.each([59_000, 61_000])('enforces the sixty-second code TTL at %i ms', async (elapsed) => {
  vi.useFakeTimers()
  vi.setSystemTime(new Date('2026-11-04T10:00:00Z'))
  const flow = await callback()
  vi.setSystemTime(Date.now() + elapsed)
  expect((await exchange(flow)).status).toBe(elapsed < 60_000 ? 200 : 400)
})
it.each([299_000, 301_000])('enforces the five-minute flow TTL at %i ms', async (elapsed) => {
  vi.useFakeTimers()
  vi.setSystemTime(new Date('2026-11-04T10:00:00Z'))
  const flow = await browserStart()
  await bindMobileFacebookSession(`https://app.learnquiz.com/api/v1/auth/facebook/callback?state=${flow.state}`, 'private-bearer')
  vi.setSystemTime(Date.now() + elapsed)
  const response = await call(`/facebook/callback?state=${flow.state}`, undefined, flow.cookie)
  const link = new URL(response.headers.get('Location')!)
  expect(link.searchParams.has('facebookCode')).toBe(elapsed < 300_000)
  if (elapsed > 300_000) expect(link.searchParams.get('facebookError')).toBe('expired')
})
it.each(['isAnonymous', 'banned'])('rejects %s users at callback and exchange', async (flag) => {
  const good = await callback()
  boundary.session.mockResolvedValue({ session: { token: 'private-bearer' }, user: { id: 'learner-1', [flag]: true } })
  const blocked = await callback()
  expect(blocked.url.searchParams.get('facebookError')).toBe('failed')
  expect(blocked.code).toBeNull()
  expect((await exchange(good)).status).toBe(400)
})
it('requires an OAuth-created session even with the browser binding cookie', async () => {
  const flow = await browserStart()
  const response = await call(`/facebook/callback?state=${flow.state}`, undefined, flow.cookie)
  expect(response.headers.get('Location')).toContain('facebookError=failed')
  expect(boundary.session).not.toHaveBeenCalled()
})
it.each([
  ['access_denied', 'cancelled'], ['user_cancelled', 'cancelled'],
  ['account_not_linked', 'not_linked'], ['BANNED_USER', 'banned'],
  ['email_not_found', 'failed'], ['private-provider-text', 'failed'],
])('maps OAuth error %s to the allowlisted kind %s', async (error, kind) => {
  const flow = await browserStart()
  const response = await call(`/facebook/callback?state=${flow.state}&failed=1&error=${error}&error_description=secret`, undefined, flow.cookie)
  expect(response.headers.get('Location')).toContain(`facebookError=${kind}`)
  expect(response.headers.get('Location')).not.toContain('secret')
})
it.each(['https://evil.example', 'learnquiz://join/x', 'learnquiz://sign-in/evil', 'learnquiz://sign-in?next=evil'])('rejects a wrong redirect %s at prepare and exchange', async (redirectUri) => {
  expect((await call('/facebook/prepare', { redirectUri })).status).toBe(400)
  const flow = await callback()
  expect((await exchange(flow, { redirectUri })).status).toBe(400)
  expect((await exchange(flow)).status).toBe(200)
})
it('requires the app proof, even if another app intercepts the code', async () => {
  const flow = await callback()
  expect((await exchange(flow, { verifier: 'a'.repeat(64) })).status).toBe(400)
  expect((await exchange(flow)).status).toBe(200)
})
it('returns cancellation without issuing a code or reusing an old browser session', async () => {
  const flow = await browserStart()
  const result = await call(`/facebook/callback?state=${flow.state}&failed=1&error=access_denied`, undefined, flow.cookie)
  expect(result.headers.get('Location')).toContain('facebookError=cancelled')
  expect(result.headers.get('Location')).not.toContain('facebookCode')
  expect(boundary.session).not.toHaveBeenCalled()
})
it('rejects revoked sessions at exchange', async () => {
  const flow = await callback()
  boundary.session.mockResolvedValue(null)
  expect((await exchange(flow)).status).toBe(400)
})

it.each(['/facebook/start?state=bad', '/facebook/callback?state=bad', '/facebook/callback'])('returns malformed state from %s to the app with an error', async (path) => {
  const response = await call(path)
  expect(response.status).toBe(302)
  const link = new URL(response.headers.get('Location')!)
  expect(link.protocol).toBe('learnquiz:')
  expect(link.searchParams.get('facebookError')).toBe('expired')
  expect(link.searchParams.get('facebookState')).toBeTruthy()
  expect(link.searchParams.has('facebookCode')).toBe(false)
})
