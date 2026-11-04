import { and, eq, exists, notExists, sql } from 'drizzle-orm'
import { getDb, type Db } from '@/db'
import { user } from '@/db/auth-schema'
import { pushLog, pushPrefs, pushSubscriptions } from '@/db/schema'
import { getEnv } from '@/server/env'
import { capPolicy, effectiveWindow, inWindow, pushContext } from './window'
import { pickPushItem } from './pick'
import { EXPO_TOKEN, sendPush } from './sender'

const MIN_GAP_MS = 60 * 60 * 1000
const MAX_TTL_SECONDS = 3600

const DAY_MS = 86_400_000

// The wall-clock time in `timeZone` at instant `at`, read as if it were UTC (whole seconds).
function wallClock(timeZone: string, at: number) {
  const parts = new Intl.DateTimeFormat('en-GB', { timeZone, year: 'numeric', month: 'numeric', day: 'numeric', hour: 'numeric', minute: 'numeric', second: 'numeric', hourCycle: 'h23' }).formatToParts(new Date(at))
  const get = (type: string) => Number(parts.find((p) => p.type === type)!.value)
  return Date.UTC(get('year'), get('month') - 1, get('day'), get('hour'), get('minute'), get('second'))
}

// Seconds since local midnight in `timeZone`, and the instant that local day began (correct across DST changes).
function localDay(timeZone: string, now: number) {
  const wall = wallClock(timeZone, now)
  const midnight = wall - (wall % DAY_MS)
  // Stepping back the wall-clock time lands an hour off when the offset changed since midnight; correct by the offset there.
  const guess = now - (now % 1000) - (wall - midnight)
  return { seconds: (wall - midnight) / 1000, dayStart: guess + midnight - wallClock(timeZone, guess) }
}

// Sends each eligible learner one question push (to every device) when the window, daily cap and 60-minute gap allow it.
export async function sendDuePushes(now: number, db: Db = getDb()) {
  const env = getEnv()
  const config = env.VAPID_PUBLIC_KEY && env.VAPID_PRIVATE_KEY && env.VAPID_SUBJECT
    ? { publicKey: env.VAPID_PUBLIC_KEY, privateKey: env.VAPID_PRIVATE_KEY, subject: env.VAPID_SUBJECT } : null
  const learners = await db.select().from(pushPrefs)
    .where(and(eq(pushPrefs.enabled, true), eq(pushPrefs.paused, false),
      exists(db.select({ id: pushSubscriptions.id }).from(pushSubscriptions).where(eq(pushSubscriptions.userId, pushPrefs.userId))),
      // Banned accounts keep their subscriptions but must not receive question text.
      notExists(db.select({ id: user.id }).from(user).where(and(eq(user.id, pushPrefs.userId), eq(user.banned, true))))))
  let sent = 0
  for (const prefs of learners) {
    try {
      const { company, role } = await pushContext(db, prefs.userId)
      const window = effectiveWindow(company, prefs)
      if (!inWindow(window, now)) continue
      const { seconds, dayStart } = localDay(window.timezone, now)
      // One push fans out to several devices, each writing a row, so count distinct items.
      const today = await db.select({ pushes: sql<number>`count(distinct ${pushLog.itemId})` }).from(pushLog)
        .where(and(eq(pushLog.userId, prefs.userId), eq(pushLog.outcome, 'accepted'), sql`${pushLog.createdAt} >= ${dayStart}`)).get()
      if ((today?.pushes ?? 0) >= capPolicy(role, now).dailyCap) continue
      const last = await db.select({ at: sql<number | null>`max(${pushLog.createdAt})` }).from(pushLog)
        .where(and(eq(pushLog.userId, prefs.userId), eq(pushLog.outcome, 'accepted'))).get()
      if (last?.at != null && last.at > now - MIN_GAP_MS) continue
      const item = await pickPushItem(db, prefs.userId, now)
      if (!item) continue
      const subscriptions = await db.select().from(pushSubscriptions).where(eq(pushSubscriptions.userId, prefs.userId))
      for (const subscription of subscriptions) {
        // Web pushes need VAPID; Expo tokens do not.
        if (!config && !EXPO_TOKEN.test(subscription.endpoint)) continue
        // Sends run one after another, so take off the time already spent to keep each device inside the window end.
        const ttl = Math.min(MAX_TTL_SECONDS, window.endMinute * 60 - seconds - Math.floor((Date.now() - now) / 1000))
        const { outcome } = await sendPush(db, subscription, config, { title: item.stem, body: 'Tap to answer.', url: `/play/quick/${item.itemId}` }, ttl)
        if (outcome !== 'skipped') sent++
      }
    } catch {
      // One learner's failure must not stop the others; the next run retries.
    }
  }
  return sent
}
