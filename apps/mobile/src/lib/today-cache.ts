import type { Today } from '@learnquiz/api/today'
import type { Branding } from './session-store'
import { getJSON, setJSON } from './kv'

export type TodayCache = { userId: string; day: string; today: Today; branding: Branding | null }

export function todayCacheKey(userId: string): string {
  return `lq:today:${userId}`
}

function utcDay(now: number): string {
  return new Date(now).toISOString().slice(0, 10)
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}

function isValidToday(value: unknown): value is Today {
  if (!isRecord(value)) return false
  const { topic, role, plan } = value
  const finite = (value: unknown) => typeof value === 'number' && Number.isFinite(value)
  if (topic !== null && (!isRecord(topic) || typeof topic.id !== 'string' || typeof topic.title !== 'string' ||
    typeof topic.placed !== 'boolean' || typeof topic.placeable !== 'boolean' ||
    !finite(topic.due) || !finite(topic.xp) || !finite(topic.streak))) return false
  if (role !== null) {
    if (!isRecord(role) || typeof role.name !== 'string' || typeof role.company !== 'string' ||
      typeof role.topicTitle !== 'string' || typeof role.preparing !== 'boolean' ||
      (role.mastery !== null && !finite(role.mastery)) || !finite(role.benchmark) ||
      !finite(role.day) || !finite(role.days)) return false
    if (role.building !== null && (!isRecord(role.building) ||
      !finite(role.building.ready) || !finite(role.building.total))) return false
  }
  if (plan !== null && (!isRecord(plan) || !['first', 'normal', 'basics', 'done'].includes(plan.state as string) ||
    !['session', 'placement'].includes(plan.start as string) ||
    (plan.nextUnit !== null && typeof plan.nextUnit !== 'string') || !finite(plan.reviewsLeft) ||
    !finite(plan.reviewsCleared) || typeof plan.sessionDone !== 'boolean' || !finite(plan.sessionSize) ||
    typeof plan.playable !== 'boolean' || (plan.nextReviewAt !== null && !finite(plan.nextReviewAt)))) return false
  return true
}

function isValidBranding(value: unknown): value is Branding | null {
  if (value === null) return true
  if (!isRecord(value)) return false
  if (typeof value.name !== 'string') return false
  if (value.logoUrl !== null && typeof value.logoUrl !== 'string') return false
  if (value.accent !== null && typeof value.accent !== 'string') return false
  return true
}

export async function loadTodayCache(userId: string, now: number = Date.now()): Promise<TodayCache | null> {
  let cached: unknown
  try {
    cached = await getJSON<unknown>(todayCacheKey(userId))
  } catch {
    return null
  }
  if (!isRecord(cached)) return null
  if (cached.userId !== userId) return null
  if (typeof cached.day !== 'string' || cached.day !== utcDay(now)) return null
  if (!isValidToday(cached.today)) return null
  if (!('branding' in cached) || !isValidBranding(cached.branding)) return null
  return { userId: cached.userId as string, day: cached.day, today: cached.today, branding: cached.branding }
}

export async function saveTodayCache(
  userId: string,
  today: Today,
  branding: Branding | null,
  now: number = Date.now(),
): Promise<void> {
  const envelope: TodayCache = { userId, day: utcDay(now), today, branding }
  try {
    await setJSON(todayCacheKey(userId), envelope)
  } catch {
    // Storage failure must not break the Today network path.
  }
}
