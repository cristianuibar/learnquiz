// Pure formatting helpers for the after-session summary. Mastery and benchmark
// values from the API are fractions 0..1; display percentages are whole numbers.

export function clock(ms: number): string {
  if (!Number.isFinite(ms) || ms < 0) return '0:00'
  const total = Math.floor(ms / 1000)
  const minutes = Math.floor(total / 60)
  const seconds = total % 60
  return `${minutes}:${String(seconds).padStart(2, '0')}`
}

export function percent(value: number): number {
  if (!Number.isFinite(value)) return 0
  return Math.min(100, Math.max(0, Math.round(value * 100)))
}

export function deltaText(before: number, after: number): string {
  const b = percent(before)
  const a = percent(after)
  if (a > b) return `${a}%, up from ${b}%`
  if (a < b) return `${a}%, down from ${b}%`
  return `${a}%, no change`
}

export function barValueText(before: number, after: number, benchmark: number | null): string {
  const base = deltaText(before, after)
  return benchmark !== null ? `${base}. Benchmark ${percent(benchmark)}%` : base
}

export function gainWidths(before: number, after: number): { before: number; gain: number } {
  const b = percent(before)
  const a = percent(after)
  return { before: Math.min(b, a), gain: Math.max(0, a - b) }
}

export function streakLabel(count: number): string | null {
  if (!Number.isFinite(count) || count <= 0) return null
  return count === 1 ? '1 day in a row' : `${count} days in a row`
}

export function scoreLine(s: { correct: number; total: number; durationMs: number; ungraded: number }): string {
  const base = `${s.correct} of ${s.total} correct · ${clock(s.durationMs)}`
  return s.ungraded > 0 ? `${base} · ${s.ungraded} not graded` : base
}
