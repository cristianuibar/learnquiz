import type { SessionView } from './types'

export const SESSION_BONUS = 20
const DAY = 86_400_000

type Due = { id: string; conceptId: string; confidentError: boolean; retrievability: number }
type Frontier = { conceptId: string; unitOrder: number; pKnown: number; items: { id: string; difficulty: number }[] }

// Items nearest to a difficulty first; sort is stable so ties keep input order.
const nearest = (items: { id: string; difficulty: number }[], to: number) =>
  [...items].sort((a, b) => Math.abs(a.difficulty - to) - Math.abs(b.difficulty - to))

export function composeSession(input: {
  size: number
  due: Due[]
  frontier: Frontier[]
  closers: { id: string; conceptId: string }[]
  targetDifficulty: number
}): string[] {
  const closers = input.closers.slice(0, 2)
  const conceptOf = new Map<string, string>()
  const due = [...input.due]
    .sort((a, b) => Number(b.confidentError) - Number(a.confidentError) || a.retrievability - b.retrievability)
    .slice(0, 8)
  const concepts = [...input.frontier].sort((a, b) => a.unitOrder - b.unitOrder || a.pKnown - b.pKnown)
  for (const c of concepts) for (const i of c.items) conceptOf.set(i.id, c.conceptId)
  for (const d of [...due, ...closers]) conceptOf.set(d.id, d.conceptId)

  const picked = new Set(due.map((d) => d.id))
  const main = due.map((d) => d.id)
  let covered = 0
  for (const c of concepts) {
    if (covered >= 8) break
    for (const i of nearest(c.items, input.targetDifficulty).filter((i) => !picked.has(i.id)).slice(0, 2)) {
      picked.add(i.id)
      main.push(i.id)
      covered++
    }
  }
  const room = input.size - closers.length
  // Short on items: top up from the frontier one level easier.
  const spare = concepts.flatMap((c) => c.items).filter((i) => !picked.has(i.id))
  main.push(...nearest(spare, input.targetDifficulty - 1).map((i) => i.id))

  // Greedy: take the first queued item whose concept differs from the previous one.
  const queue = main.slice(0, room)
  const out: string[] = []
  while (queue.length) {
    const k = queue.findIndex((id) => conceptOf.get(id) !== conceptOf.get(out.at(-1) ?? ''))
    out.push(...queue.splice(k < 0 ? 0 : k, 1))
  }
  return [...out, ...closers.map((c) => c.id)]
}

// Places a copy of the missed item 5 slots after `position` (its index); once per session is the caller's check.
export function reinsert(queue: string[], itemId: string, position: number): string[] {
  const at = Math.min(position + 5, queue.length)
  return [...queue.slice(0, at), itemId, ...queue.slice(at)]
}

export function xpFor({ correct, kind }: { correct: boolean; kind: SessionView['kind'] }): number {
  return correct && kind !== 'placement' ? 10 : 0
}

// shortcut: days are UTC and there is no weekly freeze, use the learner's timezone and the freeze flag when streaks matter.
export function streakAfter(
  prev: { streakCount: number; lastSessionAt: number | null },
  now: Date,
  itemsAnswered: number,
): { streakCount: number; lastSessionAt: number | null } {
  if (itemsAnswered < 10) return prev
  const gap = prev.lastSessionAt === null ? Infinity : Math.floor(now.getTime() / DAY) - Math.floor(prev.lastSessionAt / DAY)
  const streakCount = gap === 0 ? Math.max(1, prev.streakCount) : gap === 1 ? prev.streakCount + 1 : 1
  return { streakCount, lastSessionAt: now.getTime() }
}
