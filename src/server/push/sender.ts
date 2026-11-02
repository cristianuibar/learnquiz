import { and, eq } from 'drizzle-orm'
import type { Db } from '@/db'
import { pushLog, pushPrefs, pushSubscriptions } from '@/db/schema'
import { encryptPayload, vapidAuthorization, type VapidConfig } from './crypto'

// Never follow a push-service redirect with subscription material or VAPID authorization.
export async function sendPush(db: Db, subscription: typeof pushSubscriptions.$inferSelect, config: VapidConfig, payload: { title: string; body: string; url: string }) {
  // Check at delivery time as well as selection time so a queued push respects a pause.
  const [prefs] = await db.select().from(pushPrefs).where(eq(pushPrefs.userId, subscription.userId))
  if (!prefs?.enabled || prefs.paused) return { outcome: 'skipped', status: null }
  const parts = new Intl.DateTimeFormat('en-GB', { timeZone: prefs.timezone, hour: '2-digit', minute: '2-digit', hourCycle: 'h23' }).formatToParts(new Date())
  const minute = Number(parts.find((p) => p.type === 'hour')!.value) * 60 + Number(parts.find((p) => p.type === 'minute')!.value)
  if (minute < prefs.startMinute || minute >= prefs.endMinute) return { outcome: 'skipped', status: null }
  const id = crypto.randomUUID()
  const url = new URL(payload.url, 'https://learnquiz.invalid')
  const match = /^\/play\/quick\/([^/]+)\/?$/.exec(url.pathname)
  const itemId = match ? decodeURIComponent(match[1]) : null
  if (itemId) url.searchParams.set('pushId', id)
  const notification = { ...payload, url: itemId ? url.pathname + url.search : payload.url }
  const authorization = await vapidAuthorization(subscription.endpoint, config)
  const body = await encryptPayload(subscription, JSON.stringify(notification))
  let status: number | null = null
  try {
    const response = await fetch(subscription.endpoint, {
      method: 'POST', redirect: 'error', signal: AbortSignal.timeout(10_000),
      headers: { Authorization: authorization, 'Content-Encoding': 'aes128gcm', 'Content-Type': 'application/octet-stream', TTL: '300' },
      body,
    })
    status = response.status
    await response.body?.cancel()
  } catch {
    // Do not store endpoint credentials or provider response bodies in logs.
  }
  const outcome = status === 404 || status === 410 ? 'gone' : status !== null && status >= 200 && status < 300 ? 'accepted' : 'failed'
  const log = db.insert(pushLog).values({ id, userId: subscription.userId, subscriptionId: subscription.id, itemId, outcome, httpStatus: status, createdAt: Date.now() })
  if (outcome === 'gone') {
    await db.batch([
      log,
      // A response for an old key must not delete a subscription refreshed in flight.
      db.delete(pushSubscriptions).where(and(eq(pushSubscriptions.id, subscription.id), eq(pushSubscriptions.p256dh, subscription.p256dh), eq(pushSubscriptions.auth, subscription.auth))),
    ])
  } else {
    await log
  }
  return { outcome, status }
}
