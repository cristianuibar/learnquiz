import type { Confidence } from './types'

export const PLACEMENT = { start: 3, min: 8, max: 12 }

const clamp = (n: number) => Math.min(5, Math.max(1, n))
const lastFour = (log: { level: number }[]) => log.slice(-4).map((l) => l.level)

export function nextLevel(level: number, correct: boolean, confidence: Confidence): number {
  const step = confidence === 'sure' ? 1 : 0.5
  return clamp(level + (correct ? step : -step))
}

export function shouldStop(log: { level: number }[]): boolean {
  if (log.length >= PLACEMENT.max) return true
  const levels = lastFour(log)
  return log.length >= PLACEMENT.min && Math.max(...levels) - Math.min(...levels) <= 1
}

export function levelResult(log: { level: number }[]): number {
  const levels = lastFour(log)
  if (!levels.length) return PLACEMENT.start
  return clamp(Math.round(levels.reduce((a, b) => a + b, 0) / levels.length))
}

type Pool = { id: string; conceptId: string; difficulty: number }

export function pickNext(level: number, pool: Pool[], asked: { id: string; conceptId: string }[]): string | null {
  const seen = new Set(asked.map((a) => a.id))
  const recent = new Set(asked.slice(-2).map((a) => a.conceptId))
  const unseen = pool.filter((p) => !seen.has(p.id))
  const fresh = unseen.filter((p) => !recent.has(p.conceptId))
  const count = (conceptId: string) => asked.filter((a) => a.conceptId === conceptId).length
  const best = [...(fresh.length ? fresh : unseen)].sort(
    (a, b) => Math.abs(a.difficulty - level) - Math.abs(b.difficulty - level) || count(a.conceptId) - count(b.conceptId),
  )
  return best[0]?.id ?? null
}
