// @vitest-environment happy-dom
import { act } from 'react'
import { createRoot } from 'react-dom/client'
import { expect, it } from 'vitest'
import type { Profile, WeekPoint } from '@learnquiz/api/progress'
import { textWidth } from '@learnquiz/api/trend-labels'
import { WeeklyTrend } from './weekly-trend'

const day = 86_400_000
const date = (d: string) => Date.parse(`${d}T00:00:00Z`)

async function renderTrend(weeks: WeekPoint[], projectedAt: number | null) {
  const profile = { benchmark: 0.85, weeks, proficiency: { achievedAt: null, days: null, estimatedDays: 1, projectedAt } } as unknown as Profile
  Object.assign(globalThis, { IS_REACT_ACT_ENVIRONMENT: true })
  const container = document.createElement('div')
  const root = createRoot(container)
  await act(async () => root.render(<WeeklyTrend profile={profile} />))
  const row = (y: string) => [...container.querySelectorAll(`svg[role="img"] text[y="${y}"]`)]
    .map((t) => ({ text: t.textContent!, x: Number(t.getAttribute('x')), anchor: t.getAttribute('text-anchor') })).sort((a, b) => a.x - b.x)
  return { container, dates: row('164'), counts: row('182').filter((t) => t.text !== 'Sessions'), unmount: () => act(async () => root.unmount()) }
}

// Horizontal extent of a drawn label at the chart's 11-unit font.
const span = ({ text, x, anchor }: { text: string; x: number; anchor: string | null }) => {
  const w = textWidth(text, 11)
  return anchor === 'start' ? { left: x, right: x + w } : { left: x - w / 2, right: x + w / 2 }
}
const overlaps = (labels: { text: string; x: number; anchor: string | null }[]) =>
  labels.map(span).sort((a, b) => a.left - b.left).some((s, i, all) => i > 0 && all[i - 1].right > s.left)

it('drops a measured date that a projection a day later would overlap, keeping the projection date and the count', async () => {
  const weeks = [
    { start: date('2026-10-26'), mastery: 0.8, sessions: 5, partial: false },
    { start: date('2026-11-02'), mastery: 0.84, sessions: 2, partial: true },
  ]
  const { container, dates, counts, unmount } = await renderTrend(weeks, date('2026-11-03') + day / 2)
  expect(dates.map((d) => d.text)).toEqual(['Oct 26', 'Nov 3'])
  expect(overlaps(dates)).toBe(false)
  expect(counts.map((c) => c.text)).toEqual(['5', '2', 'so far'])
  expect([...container.querySelectorAll('table tbody tr')].map((r) => r.textContent)).toEqual(['Oct 2680%5', 'Nov 284%2 so far', 'Nov 3 (projected)85%'])
  await unmount()
})

it('keeps the partial count under its date and thins crowded weeks so dates and counts never overlap', async () => {
  const weeks = Array.from({ length: 6 }, (_, i) => ({ start: date('2026-09-28') + i * 7 * day, mastery: 0.3 + i * 0.08, sessions: 10 + i, partial: i === 5 }))
  const { dates, counts, unmount } = await renderTrend(weeks, date('2026-11-12'))
  expect(dates.at(-1)!.text).toBe('Nov 12')
  expect(dates.at(-2)!.text).toBe('Nov 2')
  expect(dates.length).toBeLessThan(7)
  expect(overlaps(dates)).toBe(false)
  expect(overlaps(counts)).toBe(false)
  const partial = counts.findIndex((c) => c.text === '15')
  expect(counts[partial].x).toBe(dates.at(-2)!.x)
  expect(counts[partial + 1]).toMatchObject({ text: 'so far', anchor: 'start' })
  await unmount()
})

it('keeps the partial count under its date at the right edge without a projection', async () => {
  const weeks = Array.from({ length: 6 }, (_, i) => ({ start: date('2026-09-28') + i * 7 * day, mastery: 0.3 + i * 0.08, sessions: 10 + i, partial: i === 5 }))
  const { container, dates, counts, unmount } = await renderTrend(weeks, null)
  const width = Number(container.querySelector('svg[role="img"]')!.getAttribute('viewBox')!.split(' ')[2])
  expect(dates.at(-1)!.text).toBe('Nov 2')
  const partial = counts.findIndex((c) => c.text === '15')
  expect(counts[partial].x).toBe(dates.at(-1)!.x)
  expect(counts[partial + 1]).toMatchObject({ text: 'so far', anchor: 'start' })
  expect(span(counts[partial + 1]).right).toBeLessThanOrEqual(width)
  expect(overlaps(dates)).toBe(false)
  expect(overlaps(counts)).toBe(false)
  await unmount()
})
