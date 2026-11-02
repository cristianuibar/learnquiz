import { and, eq } from 'drizzle-orm'
import type { Db } from '@/db'
import { pushLog, pushSubscriptions } from '@/db/schema'
import { encryptPayload, vapidAuthorization, type VapidConfig } from './crypto'

// Never follow a push-service redirect with subscription material or VAPID authorization.
export async function sendPush(db: Db, subscription: typeof pushSubscriptions.$inferSelect, config: VapidConfig, payload: { title: string; body: string; url: string }) {
  const authorization = await vapidAuthorization(subscription.endpoint, config)
  const body = await encryptPayload(subscription, JSON.stringify(payload))
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
  const log = db.insert(pushLog).values({ id: crypto.randomUUID(), userId: subscription.userId, subscriptionId: subscription.id, outcome, httpStatus: status, createdAt: Date.now() })
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
