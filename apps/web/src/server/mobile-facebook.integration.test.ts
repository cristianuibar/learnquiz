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

it('completes real Better Auth OAuth with mocked Facebook and exchanges a valid bearer', async () => {
  const fetch = vi.fn(async (input: RequestInfo | URL) => {
    const url = String(input instanceof Request ? input.url : input)
    if (url.startsWith('https://graph.facebook.com/v24.0/oauth/access_token')) return Response.json({ access_token: 'mock-provider-token', token_type: 'bearer', expires_in: 3600 })
    if (url.startsWith('https://graph.facebook.com/debug_token')) return Response.json({ data: { is_valid: true, app_id: 'mock-facebook-app', user_id: 'fb-123' } })
    if (url.startsWith('https://graph.facebook.com/me?')) return Response.json({ id: 'fb-123', name: 'Test Learner', email: 'learner@example.com', picture: { data: { url: 'https://example.com/avatar.png' } } })
    throw new Error('Unexpected provider request')
  })
  vi.stubGlobal('fetch', fetch)
  const call = (path: string, init: RequestInit = {}) => handleMobileFacebook(new Request(`https://app.learnquiz.com/api/v1/auth${path}`, init))
  const post = (body: unknown): RequestInit => ({ method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) })
  const pending = await (await call('/facebook/prepare', post({ redirectUri: MOBILE_AUTH_REDIRECT }))).json() as { state: string; verifier: string }
  const start = await call(`/facebook/start?state=${pending.state}`)
  expect(start.status).toBe(302)
  const provider = new URL(start.headers.get('Location')!)
  expect(provider.hostname).toBe('www.facebook.com')
  expect(provider.searchParams.get('redirect_uri')).toBe('https://app.learnquiz.com/api/auth/callback/facebook')
  const cookies = new Map<string, string>()
  const collect = (response: Response) => {
    for (const header of response.headers.getSetCookie()) {
      const pair = header.split(';')[0]
      cookies.set(pair.slice(0, pair.indexOf('=')), pair)
    }
  }
  const headers = () => ({ Cookie: [...cookies.values()].join('; ') })
  collect(start)
  const oauth = await createAuth().handler(new Request(`https://app.learnquiz.com/api/auth/callback/facebook?code=mock-code&state=${provider.searchParams.get('state')}`, { headers: headers() }))
  expect(oauth.status).toBe(302)
  expect(oauth.headers.get('Location')).toBe(`https://app.learnquiz.com/api/v1/auth/facebook/callback?state=${pending.state}`)
  collect(oauth)
  const callback = await call(`/facebook/callback?state=${pending.state}`, { headers: headers() })
  expect(callback.status).toBe(302)
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
})
