import type { Confidence } from '@learnquiz/api'

export const WEEK = 7 * 86_400_000

export type ProgressAttempt = { itemId: string; conceptId: string; at: number; correct: boolean; confidence: Confidence; pKnownAfter: number }
export type RoleConcept = { id: string; critical: boolean; pKnown: number }

export function masterySeries(
  conceptIds: string[],
  attempts: ProgressAttempt[],
  start: number,
  now: number,
  initial: ReadonlyMap<string, number> = new Map(),
): { end: number; mastery: number }[] {
  const ids = new Set(conceptIds)
  const sorted = attempts
    .map((a, i) => ({ a, i }))
    .filter(({ a }) => ids.has(a.conceptId))
    .sort((x, y) => x.a.at - y.a.at || x.i - y.i)
    .map(({ a }) => a)
  const out: { end: number; mastery: number }[] = []
  for (let k = 0; start + k * WEEK < now; k++) {
    const end = Math.min(start + (k + 1) * WEEK, now)
    const last = new Map<string, number>()
    for (const a of sorted) {
      if (a.at > end) break
      last.set(a.conceptId, a.pKnownAfter)
    }
    let sum = 0
    for (const id of ids) sum += last.get(id) ?? initial.get(id) ?? 0
    out.push({ end, mastery: ids.size ? sum / ids.size : 0 })
  }
  return out
}

export function confidentErrors(attempts: ProgressAttempt[], criticalIds: ReadonlySet<string>) {
  const sorted = attempts.map((a, i) => ({ a, i })).sort((x, y) => x.a.at - y.a.at || x.i - y.i).map(({ a }) => a)
  return sorted
    .filter((a) => !a.correct && a.confidence === 'sure' && criticalIds.has(a.conceptId))
    .map((a) => ({
      itemId: a.itemId,
      conceptId: a.conceptId,
      at: a.at,
      correctedAt: sorted.find((b) => b.itemId === a.itemId && b.correct && b.at > a.at)?.at ?? null,
    }))
}

export function benchmarkMet(concepts: RoleConcept[], benchmark: number): boolean {
  if (!concepts.length) return false
  const mean = concepts.reduce((s, c) => s + c.pKnown, 0) / concepts.length
  return mean >= benchmark && concepts.every((c) => !c.critical || c.pKnown >= benchmark)
}

export function projectBenchmarkAt(series: { end: number; mastery: number }[], benchmark: number): number | null {
  const n = series.length
  if (n < 2) return null
  const last = series[n - 1]
  if (last.mastery >= benchmark) return last.end
  const mx = series.reduce((s, p) => s + p.end, 0) / n
  const my = series.reduce((s, p) => s + p.mastery, 0) / n
  let sxy = 0
  let sxx = 0
  for (const p of series) {
    sxy += (p.end - mx) * (p.mastery - my)
    sxx += (p.end - mx) ** 2
  }
  if (sxx === 0 || sxy <= 0) return null
  const slope = sxy / sxx
  return Math.max(last.end, mx + (benchmark - my) / slope)
}
