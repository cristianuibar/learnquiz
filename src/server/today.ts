import { createServerFn } from '@tanstack/react-start'
import { and, count, desc, eq, lte } from 'drizzle-orm'
import { getDb } from '@/db'
import { items, learnerItem, learnerTopic, placements, topics } from '@/db/schema'
import { getLearnerId } from '@/server/session'
import { assignedRoleTopic, rolePlayable } from '@/server/topic-access'

export type Today = {
  topic: { id: string; title: string; placed: boolean; placeable: boolean; due: number; xp: number; streak: number } | null
  role: { name: string; company: string; topicTitle: string; preparing: boolean } | null
}

// The home screen. An employee's Today is their role topic (or "preparing" until the curriculum is ready);
// the personal edition shows the newest ready personal topic.
export const getToday = createServerFn({ method: 'GET' }).handler(async (): Promise<Today> => {
  const learnerId = await getLearnerId()
  if (!learnerId) return { topic: null, role: null }
  const db = getDb()
  const assigned = await assignedRoleTopic(db, learnerId)
  let topic: { id: string; title: string } | undefined
  let placeable = true
  let role: Today['role'] = null
  if (assigned) {
    const ready = assigned.topic.status === 'ready'
    role = { name: assigned.roleName, company: assigned.company, topicTitle: assigned.topic.title, preparing: !ready }
    if (ready) placeable = await rolePlayable(db, assigned.topic)
    if (ready) topic = { id: assigned.topic.id, title: assigned.topic.title }
  } else {
    topic = await db.select({ id: topics.id, title: topics.title }).from(topics)
      .where(and(eq(topics.learnerId, learnerId), eq(topics.status, 'ready')))
      .orderBy(desc(topics.createdAt)).limit(1).get()
  }
  if (!topic) return { topic: null, role }
  const [placement, lt, due] = await Promise.all([
    db.select({ id: placements.id }).from(placements)
      .where(and(eq(placements.learnerId, learnerId), eq(placements.topicId, topic.id))).limit(1).get(),
    db.select({ xp: learnerTopic.xp, streak: learnerTopic.streakCount }).from(learnerTopic)
      .where(and(eq(learnerTopic.learnerId, learnerId), eq(learnerTopic.topicId, topic.id))).get(),
    db.select({ n: count() }).from(learnerItem)
      .innerJoin(items, eq(items.id, learnerItem.itemId))
      .where(and(eq(learnerItem.learnerId, learnerId), eq(items.topicId, topic.id), eq(items.status, 'active'), lte(learnerItem.due, Date.now())))
      .get(),
  ])
  return {
    topic: { id: topic.id, title: topic.title, placed: Boolean(placement), placeable, due: due?.n ?? 0, xp: lt?.xp ?? 0, streak: lt?.streak ?? 0 },
    role,
  }
})
