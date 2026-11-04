import { makeSignature } from 'better-auth/crypto'
import { readFileSync, readdirSync } from 'node:fs'
import { DatabaseSync } from 'node:sqlite'
import { drizzle } from 'drizzle-orm/sqlite-proxy'
import { afterEach, beforeEach, expect, it, vi } from 'vitest'
import { MOBILE_AUTH_REDIRECT } from '@learnquiz/api/mobile-auth'
import { authSchema } from '@/db'
import { createAuth } from './auth-core'
import { handleMobileFacebook } from './mobile-facebook'

const boundary = vi.hoisted(() => ({ db: null as unknown }))
vi.mock('@/db', async (original) => ({ ...await original<typeof import('@/db')>(), getDb: () => boundary.db }))
vi.mock('./env', () => ({ getEnv: () => ({
  BETTER_AUTH_URL: 'https://app.learnquiz.com', BETTER_AUTH_SECRET: 'test-secret-at-least-32-characters-long',
  FACEBOOK_APP_ID: 'mock-facebook-app', FACEBOOK_APP_SECRET: 'mock-facebook-secret',
}) }))
let raw: DatabaseSync
beforeEach(() => {
  raw = new DatabaseSync(':memory:')
  for (const file of readdirSync('drizzle').filter((name) => name.endsWith('.sql')).sort()) {
    raw.exec(readFileSync(`drizzle/${file}`, 'utf8').replaceAll('--> statement-breakpoint', ''))
  }
  boundary.db = drizzle(async (sql, params, method) => {
    const statement = raw.prepare(sql)
    statement.setReturnArrays(true)
    const values = params as (string | number | null)[]
    if (method === 'run') { statement.run(...values); return { rows: [] } }
    return { rows: (method === 'get' ? statement.get(...values) : statement.all(...values)) as unknown[] }
  }, { schema: authSchema })
})
afterEach(() => { raw.close(); vi.unstubAllGlobals() })

const call = (path: string, init: RequestInit = {}) => handleMobileFacebook(new Request(`https://app.learnquiz.com/api/v1/auth${path}`, init))
const post = (body: unknown): RequestInit => ({ method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) })
function browser() {
  const cookies = new Map<string, string>()
  return {
    collect(response: Response) {
      for (const header of response.headers.getSetCookie()) {
        const pair = header.split(';')[0]
        const name = pair.slice(0, pair.indexOf('='))
        if (header.includes('Max-Age=0')) cookies.delete(name)
        else cookies.set(name, pair)
      }
    },
    headers: () => ({ Cookie: [...cookies.values()].join('; ') }),
  }
}
async function start(jar: ReturnType<typeof browser>) {
  const pending = await (await call('/facebook/prepare', post({ redirectUri: MOBILE_AUTH_REDIRECT }))).json() as { state: string; verifier: string }
  const response = await call(`/facebook/start?state=${pending.state}`, { headers: jar.headers() })
  jar.collect(response)
  return { ...pending, response }
}
function mockFacebook(users: Record<string, { id: string; name: string; email: string }> = {
  'mock-code': { id: 'fb-123', name: 'Test Learner', email: 'learner@example.com' },
}) {
  const fetch = vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
    const request = new Request(input, init)
    const url = new URL(request.url)
    if (url.pathname === '/v24.0/oauth/access_token') {
      const code = new URLSearchParams(await request.text()).get('code')!
      expect(users[code]).toBeDefined()
      return Response.json({ access_token: code, token_type: 'bearer', expires_in: 3600 })
    }
    if (url.pathname === '/debug_token') return Response.json({ data: { is_valid: true, app_id: 'mock-facebook-app', user_id: users[url.searchParams.get('input_token')!].id } })
    if (url.pathname === '/me') {
      const user = users[request.headers.get('Authorization')!.slice('Bearer '.length)]
      return Response.json({ ...user, picture: { data: { url: 'https://example.com/avatar.png' } } })
    }
    throw new Error('Unexpected provider request')
  })
  vi.stubGlobal('fetch', fetch)
  return fetch
}
async function successfulOAuth(jar: ReturnType<typeof browser>, unrelatedCookie?: string) {
  const fetch = mockFacebook()
  const pending = await start(jar)
  const provider = new URL(pending.response.headers.get('Location')!)
  expect(provider.hostname).toBe('www.facebook.com')
  expect(provider.searchParams.get('redirect_uri')).toBe('https://app.learnquiz.com/api/auth/callback/facebook')
  const oauth = await createAuth().handler(new Request(`https://app.learnquiz.com/api/auth/callback/facebook?code=mock-code&state=${provider.searchParams.get('state')}`, { headers: jar.headers() }))
  expect(oauth.status).toBe(302)
  expect(oauth.headers.get('Location')).toBe(`https://app.learnquiz.com/api/v1/auth/facebook/callback?state=${pending.state}`)
  jar.collect(oauth)
  // The successful OAuth response itself already expires mobile session cookies.
  expect(oauth.headers.getSetCookie().some((value) => value.startsWith('__Secure-better-auth.session_token=;') && value.includes('Max-Age=0'))).toBe(true)
  const callback = await call(`/facebook/callback?state=${pending.state}`, { headers: { Cookie: [jar.headers().Cookie, unrelatedCookie].filter(Boolean).join('; ') } })
  expect(callback.status).toBe(302)
  jar.collect(callback)
  expect(jar.headers().Cookie).not.toContain('better-auth.session_token')
  expect(callback.headers.getSetCookie().filter((value) => /better-auth\.session_(token|data)=/.test(value))).toEqual([])
  const deepLink = new URL(callback.headers.get('Location')!)
  const exchange = await call('/facebook/exchange', post({ code: deepLink.searchParams.get('facebookCode'), verifier: pending.verifier, redirectUri: MOBILE_AUTH_REDIRECT }))
  expect(exchange.status).toBe(200)
  const result = await exchange.json() as { token: string; user: { id: string } }
  expect(result.token).toBeTruthy()
  expect(callback.headers.get('Location')).not.toContain(result.token)
  const session = await createAuth().api.getSession({ headers: new Headers({ Authorization: `Bearer ${result.token}` }) })
  expect(session?.user.email).toBe('learner@example.com')
  expect(session?.user.id).toBe(result.user.id)
  expect(fetch).toHaveBeenCalledTimes(3)
  const signature = await makeSignature(result.token, 'test-secret-at-least-32-characters-long')
  const oldCookie = `__Secure-better-auth.session_token=${encodeURIComponent(`${result.token}.${signature}`)}`
  expect((await createAuth().api.getSession({ headers: new Headers({ Cookie: oldCookie }) }))?.session.token).toBe(result.token)
  return { ...result, oldCookie }
}

it('completes real Better Auth OAuth and clears browser cookies while preserving the app bearer', async () => {
  await successfulOAuth(browser())
})

it.each([false, true])('rejects an attacker OAuth leg naming the victim callback (forged additionalData: %s), then hands off the victim account', async (forgeNonce) => {
  mockFacebook({
    attacker: { id: 'fb-attacker', name: 'Attacker', email: 'attacker@example.com' },
    victim: { id: 'fb-victim', name: 'Victim', email: 'victim@example.com' },
  })
  const victim = browser()
  const pending = await start(victim)
  const victimProvider = new URL(pending.response.headers.get('Location')!)
  const callbackURL = `https://app.learnquiz.com/api/v1/auth/facebook/callback?state=${pending.state}`
  // This public endpoint accepts a trusted-origin callbackURL without cookies.
  const attacker = browser()
  const signIn = await createAuth().handler(new Request('https://app.learnquiz.com/api/auth/sign-in/social', post({
    provider: 'facebook', callbackURL, disableRedirect: true,
    ...(forgeNonce ? { additionalData: { oauthState: victimProvider.searchParams.get('state') } } : {}),
  })))
  expect(signIn.status).toBe(200)
  attacker.collect(signIn)
  const attackerProvider = new URL((await signIn.json() as { url: string }).url)
  expect(attackerProvider.searchParams.get('state')).not.toBe(victimProvider.searchParams.get('state'))
  const finish = (provider: URL, code: string, jar: ReturnType<typeof browser>) => createAuth().handler(new Request(
    `https://app.learnquiz.com/api/auth/callback/facebook?code=${code}&state=${provider.searchParams.get('state')}`,
    { headers: jar.headers() },
  ))
  const attackerOAuth = await finish(attackerProvider, 'attacker', attacker)
  expect(attackerOAuth.status).toBe(302)
  expect(attackerOAuth.headers.get('Location')).toBe(callbackURL)
  attacker.collect(attackerOAuth)
  const flow = () => JSON.parse((raw.prepare('SELECT value FROM verification WHERE id = ?').get(`mobile-facebook:flow:${pending.state}`) as { value: string }).value)
  expect(flow().token).toBeUndefined()
  expect((await createAuth().api.getSession({ headers: new Headers(attacker.headers()) }))?.user.email).toBe('attacker@example.com')

  const victimOAuth = await finish(victimProvider, 'victim', victim)
  expect(victimOAuth.status).toBe(302)
  expect(victimOAuth.headers.get('Location')).toBe(callbackURL)
  expect(flow().token).toBeTruthy()
  victim.collect(victimOAuth)
  const callback = await call(`/facebook/callback?state=${pending.state}`, { headers: victim.headers() })
  const link = new URL(callback.headers.get('Location')!)
  expect(link.searchParams.get('facebookError')).toBeNull()
  const exchange = await call('/facebook/exchange', post({ code: link.searchParams.get('facebookCode'), verifier: pending.verifier, redirectUri: MOBILE_AUTH_REDIRECT }))
  expect(exchange.status).toBe(200)
  const { token } = await exchange.json() as { token: string }
  expect((await createAuth().api.getSession({ headers: new Headers({ Authorization: `Bearer ${token}` }) }))?.user.email).toBe('victim@example.com')
})

it.each([
  '/facebook/start?state=x', '/facebook/callback?state=x',
  `/facebook/start?state=${'a'.repeat(64)}`, `/facebook/callback?state=${'a'.repeat(64)}`,
  'missing-browser-cookie', 'bad-browser-cookie', 'expired-flow',
])('preserves an existing web session on the unauthenticated error path %s', async (path) => {
  const jar = browser()
  const signup = await createAuth().api.signUpEmail({ body: { email: 'web@example.com', password: 'password123', name: 'Web Learner' }, asResponse: true })
  expect(signup.status).toBe(200)
  jar.collect(signup)
  let headers = jar.headers()
  if (!path.startsWith('/')) {
    const pending = await start(browser())
    if (path === 'expired-flow') raw.prepare('UPDATE verification SET expires_at = 0 WHERE id = ?').run(`mobile-facebook:flow:${pending.state}`)
    if (path === 'bad-browser-cookie') headers = { Cookie: `${headers.Cookie}; lq-facebook-${pending.state}=${'b'.repeat(64)}` }
    path = `/facebook/callback?state=${pending.state}`
  }
  const response = await call(path, { headers: { ...headers, 'Sec-Fetch-Site': 'cross-site' } })
  expect(response.status).toBe(302)
  expect(response.headers.get('Location')).toContain('facebookError=expired')
  expect(response.headers.getSetCookie().filter((value) => /better-auth\.session_(token|data)=/.test(value))).toEqual([])
  jar.collect(response)
  expect((await createAuth().api.getSession({ headers: new Headers(jar.headers()) }))?.user.email).toBe('web@example.com')
})

it('cannot hand off a pre-existing email session without an OAuth leg', async () => {
  const jar = browser()
  const signup = await createAuth().api.signUpEmail({ body: { email: 'victim@example.com', password: 'password123', name: 'Victim' }, asResponse: true })
  expect(signup.status).toBe(200)
  jar.collect(signup)
  expect(jar.headers().Cookie).toContain('better-auth.session_token')
  const fetch = vi.fn(() => { throw new Error('No provider calls allowed') })
  vi.stubGlobal('fetch', fetch)
  const pending = await start(jar)
  const response = await call(`/facebook/callback?state=${pending.state}`, { headers: jar.headers() })
  expect(response.status).toBe(302)
  const link = new URL(response.headers.get('Location')!)
  expect(link.searchParams.get('facebookError')).toBe('failed')
  expect(link.searchParams.has('facebookCode')).toBe(false)
  expect(fetch).not.toHaveBeenCalled()
})

it('cannot hand off the first Facebook session on a second attempt without OAuth, even with its old cookie', async () => {
  const jar = browser()
  const first = await successfulOAuth(jar)
  const pending = await start(jar)
  const fetch = vi.fn(() => { throw new Error('No provider calls allowed') })
  vi.stubGlobal('fetch', fetch)
  // Include a genuinely signed cookie for the first session, even though the
  // fixed return already cleared it. This checks binding independently of cleanup.
  const response = await call(`/facebook/callback?state=${pending.state}`, { headers: { Cookie: `${jar.headers().Cookie}; ${first.oldCookie}` } })
  const link = new URL(response.headers.get('Location')!)
  expect(link.searchParams.get('facebookError')).toBe('failed')
  expect(link.searchParams.has('facebookCode')).toBe(false)
  expect(fetch).not.toHaveBeenCalled()
})


it.each(['not_linked', 'banned'])('maps real Better Auth %s failures to the app', async (kind) => {
  const jar = browser()
  if (kind === 'not_linked') {
    const response = await createAuth().api.signUpEmail({ body: { email: 'learner@example.com', password: 'password123', name: 'Learner' }, asResponse: true })
    expect(response.status).toBe(200)
  } else {
    const user = await successfulOAuth(jar)
    raw.prepare('UPDATE user SET banned = 1 WHERE id = ?').run(user.user.id)
  }
  mockFacebook()
  const pending = await start(jar)
  const provider = new URL(pending.response.headers.get('Location')!)
  const oauth = await createAuth().handler(new Request(`https://app.learnquiz.com/api/auth/callback/facebook?code=mock-code&state=${provider.searchParams.get('state')}`, { headers: jar.headers() }))
  expect(oauth.status).toBe(302)
  const location = oauth.headers.get('Location')!
  expect(location).toContain('failed=1')
  jar.collect(oauth)
  const response = await handleMobileFacebook(new Request(location, { headers: jar.headers() }))
  const link = new URL(response.headers.get('Location')!)
  expect(link.searchParams.get('facebookError')).toBe(kind)
  expect(link.searchParams.has('facebookCode')).toBe(false)
})

it('preserves ordinary web Facebook sign-in with a relative callback', async () => {
  mockFacebook()
  const jar = browser()
  const start = await createAuth().api.signInSocial({ body: { provider: 'facebook', callbackURL: '/today', disableRedirect: true }, asResponse: true })
  jar.collect(start)
  const provider = new URL((await start.json() as { url: string }).url)
  const oauth = await createAuth().handler(new Request(`https://app.learnquiz.com/api/auth/callback/facebook?code=mock-code&state=${provider.searchParams.get('state')}`, { headers: jar.headers() }))
  expect(oauth.status).toBe(302)
  expect(oauth.headers.get('Location')).toBe('/today')
  jar.collect(oauth)
  expect(jar.headers().Cookie).toContain('better-auth.session_token')
  expect((await createAuth().api.getSession({ headers: new Headers(jar.headers()) }))?.user.email).toBe('learner@example.com')
})


it('hands off the OAuth-created session even when the callback carries another email session cookie', async () => {
  const email = await createAuth().api.signUpEmail({ body: { email: 'unrelated@example.com', password: 'password123', name: 'Other Learner' }, asResponse: true })
  expect(email.status).toBe(200)
  const unrelatedCookie = email.headers.getSetCookie().find((value) => value.startsWith('__Secure-better-auth.session_token='))!.split(';')[0]
  await successfulOAuth(browser(), unrelatedCookie)
})
