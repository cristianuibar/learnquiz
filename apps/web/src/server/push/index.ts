import { createServerFn } from '@tanstack/react-start'
import { and, eq, isNotNull, notExists, exists, sql } from 'drizzle-orm'
import { z } from 'zod'
import type { PushSchedule } from '@learnquiz/api/schedule'
import { getDb, type Db } from '@/db'
import { attempts, pushPrefs, pushSubscriptions, sessions } from '@/db/schema'
import { requireStaff } from '@/server/authz'
import { getEnv } from '@/server/env'
import { httpError } from '@/server/helpers'
import { getSessionUser } from '@/server/session'
import { decodeKey, importSubscriberKey } from './crypto'
import { previewItem } from './pick'
import { EXPO_TOKEN, sendPush } from './sender'
import { capPolicy, effectiveWindow, pushContext } from './window'

// Subscriber-supplied URLs must never turn this Worker into an arbitrary HTTP client.
const Endpoint = z.string().max(2048).refine((value) => {
  try {
    const url = new URL(value)
    return url.protocol === 'https:' && !url.username && !url.password && !url.port && !url.hash &&
      ['fcm.googleapis.com', 'updates.push.services.mozilla.com', 'web.push.apple.com'].includes(url.hostname)
  } catch {
    return false
  }
}, 'Unsupported push service')
export const ExpoToken = z.string().max(2048).regex(EXPO_TOKEN)
const Timezone = z.string().max(100).refine((value) => {
  try { new Intl.DateTimeFormat('en', { timeZone: value }); return true } catch { return false }
}, 'Choose a valid timezone')
const EndpointInput = z.object({ endpoint: Endpoint })
const SubscriptionInput = EndpointInput.extend({ keys: z.object({
  p256dh: z.string().refine((value) => /^[A-Za-z0-9_-]{87}$/.test(value) && decodeKey(value)[0] === 4, 'Invalid public key'),
  auth: z.string().regex(/^[A-Za-z0-9_-]{22}$/),
}) })

function checkAccount(user: Awaited<ReturnType<typeof getSessionUser>>) {
  if (!user) throw httpError('Sign in first', 401)
  if (user.isAnonymous) throw httpError('Create an account first', 403)
  if (user.banned) throw httpError('Account unavailable', 403)
  return user
}

function vapidConfig() {
  const env = getEnv()
  if (!env.VAPID_PUBLIC_KEY || !env.VAPID_PRIVATE_KEY || !env.VAPID_SUBJECT) throw httpError('Push notifications are not configured', 503)
  return { publicKey: env.VAPID_PUBLIC_KEY, privateKey: env.VAPID_PRIVATE_KEY, subject: env.VAPID_SUBJECT }
}

// New prefs start at the company's hours for company members, else 9-5 in the given timezone.
async function seedWindow(db: Db, userId: string, timezone: string) {
  const { company } = await pushContext(db, userId)
  return company ? effectiveWindow(company, null) : { startMinute: 540, endMinute: 1020, timezone }
}

export const getPushSettings = createServerFn({ method: 'GET' }).handler(async () => {
  const user = checkAccount(await getSessionUser())
  const env = getEnv()
  const db = getDb()
  const now = Date.now()
  const [subscriptions, [prefs], finished, context, preview] = await Promise.all([
    db.select({ endpoint: pushSubscriptions.endpoint }).from(pushSubscriptions).where(eq(pushSubscriptions.userId, user.id)),
    db.select().from(pushPrefs).where(eq(pushPrefs.userId, user.id)),
    db.select({ id: sessions.id }).from(sessions).where(and(eq(sessions.learnerId, user.id), isNotNull(sessions.endedAt),
      exists(db.select().from(attempts).where(eq(attempts.sessionId, sessions.id))))).limit(2),
    pushContext(db, user.id),
    previewItem(db, user.id, now),
  ])
  const schedule: PushSchedule = { window: effectiveWindow(context.company, prefs ?? null), ...capPolicy(context.role, now), preview: preview?.stem ?? null }
  return {
    publicKey: env.VAPID_PUBLIC_KEY && env.VAPID_PRIVATE_KEY && env.VAPID_SUBJECT ? env.VAPID_PUBLIC_KEY : null,
    isStaff: user.role === 'admin', endpoints: subscriptions.map((s) => s.endpoint), canPrompt: finished.length === 1,
    prefs: { paused: prefs?.paused ?? false, startMinute: prefs?.startMinute ?? 540, endMinute: prefs?.endMinute ?? 1020, timezone: prefs?.timezone ?? 'UTC' },
    schedule,
  }
})

export const savePushPreferences = createServerFn({ method: 'POST' }).validator(z.object({
  paused: z.boolean(), startMinute: z.number().int().min(0).max(1439), endMinute: z.number().int().min(1).max(1440),
  timezone: Timezone,
}).refine((data) => data.startMinute < data.endMinute, 'Working hours must end after they start')).handler(async ({ data }) => {
  const user = checkAccount(await getSessionUser())
  const values = { ...data, updatedAt: Date.now() }
  await getDb().insert(pushPrefs).values({ userId: user.id, ...values })
    .onConflictDoUpdate({ target: pushPrefs.userId, set: values })
  return { saved: true }
})

export const subscribe = createServerFn({ method: 'POST' }).validator(SubscriptionInput).handler(async ({ data }) => {
  const user = checkAccount(await getSessionUser())
  vapidConfig()
  try {
    await importSubscriberKey(data.keys.p256dh)
  } catch {
    throw httpError('Invalid subscription public key', 400)
  }
  const db = getDb()
  const now = Date.now()
  const seed = await seedWindow(db, user.id, 'UTC')
  // Unique endpoints prevent duplicate delivery. Only the owner can refresh its keys.
  const [saved] = await db.batch([
    db.insert(pushSubscriptions).values({ id: crypto.randomUUID(), userId: user.id, endpoint: data.endpoint, ...data.keys, createdAt: now })
      .onConflictDoUpdate({ target: pushSubscriptions.endpoint, set: { ...data.keys }, setWhere: eq(pushSubscriptions.userId, user.id) }).returning({ id: pushSubscriptions.id }),
    db.insert(pushPrefs).select(db.select({ userId: pushSubscriptions.userId, enabled: sql<boolean>`1`.as('enabled'),
      paused: sql<boolean>`0`.as('paused'), startMinute: sql<number>`${seed.startMinute}`.as('start_minute'), endMinute: sql<number>`${seed.endMinute}`.as('end_minute'),
      timezone: sql<string>`${seed.timezone}`.as('timezone'), updatedAt: sql<number>`${now}`.as('updated_at') })
      .from(pushSubscriptions).where(and(eq(pushSubscriptions.userId, user.id), eq(pushSubscriptions.endpoint, data.endpoint))))
      .onConflictDoUpdate({ target: pushPrefs.userId, set: { enabled: true, updatedAt: now } }),
  ])
  if (!saved.length) throw httpError('This browser is subscribed to another account. Turn off its notifications first.', 409)
  return { subscribed: true }
})

export const subscribeExpo = createServerFn({ method: 'POST' }).validator(z.object({ token: ExpoToken, timezone: Timezone.optional() })).handler(async ({ data }) => {
  const user = checkAccount(await getSessionUser())
  const db = getDb()
  const now = Date.now()
  const seed = await seedWindow(db, user.id, data.timezone ?? 'UTC')
  await db.batch([
    // A shared phone moves to whoever registers last.
    db.insert(pushSubscriptions).values({ id: crypto.randomUUID(), userId: user.id, endpoint: data.token, p256dh: '', auth: '', createdAt: now })
      .onConflictDoUpdate({ target: pushSubscriptions.endpoint, set: { userId: user.id } }),
    db.insert(pushPrefs).values({ userId: user.id, enabled: true, paused: false, startMinute: seed.startMinute, endMinute: seed.endMinute, timezone: seed.timezone, updatedAt: now })
      .onConflictDoUpdate({ target: pushPrefs.userId, set: { enabled: true, updatedAt: now } }),
  ])
  return { subscribed: true }
})

const AnyEndpointInput = z.object({ endpoint: z.union([Endpoint, ExpoToken]) })

export const unsubscribe = createServerFn({ method: 'POST' }).validator(AnyEndpointInput).handler(async ({ data }) => {
  const user = checkAccount(await getSessionUser())
  const db = getDb()
  await db.batch([
    db.delete(pushSubscriptions).where(and(eq(pushSubscriptions.userId, user.id), eq(pushSubscriptions.endpoint, data.endpoint))),
    db.update(pushPrefs).set({ enabled: false, updatedAt: Date.now() }).where(and(eq(pushPrefs.userId, user.id), notExists(db.select().from(pushSubscriptions).where(eq(pushSubscriptions.userId, user.id))))),
  ])
  return { subscribed: false }
})

export const sendTestPush = createServerFn({ method: 'POST' }).validator(AnyEndpointInput).handler(async ({ data }) => {
  const user = checkAccount(await requireStaff())
  const db = getDb()
  const subscription = await db.select({ subscription: pushSubscriptions }).from(pushSubscriptions)
    .innerJoin(pushPrefs, and(eq(pushPrefs.userId, pushSubscriptions.userId), eq(pushPrefs.enabled, true)))
    .where(and(eq(pushSubscriptions.userId, user.id), eq(pushSubscriptions.endpoint, data.endpoint))).get()
  if (!subscription) throw httpError('Enable notifications on this browser first', 404)
  const result = await sendPush(db, subscription.subscription, ExpoToken.safeParse(data.endpoint).success ? null : vapidConfig(), { title: 'Learn Quiz', body: 'Your test notification arrived. You’re ready to learn.', url: '/me' })
  if (result.outcome === 'gone') throw httpError('This subscription expired. Disable notifications, then enable them again.', 410)
  if (result.outcome === 'skipped') throw httpError('Pushes are paused or outside your working hours.', 409)
  if (result.outcome !== 'accepted') throw httpError('The push service could not accept the notification. Try again.', 502)
  return { sent: true }
})
