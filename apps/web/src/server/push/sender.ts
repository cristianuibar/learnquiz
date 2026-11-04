import { and, eq } from 'drizzle-orm'
import type { Db } from '@/db'
import { pushLog, pushPrefs, pushSubscriptions } from '@/db/schema'
import { encryptPayload, vapidAuthorization, type VapidConfig } from './crypto'
import { effectiveWindow, inWindow, pushContext } from './window'

export const EXPO_TOKEN = /^ExponentPushToken\[[\w-]+\]$/

// Never follow a push-service redirect with subscription material or VAPID authorization. Workers fetch rejects
// redirect: 'error' (a TypeError before any request), so use 'manual': a 3xx comes back as-is and counts as failed.
export async function sendPush(db: Db, subscription: typeof pushSubscriptions.$inferSelect, config: VapidConfig | null, payload: { title: string; body: string; url: string }, ttl = 300) {
  // Check at delivery time as well as selection time so a queued push respects a pause.
  const [prefs] = await db.select().from(pushPrefs).where(eq(pushPrefs.userId, subscription.userId))
  if (!prefs?.enabled || prefs.paused) return { outcome: 'skipped', status: null }
  // A device can move to another account after selection; never send this account's question to it.
  const [current] = await db.select({ id: pushSubscriptions.id }).from(pushSubscriptions).where(and(eq(pushSubscriptions.id, subscription.id),
    eq(pushSubscriptions.userId, subscription.userId), eq(pushSubscriptions.endpoint, subscription.endpoint)))
  if (!current) return { outcome: 'skipped', status: null }
  // The same window the scheduler selects with, so the two cannot disagree.
  if (!inWindow(effectiveWindow((await pushContext(db, subscription.userId)).company, prefs), Date.now())) return { outcome: 'skipped', status: null }
  const id = crypto.randomUUID()
  const url = new URL(payload.url, 'https://learnquiz.invalid')
  const match = /^\/play\/quick\/([^/]+)\/?$/.exec(url.pathname)
  const itemId = match ? decodeURIComponent(match[1]) : null
  if (itemId) url.searchParams.set('pushId', id)
  const notification = { ...payload, url: itemId ? url.pathname + url.search : payload.url }
  const expo = EXPO_TOKEN.test(subscription.endpoint)
  if (!expo && !config) throw new Error('VAPID config required for web push')
  let status: number | null = null
  let outcome: 'accepted' | 'gone' | 'failed' = 'failed'
  try {
    if (expo) {
      // Expo receipts are not fetched; a dead token is dropped when a later ticket reports DeviceNotRegistered.
      const response = await fetch('https://exp.host/--/api/v2/push/send', {
        method: 'POST', redirect: 'manual', signal: AbortSignal.timeout(10_000),
        headers: { 'Content-Type': 'application/json', Accept: 'application/json' },
        body: JSON.stringify({ to: subscription.endpoint, title: payload.title, priority: 'high', ttl, channelId: 'questions', data: { url: notification.url } }),
      })
      status = response.status
      const ticket = (await response.json().catch(() => null) as { data?: { status?: string; details?: { error?: string } } } | null)?.data
      if (ticket?.details?.error === 'DeviceNotRegistered') outcome = 'gone'
      else if (status >= 200 && status < 300 && ticket?.status === 'ok') outcome = 'accepted'
    } else {
      const authorization = await vapidAuthorization(subscription.endpoint, config!)
      const body = await encryptPayload(subscription, JSON.stringify(notification))
      const response = await fetch(subscription.endpoint, {
        method: 'POST', redirect: 'manual', signal: AbortSignal.timeout(10_000),
        headers: { Authorization: authorization, 'Content-Encoding': 'aes128gcm', 'Content-Type': 'application/octet-stream', TTL: String(ttl) },
        body,
      })
      status = response.status
      await response.body?.cancel()
      outcome = status === 404 || status === 410 ? 'gone' : status >= 200 && status < 300 ? 'accepted' : 'failed'
    }
  } catch {
    // Do not store endpoint credentials or provider response bodies in logs.
  }
  const log = db.insert(pushLog).values({ id, userId: subscription.userId, subscriptionId: subscription.id, itemId, outcome, httpStatus: status, createdAt: Date.now() })
  if (outcome === 'gone') {
    await db.batch([
      log,
      // A response for old keys (or a token moved to another user) must not delete a subscription changed in flight.
      db.delete(pushSubscriptions).where(and(eq(pushSubscriptions.id, subscription.id), eq(pushSubscriptions.p256dh, subscription.p256dh), eq(pushSubscriptions.auth, subscription.auth),
        eq(pushSubscriptions.endpoint, subscription.endpoint), eq(pushSubscriptions.userId, subscription.userId))),
    ])
  } else {
    await log
  }
  return { outcome, status }
}
