import { createDecipheriv, createECDH, generateKeyPairSync, hkdfSync, randomBytes, verify } from 'node:crypto'
import { readFileSync, readdirSync } from 'node:fs'
import { DatabaseSync } from 'node:sqlite'
import { drizzle } from 'drizzle-orm/sqlite-proxy'
import { setResponseStatus } from '@tanstack/react-start/server'
import { afterAll, afterEach, beforeAll, beforeEach, expect, it, vi } from 'vitest'
import type { z } from 'zod'
import { getSessionUser } from '@/server/session'

const holder = vi.hoisted(() => ({ db: null as unknown, env: {} as Record<string, string> }))
// Fake only transport, request authentication, Worker bindings, and external HTTP.
// Validation, authorization, SQL, VAPID signing and encryption all run for real.
vi.mock('@tanstack/react-start', () => ({
  createServerFn: () => ({
    handler: (fn: () => unknown) => fn,
    validator: (schema: z.ZodType) => ({ handler: (fn: (input: { data: unknown }) => unknown) => async (input: { data: unknown }) => fn({ data: schema.parse(input.data) }) }),
  }),
}))
vi.mock('@tanstack/react-start/server', () => ({ setResponseStatus: vi.fn() }))
vi.mock('@/db', () => ({ getDb: () => holder.db }))
vi.mock('@/server/env', () => ({ getEnv: () => holder.env }))
vi.mock('@/server/session', () => ({ getSessionUser: vi.fn() }))

import { getPushSettings, sendTestPush, subscribe, unsubscribe } from './index'

const staff = { id: 'staff', role: 'admin', isAnonymous: false, banned: false }
const learner = { ...staff, id: 'learner', role: 'user' }
const receiver = createECDH('prime256v1')
receiver.generateKeys()
const auth = randomBytes(16)
const keys = { p256dh: receiver.getPublicKey().toString('base64url'), auth: auth.toString('base64url') }
const endpoint = 'https://fcm.googleapis.com/fcm/send/test-device'
const vapidPair = generateKeyPairSync('ec', { namedCurve: 'prime256v1' })
const vapidJwk = vapidPair.privateKey.export({ format: 'jwk' })
const vapidEnv = {
  VAPID_PUBLIC_KEY: Buffer.concat([Buffer.from([4]), Buffer.from(vapidJwk.x!, 'base64url'), Buffer.from(vapidJwk.y!, 'base64url')]).toString('base64url'),
  VAPID_PRIVATE_KEY: vapidJwk.d!, VAPID_SUBJECT: 'mailto:push@example.test',
}
let raw: DatabaseSync
const http = vi.fn<typeof fetch>()
const rows = (sql: string) => raw.prepare(sql).all()

beforeAll(() => {
  raw = new DatabaseSync(':memory:')
  raw.exec('PRAGMA foreign_keys = ON')
  for (const file of readdirSync('drizzle').filter((f) => f.endsWith('.sql')).sort()) {
    raw.exec(readFileSync(`drizzle/${file}`, 'utf8').replaceAll('--> statement-breakpoint', ''))
  }
  for (const id of ['staff', 'learner']) raw.prepare('INSERT INTO user (id, name, email) VALUES (?, ?, ?)').run(id, id, `${id}@example.test`)
  const run = (sql: string, params: unknown[], method: string) => {
    const stmt = raw.prepare(sql)
    stmt.setReturnArrays(true)
    const args = params as (string | number | null)[]
    if (method === 'run') { stmt.run(...args); return { rows: [] } }
    return { rows: (method === 'get' ? stmt.get(...args) : stmt.all(...args)) as never }
  }
  holder.db = drizzle(async (sql, params, method) => run(sql, params, method), async (batch) => {
    raw.exec('SAVEPOINT d1_batch')
    try {
      const results = batch.map((q) => run(q.sql, q.params, q.method))
      raw.exec('RELEASE d1_batch')
      return results
    } catch (e) {
      raw.exec('ROLLBACK TO d1_batch')
      raw.exec('RELEASE d1_batch')
      throw e
    }
  })
})
beforeEach(() => {
  raw.exec('BEGIN')
  holder.env = { ...vapidEnv }
  vi.mocked(getSessionUser).mockResolvedValue(staff as never)
  vi.mocked(setResponseStatus).mockClear()
  vi.stubGlobal('fetch', http)
  http.mockReset().mockResolvedValue(new Response(null, { status: 201 }))
  vi.useFakeTimers({ toFake: ['Date'] })
  vi.setSystemTime(new Date('2026-11-02T12:00:00Z'))
})
afterEach(() => { raw.exec('ROLLBACK'); vi.unstubAllGlobals(); vi.useRealTimers() })
afterAll(() => raw.close())

it('refreshes subscriptions idempotently and scopes subscribe/unsubscribe to the signed-in account', async () => {
  await subscribe({ data: { endpoint, keys } })
  const id = rows('SELECT id FROM push_subscriptions')[0].id
  const refreshed = { ...keys, auth: randomBytes(16).toString('base64url') }
  await subscribe({ data: { endpoint, keys: refreshed } })
  await subscribe({ data: { endpoint: `${endpoint}-second`, keys } })
  expect(rows('SELECT id, auth FROM push_subscriptions WHERE endpoint = \'https://fcm.googleapis.com/fcm/send/test-device\''))
    .toEqual([{ id, auth: refreshed.auth }])

  vi.mocked(getSessionUser).mockResolvedValue(learner as never)
  await expect(subscribe({ data: { endpoint, keys } })).rejects.toMatchObject({ status: 409 })
  await unsubscribe({ data: { endpoint } })
  expect(rows('SELECT COUNT(*) AS n FROM push_subscriptions')).toEqual([{ n: 2 }])
  expect(rows("SELECT * FROM push_prefs WHERE user_id = 'learner'")).toEqual([])

  vi.mocked(getSessionUser).mockResolvedValue(staff as never)
  await unsubscribe({ data: { endpoint } })
  expect(rows('SELECT endpoint FROM push_subscriptions')).toEqual([{ endpoint: `${endpoint}-second` }])
  expect(rows('SELECT enabled FROM push_prefs')).toEqual([{ enabled: 1 }])
  await unsubscribe({ data: { endpoint: `${endpoint}-second` } })
  await unsubscribe({ data: { endpoint: `${endpoint}-second` } })
  expect(rows('SELECT * FROM push_subscriptions')).toEqual([])
  expect(rows('SELECT enabled FROM push_prefs')).toEqual([{ enabled: 0 }])
})

it('refuses unauthenticated, guest and banned accounts and restricts test delivery to staff and their own subscription', async () => {
  for (const [user, status] of [[null, 401], [{ ...learner, isAnonymous: true }, 403], [{ ...learner, banned: true }, 403]] as const) {
    vi.mocked(getSessionUser).mockResolvedValue(user as never)
    await expect(subscribe({ data: { endpoint, keys } })).rejects.toMatchObject({ status })
    await expect(unsubscribe({ data: { endpoint } })).rejects.toMatchObject({ status })
    await expect(getPushSettings()).rejects.toMatchObject({ status })
  }
  vi.mocked(getSessionUser).mockResolvedValue(learner as never)
  await subscribe({ data: { endpoint, keys } })
  await expect(sendTestPush({ data: { endpoint } })).rejects.toMatchObject({ status: 403 })
  expect(setResponseStatus).toHaveBeenLastCalledWith(403)
  vi.mocked(getSessionUser).mockResolvedValue(staff as never)
  await expect(sendTestPush({ data: { endpoint } })).rejects.toMatchObject({ status: 404 })
  expect(http).not.toHaveBeenCalled()
  expect(rows('SELECT * FROM push_log')).toEqual([])
})

it('validates push destinations and key material before storing or sending anything', async () => {
  for (const invalidEndpoint of ['not a URL', 'http://fcm.googleapis.com/send', 'https://127.0.0.1/send', 'https://fcm.googleapis.com.attacker.test/send', 'https://name:password@fcm.googleapis.com/send', 'https://fcm.googleapis.com:444/send']) {
    await expect(subscribe({ data: { endpoint: invalidEndpoint, keys } })).rejects.toThrow('Unsupported push service')
  }
  await expect(subscribe({ data: { endpoint, keys: { ...keys, p256dh: Buffer.concat([Buffer.from([4]), Buffer.alloc(64)]).toString('base64url') } } })).rejects.toMatchObject({ status: 400 })
  await expect(subscribe({ data: { endpoint, keys: { ...keys, p256dh: 'not a key' } } })).rejects.toThrow('Invalid public key')
  await expect(subscribe({ data: { endpoint, keys: { ...keys, auth: 'too-short' } } })).rejects.toThrow()
  holder.env = {}
  expect(await getPushSettings()).toEqual({ publicKey: null, isStaff: true, endpoints: [] })
  await expect(subscribe({ data: { endpoint, keys } })).rejects.toMatchObject({ status: 503 })
  expect(rows('SELECT * FROM push_subscriptions')).toEqual([])
  expect(http).not.toHaveBeenCalled()
})

it('sends a verifiable VAPID JWT and a payload independently decryptable by the subscribed browser', async () => {
  await subscribe({ data: { endpoint, keys } })
  expect(await getPushSettings()).toEqual({ publicKey: vapidEnv.VAPID_PUBLIC_KEY, isStaff: true, endpoints: [endpoint] })
  await expect(sendTestPush({ data: { endpoint } })).resolves.toEqual({ sent: true })
  expect(http).toHaveBeenCalledTimes(1)
  const [destination, init] = http.mock.calls[0]
  expect(destination).toBe(endpoint)
  expect(init).toMatchObject({ method: 'POST', redirect: 'error', headers: { 'Content-Encoding': 'aes128gcm', 'Content-Type': 'application/octet-stream', TTL: '300' } })
  const authorization = new Headers(init!.headers).get('Authorization')!
  const [, jwt, publicKey] = /^vapid t=([^,]+), k=(.+)$/.exec(authorization)!
  expect(publicKey).toBe(vapidEnv.VAPID_PUBLIC_KEY)
  const [header, claims, signature] = jwt.split('.')
  expect(JSON.parse(Buffer.from(header, 'base64url').toString())).toEqual({ alg: 'ES256', typ: 'JWT' })
  expect(JSON.parse(Buffer.from(claims, 'base64url').toString())).toEqual({ aud: 'https://fcm.googleapis.com', exp: 1793664000, sub: vapidEnv.VAPID_SUBJECT })
  expect(verify('sha256', Buffer.from(`${header}.${claims}`), { key: vapidPair.publicKey, dsaEncoding: 'ieee-p1363' }, Buffer.from(signature, 'base64url'))).toBe(true)

  // Independent receiver: Node crypto, not the sender's WebCrypto or helpers.
  const encrypted = Buffer.from(init!.body as Uint8Array)
  expect(encrypted.readUInt32BE(16)).toBe(4096)
  expect(encrypted[20]).toBe(65)
  const serverKey = encrypted.subarray(21, 86)
  const shared = receiver.computeSecret(serverKey)
  const ikm = Buffer.from(hkdfSync('sha256', shared, auth, Buffer.concat([Buffer.from('WebPush: info\0'), receiver.getPublicKey(), serverKey]), 32))
  const salt = encrypted.subarray(0, 16)
  const cek = hkdfSync('sha256', ikm, salt, Buffer.from('Content-Encoding: aes128gcm\0'), 16)
  const nonce = hkdfSync('sha256', ikm, salt, Buffer.from('Content-Encoding: nonce\0'), 12)
  const decipher = createDecipheriv('aes-128-gcm', Buffer.from(cek), Buffer.from(nonce))
  decipher.setAuthTag(encrypted.subarray(-16))
  const plaintext = Buffer.concat([decipher.update(encrypted.subarray(86, -16)), decipher.final()])
  expect(plaintext[plaintext.length - 1]).toBe(2)
  expect(JSON.parse(plaintext.subarray(0, -1).toString())).toEqual({ title: 'Learn Quiz', body: 'Your test notification arrived. You’re ready to learn.', url: '/me' })
  expect(rows('SELECT outcome, http_status FROM push_log')).toEqual([{ outcome: 'accepted', http_status: 201 }])
})

it.each([
  { status: 410, outcome: 'gone', remaining: 0, errorStatus: 410 },
  { status: 404, outcome: 'gone', remaining: 0, errorStatus: 410 },
  { status: 503, outcome: 'failed', remaining: 1, errorStatus: 502 },
  { status: null, outcome: 'failed', remaining: 1, errorStatus: 502 },
])('handles push-service $status with $outcome and preserves the other account', async ({ status, outcome, remaining, errorStatus }) => {
  await subscribe({ data: { endpoint, keys } })
  vi.mocked(getSessionUser).mockResolvedValue(learner as never)
  await subscribe({ data: { endpoint: `${endpoint}-other-account`, keys } })
  vi.mocked(getSessionUser).mockResolvedValue(staff as never)
  if (status === null) http.mockRejectedValueOnce(new Error('Network unavailable'))
  else http.mockResolvedValueOnce(new Response(null, { status }))
  await expect(sendTestPush({ data: { endpoint } })).rejects.toMatchObject({ status: errorStatus })
  expect(rows("SELECT COUNT(*) AS n FROM push_subscriptions WHERE user_id = 'staff'")).toEqual([{ n: remaining }])
  expect(rows("SELECT COUNT(*) AS n FROM push_subscriptions WHERE user_id = 'learner'")).toEqual([{ n: 1 }])
  expect(rows('SELECT user_id, outcome, http_status FROM push_log')).toEqual([{ user_id: 'staff', outcome, http_status: status }])
})

it('keeps refreshed subscription keys when an in-flight push returns 410', async () => {
  await subscribe({ data: { endpoint, keys } })
  const refreshed = { ...keys, auth: randomBytes(16).toString('base64url') }
  http.mockImplementationOnce(async () => {
    await subscribe({ data: { endpoint, keys: refreshed } })
    return new Response(null, { status: 410 })
  })
  await expect(sendTestPush({ data: { endpoint } })).rejects.toMatchObject({ status: 410 })
  expect(rows('SELECT auth FROM push_subscriptions')).toEqual([{ auth: refreshed.auth }])
})
