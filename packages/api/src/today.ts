export type TodayState = 'first' | 'normal' | 'basics' | 'done'
export type Today = {
  topic: { id: string; title: string; placed: boolean; placeable: boolean; due: number; xp: number; streak: number
           // The streak was credited today (a session of 10 answers, or a finished reviews-only queue).
           streakEarned: boolean } | null
  role: { name: string; company: string; topicTitle: string; preparing: boolean; mastery: number | null; benchmark: number
          day: number; days: number; building: { ready: number; total: number } | null } | null
  plan: { state: TodayState; start: 'session' | 'placement'; nextUnit: string | null; reviewsLeft: number
          reviewsCleared: number; sessionDone: boolean; sessionSize: number; playable: boolean
          nextReviewAt: number | null } | null
}

// What the Today screens render. Every string a screen shows comes from here.
export type TodayStreak = { text: string; label: string }
export type TodayAction = { label: string; accessibleLabel: string; disabled: boolean }
export type TodayHero =
  | { kind: 'building'; title: string; ready: number | null; total: number | null; status: string | null; note: string | null; play: TodayAction }
  | { kind: 'first' | 'basics' | 'normal'; title: string; meta: string; play: TodayAction }
  | { kind: 'done'; title: string; meta: string; action: TodayAction }
  | { kind: 'empty' }
export type TodayQuest = { key: 'reviews' | 'session'; label: string; count: string | null; done: boolean }
export type TodayRoleView = {
  name: string; pct: number | null; benchmarkPct: number; started: boolean; chip: 'Not started' | null
  progressLabel: string; dayLabel: string; accessibleLabel: string
}
export type TodayView = { streak: TodayStreak | null; streakReward: boolean; hero: TodayHero; quests: TodayQuest[]; role: TodayRoleView | null }

const weekdays = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday']
const months = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec']

const plural = (n: number, word: string) => `${n} ${word}${n === 1 ? '' : 's'}`

const localMidnight = (d: Date) => new Date(d.getFullYear(), d.getMonth(), d.getDate()).getTime()

export function nextReviewsLine(nextReviewAt: number | null, now: Date): string {
  if (nextReviewAt === null) return 'No reviews scheduled'
  const next = new Date(nextReviewAt)
  const days = Math.round((localMidnight(next) - localMidnight(now)) / 86_400_000)
  if (days <= 0) return 'Next reviews later today'
  if (days === 1) return 'Next reviews tomorrow'
  if (days < 7) return `Next reviews on ${weekdays[next.getDay()]}`
  return `Next reviews on ${months[next.getMonth()]} ${next.getDate()}`
}

function playAction(unit: string | null, disabled: boolean): TodayAction {
  return {
    label: unit ? `Play ${unit} · 5 min` : 'Play · 5 min',
    accessibleLabel: unit ? `Play ${unit}, 5 minutes` : 'Play, 5 minutes',
    disabled,
  }
}

const BUILDING_NOTE =
  'Play unlocks as soon as your first questions are ready. This page updates on its own, so you can come back later.'

function heroView(today: Today, now: Date): TodayHero {
  const { topic, role, plan } = today
  const disabled = !plan?.playable || role?.preparing === true

  if ((role?.building != null || role?.preparing) && plan?.state !== 'done') {
    const building = role?.building ?? null
    return {
      kind: 'building',
      title: 'Building your questions',
      ready: building?.ready ?? null,
      total: building?.total ?? null,
      status: building ? `${building.ready} of ${building.total} topics ready` : 'No questions are ready yet',
      note: plan === null || disabled ? BUILDING_NOTE : null,
      play: playAction(plan?.nextUnit ?? null, disabled),
    }
  }
  if ((topic === null && role === null) || plan === null) return { kind: 'empty' }

  const unit = plan.nextUnit
  const questions = `${plan.sessionSize} questions`
  if (plan.state === 'first') {
    const meta = plan.start === 'placement'
      ? 'Finds your starting level'
      : unit ? `Starts with ${unit}` : questions
    return { kind: 'first', title: 'Your first session', meta, play: playAction(null, disabled) }
  }
  if (plan.state === 'basics') {
    return {
      kind: 'basics',
      title: unit ? `Back to basics: ${unit}` : 'Back to basics',
      meta: `Full explanations · ${questions}`,
      play: playAction(null, disabled),
    }
  }
  if (plan.state === 'normal') {
    const n = plan.reviewsLeft
    const reviews = plural(n, 'review')
    const title = n > 0 && unit ? `${reviews}, then ${unit}` : n > 0 ? reviews : unit ?? 'Nothing due yet'
    const nothing = n <= 0 && !unit
    return { kind: 'normal', title, meta: questions, play: playAction(null, disabled || nothing) }
  }
  return {
    kind: 'done',
    title: 'Done for today',
    meta: nextReviewsLine(plan.nextReviewAt, now),
    action: { label: 'Practice anyway', accessibleLabel: 'Practice anyway', disabled: !plan.playable },
  }
}

function questsView(today: Today): TodayQuest[] {
  const { topic, plan } = today
  if (plan === null) return []
  const quests: TodayQuest[] = []
  const due = topic?.due ?? 0
  const cleared = plan.reviewsCleared
  if (cleared + due > 0 && plan.state !== 'first') {
    quests.push({ key: 'reviews', label: 'Clear your reviews', count: `${cleared} of ${cleared + due}`, done: due === 0 })
  }
  quests.push({ key: 'session', label: 'One session', count: null, done: plan.sessionDone })
  return quests
}

function roleView(today: Today): TodayRoleView | null {
  const { role, plan } = today
  if (role === null) return null
  const started = role.mastery !== null && plan?.state !== 'first'
  const benchmarkPct = Math.round(role.benchmark * 100)
  const dayLabel = `Day ${role.day} of ${role.days}`
  if (started && role.mastery !== null) {
    const pct = Math.round(role.mastery * 100)
    const progressLabel = `${pct}% of ${benchmarkPct}% benchmark`
    return {
      name: role.name, pct, benchmarkPct, started: true, chip: null, progressLabel, dayLabel,
      accessibleLabel: `${role.name}: ${progressLabel}, ${dayLabel.toLowerCase()}`,
    }
  }
  return {
    name: role.name, pct: null, benchmarkPct, started: false, chip: 'Not started',
    progressLabel: `Benchmark ${benchmarkPct}%`, dayLabel,
    accessibleLabel: `${role.name}: not started, benchmark ${benchmarkPct}%, ${dayLabel.toLowerCase()}`,
  }
}

function streakView(today: Today): TodayStreak | null {
  const n = today.topic?.streak ?? 0
  if (n <= 0 || today.plan?.state === 'first') return null
  const text = plural(n, 'day')
  return { text, label: `${text} in a row` }
}

export function todayView(today: Today, now: Date): TodayView {
  const hero = heroView(today, now)
  const streak = streakView(today)
  // A finished short session can show "Done for today" before the streak counts the day; the pill stays quiet then.
  const streakReward = hero.kind === 'done' && streak !== null && today.topic?.streakEarned === true
  return { streak, streakReward, hero, quests: questsView(today), role: roleView(today) }
}

export const todayFixtureNow = new Date(2026, 10, 3, 12, 0)

const fixtureRole = { name: 'Warehouse picker', company: 'Northwind', topicTitle: 'Warehouse operations', benchmark: 0.85, days: 30 }
const fixtureTopic = { id: 'topic-warehouse', title: 'Warehouse operations' }

export const todayFixtures: Record<'first' | 'normal' | 'done' | 'building' | 'basics' | 'preparing', Today> = {
  first: {
    topic: { ...fixtureTopic, placed: false, placeable: false, due: 0, xp: 0, streak: 0, streakEarned: false },
    role: { ...fixtureRole, preparing: false, mastery: null, day: 1, building: null },
    plan: { state: 'first', start: 'session', nextUnit: 'Receiving', reviewsLeft: 0, reviewsCleared: 0, sessionDone: false, sessionSize: 20, playable: true, nextReviewAt: null },
  },
  normal: {
    topic: { ...fixtureTopic, placed: true, placeable: true, due: 4, xp: 1240, streak: 4, streakEarned: false },
    role: { ...fixtureRole, preparing: false, mastery: 0.66, day: 16, building: null },
    plan: { state: 'normal', start: 'session', nextUnit: 'Picking', reviewsLeft: 4, reviewsCleared: 2, sessionDone: false, sessionSize: 20, playable: true, nextReviewAt: null },
  },
  done: {
    topic: { ...fixtureTopic, placed: true, placeable: true, due: 0, xp: 1420, streak: 5, streakEarned: true },
    role: { ...fixtureRole, preparing: false, mastery: 0.68, day: 16, building: null },
    plan: { state: 'done', start: 'session', nextUnit: 'Picking', reviewsLeft: 0, reviewsCleared: 6, sessionDone: true, sessionSize: 20, playable: true, nextReviewAt: new Date(2026, 10, 4, 9, 0).getTime() },
  },
  building: {
    topic: { ...fixtureTopic, placed: true, placeable: true, due: 0, xp: 120, streak: 2, streakEarned: false },
    role: { ...fixtureRole, preparing: false, mastery: 0.12, day: 3, building: { ready: 28, total: 42 } },
    plan: { state: 'normal', start: 'session', nextUnit: 'Receiving', reviewsLeft: 0, reviewsCleared: 0, sessionDone: false, sessionSize: 20, playable: true, nextReviewAt: null },
  },
  basics: {
    topic: { ...fixtureTopic, placed: true, placeable: true, due: 2, xp: 610, streak: 3, streakEarned: false },
    role: { ...fixtureRole, preparing: false, mastery: 0.41, day: 9, building: null },
    plan: { state: 'basics', start: 'session', nextUnit: 'Receiving', reviewsLeft: 2, reviewsCleared: 0, sessionDone: false, sessionSize: 20, playable: true, nextReviewAt: null },
  },
  preparing: {
    topic: null,
    role: { ...fixtureRole, preparing: true, mastery: null, day: 1, building: { ready: 0, total: 42 } },
    plan: null,
  },
}
