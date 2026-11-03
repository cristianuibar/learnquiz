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
vi.mock('@/db', () => ({ getDb: () => holder.db }))
vi.mock('@/server/env', () => ({ getEnv: () => holder.env }))
vi.mock('@/server/session', () => ({ getSessionUser: vi.fn() }))
vi.mock('@tanstack/react-start/server', () => ({ setResponseStatus: vi.fn() }))

import { getPushSettings, savePushPreferences, sendTestPush, subscribe, subscribeExpo, unsubscribe } from './index'
import { sendPush } from './sender'
import { sendDuePushes } from './schedule'
import type { Db } from '@/db'
import type { pushSubscriptions } from '@/db/schema'

const staff = { id: 'staff', role: 'admin', isAnonymous: false, banned: false }
const learner = { ...staff, id: 'learner', role: 'user' }
const receiver = createECDH('prime256v1')
receiver.generateKeys()
const auth = randomBytes(16)
const keys = { p256dh: receiver.getPublicKey().toString('base64url'), auth: auth.toString('base64url') }
const endpoint = 'https://fcm.googleapis.com/fcm/send/test-device'
const preferences = { paused: false, startMinute: 540, endMinute: 1020, timezone: 'UTC' }
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
    await expect(savePushPreferences({ data: preferences })).rejects.toMatchObject({ status })
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
  expect(await getPushSettings()).toMatchObject({ publicKey: null, isStaff: true, endpoints: [], canPrompt: false })
  await expect(subscribe({ data: { endpoint, keys } })).rejects.toMatchObject({ status: 503 })
  expect(rows('SELECT * FROM push_subscriptions')).toEqual([])
  expect(http).not.toHaveBeenCalled()
})

it.each(['/me', '/play/quick/i1'])('sends verifiable VAPID and independently decryptable payloads for %s', async (url) => {
  await subscribe({ data: { endpoint, keys } })
  expect(await getPushSettings()).toMatchObject({ publicKey: vapidEnv.VAPID_PUBLIC_KEY, isStaff: true, endpoints: [endpoint] })
  if (url === '/me') {
    await expect(sendTestPush({ data: { endpoint } })).resolves.toEqual({ sent: true })
  } else {
    const subscription = rows('SELECT id, user_id AS userId, endpoint, p256dh, auth, created_at AS createdAt FROM push_subscriptions')[0] as typeof pushSubscriptions.$inferSelect
    await expect(sendPush(holder.db as Db, subscription, { publicKey: vapidEnv.VAPID_PUBLIC_KEY, privateKey: vapidEnv.VAPID_PRIVATE_KEY, subject: vapidEnv.VAPID_SUBJECT },
      { title: 'Learn Quiz', body: 'Your test notification arrived. You’re ready to learn.', url })).resolves.toEqual({ outcome: 'accepted', status: 201 })
  }
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
  const log = rows('SELECT id, item_id FROM push_log')[0]
  expect(JSON.parse(plaintext.subarray(0, -1).toString())).toEqual({ title: 'Learn Quiz', body: 'Your test notification arrived. You’re ready to learn.',
    url: url === '/me' ? url : `${url}?pushId=${log.id}` })
  expect(log.item_id).toBe(url === '/me' ? null : 'i1')
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

it('stops already-selected pushes when paused, preserves the pause on subscribe, and respects local working hours', async () => {
  await subscribe({ data: { endpoint, keys } })
  const subscription = rows('SELECT id, user_id AS userId, endpoint, p256dh, auth, created_at AS createdAt FROM push_subscriptions')[0] as typeof pushSubscriptions.$inferSelect
  const config = { publicKey: vapidEnv.VAPID_PUBLIC_KEY, privateKey: vapidEnv.VAPID_PRIVATE_KEY, subject: vapidEnv.VAPID_SUBJECT }
  const deliver = () => sendPush(holder.db as Db, subscription, config, { title: 'Learn Quiz', body: 'One question', url: '/play/quick/i1' })
  await savePushPreferences({ data: { ...preferences, paused: true } })
  await subscribe({ data: { endpoint, keys } })
  expect(await deliver()).toEqual({ outcome: 'skipped', status: null })
  expect(http).not.toHaveBeenCalled()
  expect(rows('SELECT * FROM push_log')).toEqual([])

  vi.mocked(getSessionUser).mockResolvedValue(learner as never)
  await savePushPreferences({ data: preferences })
  vi.mocked(getSessionUser).mockResolvedValue(staff as never)
  expect((await getPushSettings()).prefs.paused).toBe(true)
  await savePushPreferences({ data: { ...preferences, timezone: 'America/New_York' } })
  // Noon UTC is 07:00 in New York on this frozen date.
  expect(await deliver()).toEqual({ outcome: 'skipped', status: null })
  vi.setSystemTime(new Date('2026-11-02T14:00:00Z'))
  expect(await deliver()).toEqual({ outcome: 'accepted', status: 201 })
  expect(rows('SELECT item_id, opened_at FROM push_log')).toEqual([{ item_id: 'i1', opened_at: null }])
  vi.setSystemTime(new Date('2026-11-02T22:00:00Z'))
  expect(await deliver()).toEqual({ outcome: 'skipped', status: null })
  expect(http).toHaveBeenCalledTimes(1)
})

it('rejects invalid working hours and timezones without changing saved preferences', async () => {
  await savePushPreferences({ data: preferences })
  for (const invalid of [{ startMinute: 800, endMinute: 700 }, { startMinute: -1 }, { endMinute: 1500 }, { timezone: 'not-a-timezone' }]) {
    await expect(savePushPreferences({ data: { ...preferences, ...invalid } })).rejects.toThrow()
  }
  expect((await getPushSettings()).prefs).toEqual(preferences)
})

const token = 'ExponentPushToken[abc-123_X]'
const expoUrl = 'https://exp.host/--/api/v2/push/send'
const expoSubscription = () => rows('SELECT id, user_id AS userId, endpoint, p256dh, auth, created_at AS createdAt FROM push_subscriptions')[0] as typeof pushSubscriptions.$inferSelect
const expoPayload = { title: 'What is 2 + 2?', body: '', url: '/play/quick/i1' }

it('accepts only Expo tokens in subscribeExpo and never lets web subscribe store one', async () => {
  for (const bad of [endpoint, 'ExponentPushToken[]', 'ExponentPushToken[abc] ', 'ExpoPushToken[abc]']) {
    await expect(subscribeExpo({ data: { token: bad } })).rejects.toThrow()
  }
  await expect(subscribeExpo({ data: { token, timezone: 'not-a-timezone' } })).rejects.toThrow()
  expect(rows('SELECT * FROM push_subscriptions')).toEqual([])
  expect(rows('SELECT * FROM push_prefs')).toEqual([])
  await expect(subscribe({ data: { endpoint: token, keys } })).rejects.toThrow('Unsupported push service')
  expect(rows('SELECT * FROM push_subscriptions')).toEqual([])
})

it('moves an Expo token to the latest account, enables prefs and unsubscribes by token', async () => {
  await subscribeExpo({ data: { token } })
  vi.mocked(getSessionUser).mockResolvedValue(learner as never)
  await subscribeExpo({ data: { token, timezone: 'America/New_York' } })
  expect(rows('SELECT user_id, endpoint, p256dh, auth FROM push_subscriptions')).toEqual([{ user_id: 'learner', endpoint: token, p256dh: '', auth: '' }])
  expect(rows("SELECT enabled, paused, start_minute, end_minute, timezone FROM push_prefs WHERE user_id = 'learner'"))
    .toEqual([{ enabled: 1, paused: 0, start_minute: 540, end_minute: 1020, timezone: 'America/New_York' }])
  await unsubscribe({ data: { endpoint: token } })
  expect(rows('SELECT * FROM push_subscriptions')).toEqual([])
  expect(rows("SELECT enabled FROM push_prefs WHERE user_id = 'learner'")).toEqual([{ enabled: 0 }])
})

it.each([{ ttl: undefined, expected: 300 }, { ttl: 60, expected: 60 }])('sends Expo pushes without VAPID (ttl $ttl)', async ({ ttl, expected }) => {
  holder.env = {}
  await subscribeExpo({ data: { token } })
  http.mockResolvedValueOnce(Response.json({ data: { status: 'ok', id: 'x' } }))
  await expect(sendPush(holder.db as Db, expoSubscription(), null, expoPayload, ttl)).resolves.toEqual({ outcome: 'accepted', status: 200 })
  expect(http).toHaveBeenCalledTimes(1)
  const [destination, init] = http.mock.calls[0]
  expect(destination).toBe(expoUrl)
  expect(init).toMatchObject({ method: 'POST', redirect: 'error', headers: { 'Content-Type': 'application/json', Accept: 'application/json' } })
  expect(init!.signal).toBeInstanceOf(AbortSignal)
  const logId = rows('SELECT id FROM push_log')[0].id
  expect(JSON.parse(init!.body as string)).toEqual({ to: token, title: expoPayload.title, priority: 'high', ttl: expected, channelId: 'questions', data: { url: `/play/quick/i1?pushId=${logId}` } })
  expect(rows('SELECT outcome, http_status FROM push_log')).toEqual([{ outcome: 'accepted', http_status: 200 }])
})

it.each([
  { error: 'DeviceNotRegistered', outcome: 'gone', remaining: 0 },
  { error: 'MessageRateExceeded', outcome: 'failed', remaining: 1 },
])('maps Expo ticket error $error to $outcome', async ({ error, outcome, remaining }) => {
  holder.env = {}
  await subscribeExpo({ data: { token } })
  http.mockResolvedValueOnce(Response.json({ data: { status: 'error', details: { error } } }))
  expect((await sendPush(holder.db as Db, expoSubscription(), null, expoPayload)).outcome).toBe(outcome)
  expect(rows('SELECT outcome, http_status FROM push_log')).toEqual([{ outcome, http_status: 200 }])
  expect(rows('SELECT COUNT(*) AS n FROM push_subscriptions')).toEqual([{ n: remaining }])
})

it('treats non-2xx, malformed and network-failed Expo responses as failed', async () => {
  holder.env = {}
  await subscribeExpo({ data: { token } })
  http.mockResolvedValueOnce(new Response('nope', { status: 500 })).mockResolvedValueOnce(new Response('not json', { status: 200 })).mockRejectedValueOnce(new Error('down'))
  for (const status of [500, 200, null]) expect(await sendPush(holder.db as Db, expoSubscription(), null, expoPayload)).toEqual({ outcome: 'failed', status })
  expect(rows('SELECT COUNT(*) AS n FROM push_subscriptions')).toEqual([{ n: 1 }])
})

it('does not delete a token that moved to another account while the push was in flight', async () => {
  holder.env = {}
  await subscribeExpo({ data: { token } })
  http.mockImplementationOnce(async () => {
    vi.mocked(getSessionUser).mockResolvedValue(learner as never)
    await subscribeExpo({ data: { token } })
    return Response.json({ data: { status: 'error', details: { error: 'DeviceNotRegistered' } } })
  })
  await sendPush(holder.db as Db, expoSubscription(), null, expoPayload)
  expect(rows('SELECT user_id FROM push_subscriptions')).toEqual([{ user_id: 'learner' }])
})

it('sends a staff test push to an Expo token without VAPID configuration', async () => {
  holder.env = {}
  await subscribeExpo({ data: { token } })
  http.mockResolvedValueOnce(Response.json({ data: { status: 'ok' } }))
  await expect(sendTestPush({ data: { endpoint: token } })).resolves.toEqual({ sent: true })
  expect(http.mock.calls[0][0]).toBe(expoUrl)
})

it('reports the personal default schedule, then the company schedule, seeding and clamping prefs for company members', async () => {
  vi.mocked(getSessionUser).mockResolvedValue(learner as never)
  expect((await getPushSettings()).schedule).toEqual({
    window: { startMinute: 540, endMinute: 1020, days: [1, 2, 3, 4, 5], timezone: 'UTC', source: 'default' },
    dailyCap: 3, steadyCap: 3, phase: 'steady', preview: null,
  })

  const now = Date.now()
  raw.prepare('INSERT INTO organization (id, name, slug, created_at) VALUES (?, ?, ?, ?)').run('o1', 'Acme', 'acme', now)
  for (const id of ['learner', 'staff']) raw.prepare('INSERT INTO member (id, organization_id, user_id, role, created_at) VALUES (?, ?, ?, ?, ?)').run(`m-${id}`, 'o1', id, 'member', now)
  raw.prepare('INSERT INTO org_settings (org_id, company_name, timezone, working_hours_json) VALUES (?, ?, ?, ?)')
    .run('o1', 'Acme', 'Europe/Bucharest', JSON.stringify({ days: [1, 2, 3, 4, 5], start: '06:00', end: '18:00' }))
  raw.prepare('INSERT INTO job_roles (id, org_id, name, onboarding_days, status, created_at) VALUES (?, ?, ?, ?, ?, ?)').run('r1', 'o1', 'Barista', 30, 'active', now)
  raw.prepare('INSERT INTO member_role_assignments (user_id, org_id, job_role_id, assigned_at) VALUES (?, ?, ?, ?)').run('learner', 'o1', 'r1', now - 86_400_000)
  raw.prepare('INSERT INTO topics (id, job_role_id, org_id, title, status, created_at) VALUES (?, ?, ?, ?, ?, ?)').run('t1', 'r1', 'o1', 'Barista basics', 'ready', now)
  raw.prepare('INSERT INTO items (id, concept_id, topic_id, format, payload_json, status, created_at) VALUES (?, ?, ?, ?, ?, ?, ?)')
    .run('i-role', 'c1', 't1', 'mcq', JSON.stringify({ format: 'mcq', stem: 'Steam milk to what temperature?' }), 'active', now)
  raw.prepare('INSERT INTO learner_item (learner_id, item_id, due, stability, difficulty, state) VALUES (?, ?, ?, ?, ?, ?)').run('learner', 'i-role', now + 3_600_000, 1, 5, 2)

  const company = { startMinute: 360, endMinute: 1080, days: [1, 2, 3, 4, 5], timezone: 'Europe/Bucharest', source: 'company' }
  expect((await getPushSettings()).schedule).toEqual({ window: company, dailyCap: 6, steadyCap: 3, phase: 'onboarding', preview: 'Steam milk to what temperature?' })

  await subscribeExpo({ data: { token } })
  expect(rows("SELECT start_minute, end_minute, timezone FROM push_prefs WHERE user_id = 'learner'")).toEqual([{ start_minute: 360, end_minute: 1080, timezone: 'Europe/Bucharest' }])
  vi.mocked(getSessionUser).mockResolvedValue(staff as never)
  await subscribe({ data: { endpoint, keys } })
  expect(rows("SELECT start_minute, end_minute, timezone FROM push_prefs WHERE user_id = 'staff'")).toEqual([{ start_minute: 360, end_minute: 1080, timezone: 'Europe/Bucharest' }])

  vi.mocked(getSessionUser).mockResolvedValue(learner as never)
  await savePushPreferences({ data: { paused: false, startMinute: 0, endMinute: 1440, timezone: 'UTC' } })
  expect((await getPushSettings()).schedule.window).toEqual(company)
  await savePushPreferences({ data: { paused: false, startMinute: 540, endMinute: 600, timezone: 'UTC' } })
  expect((await getPushSettings()).schedule.window).toEqual({ ...company, startMinute: 540, endMinute: 600, source: 'learner' })
})

// Scheduled sends: a learner with one web and one Expo device, a personal topic and two due questions.
const MIN = 60_000
const noon = Date.parse('2026-11-02T12:00:00Z')
async function seedLearner({ web = true, expo = true, paused = false, company = false } = {}) {
  vi.mocked(getSessionUser).mockResolvedValue(learner as never)
  if (company) {
    raw.prepare('INSERT INTO organization (id, name, slug, created_at) VALUES (?, ?, ?, ?)').run('o1', 'Acme', 'acme', noon)
    raw.prepare('INSERT INTO member (id, organization_id, user_id, role, created_at) VALUES (?, ?, ?, ?, ?)').run('m1', 'o1', 'learner', 'member', noon)
    raw.prepare('INSERT INTO org_settings (org_id, company_name, timezone, working_hours_json) VALUES (?, ?, ?, ?)')
      .run('o1', 'Acme', 'UTC', JSON.stringify({ days: [1, 2, 3, 4, 5], start: '09:00', end: '17:00' }))
    raw.prepare('INSERT INTO job_roles (id, org_id, name, onboarding_days, status, created_at) VALUES (?, ?, ?, ?, ?, ?)').run('r1', 'o1', 'Barista', 30, 'active', noon)
    raw.prepare('INSERT INTO member_role_assignments (user_id, org_id, job_role_id, assigned_at) VALUES (?, ?, ?, ?)').run('learner', 'o1', 'r1', noon - 86_400_000)
  }
  if (web) await subscribe({ data: { endpoint, keys } })
  if (expo) await subscribeExpo({ data: { token } })
  await savePushPreferences({ data: { ...preferences, paused } })
  raw.prepare('INSERT INTO topics (id, learner_id, title, status, created_at) VALUES (?, ?, ?, ?, ?)').run('t1', 'learner', 'Maths', 'ready', noon)
  for (const [id, stem, due] of [['i-new', 'New stem?', noon - 60 * MIN], ['i-old', 'Old stem?', noon - 5 * 86_400_000]] as const) {
    raw.prepare('INSERT INTO items (id, concept_id, topic_id, format, payload_json, status, created_at) VALUES (?, ?, ?, ?, ?, ?, ?)')
      .run(id, 'c1', 't1', 'mcq', JSON.stringify({ format: 'mcq', stem }), 'active', noon)
    raw.prepare('INSERT INTO learner_item (learner_id, item_id, due, stability, difficulty, state) VALUES (?, ?, ?, ?, ?, ?)').run('learner', id, due, 1, 5, 2)
  }
  http.mockImplementation(async (input) => String(input) === expoUrl ? Response.json({ data: { status: 'ok' } }) : new Response(null, { status: 201 }))
}
// Accepted pushes for distinct items, the last `lastAgo` minutes before the current time, spaced 70 minutes apart.
const seedPushes = (count: number, lastAgo = 70) => {
  for (let i = 0; i < count; i++) {
    raw.prepare('INSERT INTO push_log (id, user_id, subscription_id, outcome, item_id, created_at) VALUES (?, ?, ?, ?, ?, ?)')
      .run(`old-${i}`, 'learner', 'gone-sub', 'accepted', `earlier-${i}`, Date.now() - (lastAgo + (count - 1 - i) * 70) * MIN)
  }
}
const pushLogRows = () => rows("SELECT item_id, outcome FROM push_log WHERE id NOT LIKE 'old-%' ORDER BY subscription_id")

it('sends the most overdue question once to every device of an eligible learner', async () => {
  await seedLearner()
  await expect(sendDuePushes(Date.now(), holder.db as Db)).resolves.toBe(2)
  expect(http.mock.calls.map(([destination]) => String(destination)).sort()).toEqual([endpoint, expoUrl].sort())
  const log = rows("SELECT id, item_id, outcome FROM push_log WHERE item_id = 'i-old' AND outcome = 'accepted'")
  expect(log).toHaveLength(2)
  expect(pushLogRows()).toEqual([{ item_id: 'i-old', outcome: 'accepted' }, { item_id: 'i-old', outcome: 'accepted' }])
  const expoCall = http.mock.calls.find(([destination]) => String(destination) === expoUrl)!
  const body = JSON.parse(expoCall[1]!.body as string)
  expect(body).toMatchObject({ to: token, title: 'Old stem?', ttl: 3600 })
  expect(log.map((r) => `/play/quick/i-old?pushId=${r.id}`)).toContain(body.data.url)
})

it('skips web devices without VAPID config but still sends to Expo', async () => {
  await seedLearner()
  holder.env = {}
  await expect(sendDuePushes(Date.now(), holder.db as Db)).resolves.toBe(1)
  expect(http.mock.calls.map(([destination]) => String(destination))).toEqual([expoUrl])
})

it.each([
  { name: 'steady learner with 2 pushes today', company: false, pushes: 2, sends: 2 },
  { name: 'steady learner at the cap of 3', company: false, pushes: 3, sends: 0 },
  { name: 'onboarding learner past the steady cap', company: true, pushes: 3, sends: 2 },
  { name: 'onboarding learner at the cap of 6', company: true, pushes: 6, sends: 0 },
])('$name', async ({ company, pushes, sends }) => {
  await seedLearner({ company })
  seedPushes(pushes)
  expect(await sendDuePushes(Date.now(), holder.db as Db)).toBe(sends)
  expect(http).toHaveBeenCalledTimes(sends)
  expect(pushLogRows()).toHaveLength(sends)
})

it('counts a push to several devices once and ignores pushes before the local day', async () => {
  await seedLearner()
  seedPushes(2)
  // A second device row for an earlier push, and a push from yesterday.
  raw.prepare('INSERT INTO push_log (id, user_id, subscription_id, outcome, item_id, created_at) VALUES (?, ?, ?, ?, ?, ?)').run('old-dup', 'learner', 'gone-sub-2', 'accepted', 'earlier-0', noon - 300 * MIN)
  raw.prepare('INSERT INTO push_log (id, user_id, subscription_id, outcome, item_id, created_at) VALUES (?, ?, ?, ?, ?, ?)').run('old-yesterday', 'learner', 'gone-sub', 'accepted', 'earlier-y', noon - 20 * 3_600_000)
  expect(await sendDuePushes(Date.now(), holder.db as Db)).toBe(2)
})

it.each([
  { name: 'the last push was 30 minutes ago', prepare: () => seedPushes(1, 30) },
  { name: 'the last push was 59 minutes ago', prepare: () => seedPushes(1, 59) },
  { name: 'there is no subscription', prepare: () => raw.exec('DELETE FROM push_subscriptions') },
  { name: 'pushes are paused', prepare: () => raw.exec('UPDATE push_prefs SET paused = 1') },
  { name: 'pushes are disabled', prepare: () => raw.exec('UPDATE push_prefs SET enabled = 0') },
  { name: 'it is after the window', prepare: () => vi.setSystemTime(new Date('2026-11-02T18:00:00Z')) },
  { name: 'it is before the window', prepare: () => vi.setSystemTime(new Date('2026-11-02T08:00:00Z')) },
  { name: 'it is a non-working day', prepare: () => vi.setSystemTime(new Date('2026-11-07T12:00:00Z')) },
  { name: 'no question is due', prepare: () => raw.exec('UPDATE learner_item SET due = due + 864000000000') },
  { name: 'every due question was pushed in the last 24 hours', prepare: () => {
    for (const id of ['i-new', 'i-old']) raw.prepare('INSERT INTO push_log (id, user_id, subscription_id, outcome, item_id, created_at) VALUES (?, ?, ?, ?, ?, ?)').run(`old-${id}`, 'learner', 'gone-sub', 'accepted', id, noon - 22 * 3_600_000)
  } },
])('sends nothing when $name', async ({ prepare }) => {
  await seedLearner()
  prepare()
  const before = rows('SELECT COUNT(*) AS n FROM push_log')
  expect(await sendDuePushes(Date.now(), holder.db as Db)).toBe(0)
  expect(http).not.toHaveBeenCalled()
  expect(rows('SELECT COUNT(*) AS n FROM push_log')).toEqual(before)
})

it('sends again once the 60-minute gap has passed', async () => {
  await seedLearner()
  seedPushes(1, 61)
  expect(await sendDuePushes(Date.now(), holder.db as Db)).toBe(2)
})

it('keeps going when one learner fails', async () => {
  await seedLearner()
  raw.prepare('INSERT INTO user (id, name, email) VALUES (?, ?, ?)').run('other', 'other', 'other@example.test')
  vi.mocked(getSessionUser).mockResolvedValue({ ...learner, id: 'other' } as never)
  await subscribeExpo({ data: { token: 'ExponentPushToken[other-1]' } })
  raw.prepare('INSERT INTO topics (id, learner_id, title, status, created_at) VALUES (?, ?, ?, ?, ?)').run('t2', 'other', 'Other', 'ready', noon)
  raw.prepare('INSERT INTO items (id, concept_id, topic_id, format, payload_json, status, created_at) VALUES (?, ?, ?, ?, ?, ?, ?)').run('i-other', 'c2', 't2', 'mcq', JSON.stringify({ format: 'mcq', stem: 'Other?' }), 'active', noon)
  raw.prepare('INSERT INTO learner_item (learner_id, item_id, due, stability, difficulty, state) VALUES (?, ?, ?, ?, ?, ?)').run('other', 'i-other', noon - MIN, 1, 5, 2)
  // An unusable stored timezone makes the first learner throw; the other still gets theirs.
  raw.exec("UPDATE push_prefs SET timezone = 'Not/AZone' WHERE user_id = 'learner'")
  expect(await sendDuePushes(Date.now(), holder.db as Db)).toBe(1)
  expect(rows("SELECT user_id, item_id FROM push_log WHERE outcome = 'accepted'")).toEqual([{ user_id: 'other', item_id: 'i-other' }])
})

it.each([
  { at: '2026-11-02T12:00:00Z', ttl: 3600 },
  { at: '2026-11-02T16:00:00Z', ttl: 3600 },
  { at: '2026-11-02T16:30:00Z', ttl: 1800 },
  { at: '2026-11-02T16:59:30Z', ttl: 30 },
])('caps the delivery ttl at the window end: $at gives $ttl seconds', async ({ at, ttl }) => {
  await seedLearner()
  vi.setSystemTime(new Date(at))
  expect(await sendDuePushes(Date.now(), holder.db as Db)).toBe(2)
  const webCall = http.mock.calls.find(([destination]) => String(destination) === endpoint)!
  const expoCall = http.mock.calls.find(([destination]) => String(destination) === expoUrl)!
  expect(new Headers(webCall[1]!.headers).get('TTL')).toBe(String(ttl))
  expect(JSON.parse(expoCall[1]!.body as string).ttl).toBe(ttl)
})

it('measures the local day and window end in the learner timezone', async () => {
  await seedLearner()
  // 14:30Z is 09:30 in New York (UTC-5) and the local day began at 05:00Z; two of the three pushes were yesterday local time.
  await savePushPreferences({ data: { ...preferences, timezone: 'America/New_York' } })
  vi.setSystemTime(new Date('2026-11-02T14:30:00Z'))
  seedPushes(3, 70)
  raw.exec(`UPDATE push_log SET created_at = ${Date.parse('2026-11-02T04:00:00Z')} WHERE id IN ('old-0', 'old-1')`)
  expect(await sendDuePushes(Date.now(), holder.db as Db)).toBe(2)
  expect(JSON.parse(http.mock.calls.find(([d]) => String(d) === expoUrl)![1]!.body as string).ttl).toBe(3600)
})
