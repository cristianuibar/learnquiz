// Pure sizing and thinning for the weekly trend's SVG labels, shared by the
// web and mobile charts so their date, count and value rows never overlap.
import { formatShortDate, percentText, type WeekPoint } from './progress.ts'

// Average advance for dates, counts and short words, in em.
const CHAR_EM = 0.6
// Inter Bold "100%" spans about 2.8em. Leave room for its wide percent glyph
// and rounding when clamping percentage labels to the chart edges.
const PERCENT_CHAR_EM = 0.72
const LABEL_GAP = 4

export type Span = { left: number; right: number }

export function textWidth(text: string, fontSize: number): number {
  return text.length * fontSize * (text.endsWith('%') ? PERCENT_CHAR_EM : CHAR_EM)
}

// A label centred on x, moved inward just enough to stay within [0, width].
export function centeredLabel(x: number, labelWidth: number, width: number): Span & { x: number } {
  const half = labelWidth / 2
  const center = Math.max(half, Math.min(x, width - half))
  return { x: center, left: center - half, right: center + half }
}

// True when a label ends at least gap before a label drawn to its right.
export function clearOf(span: Span, next: Span | null, gap = LABEL_GAP): boolean {
  return next === null || span.right + gap <= next.left
}

// Which labels to draw, left to right. The newest label wins: walk from the
// right and keep a label only when it clears the one kept after it. A reserved
// span (the projection date) is always drawn, so a label that reaches it is dropped.
export function thinLabels(spans: readonly Span[], reserved: Span | null = null, gap = LABEL_GAP): boolean[] {
  const keep = spans.map(() => false)
  let limit = reserved ? reserved.left - gap : Infinity
  for (let index = spans.length - 1; index >= 0; index--) {
    const span = spans[index]
    if (span.right <= limit) {
      keep[index] = true
      limit = span.left - gap
    }
  }
  return keep
}

type PlotPoint = WeekPoint & { x: number; y: number }

// Value, date and session-count labels for plotted weeks at a font size. The
// count sits under its date and "so far" follows it; date and count share one
// x, which moves inward just enough to keep both inside the chart. Whole
// columns are thinned. The projection date sits only in the date row: a week's
// date that reaches it is dropped, keeping its count.
export function trendLabels<P extends PlotPoint, J extends { at: number; x: number }>(points: readonly P[], projection: J | null, width: number, font: number) {
  const labelled = points.map((point) => {
    const valueLabel = percentText(point.mastery)
    const dateLabel = formatShortDate(point.start)
    const dateWidth = textWidth(dateLabel, font)
    const count = String(point.sessions)
    const countWidth = textWidth(count, font)
    const suffixWidth = point.partial ? textWidth('so far', font) : 0
    const suffixGap = Math.max(8, countWidth / 2 + 4)
    const reach = Math.max(dateWidth / 2, point.partial ? suffixGap + suffixWidth : countWidth / 2)
    const x = Math.max(Math.max(dateWidth, countWidth) / 2, Math.min(point.x, width - reach))
    return {
      ...point,
      valueLabel,
      dateLabel,
      value: { ...centeredLabel(point.x, textWidth(valueLabel, font), width), y: Math.max(font, point.y - 12) },
      date: { x, left: x - dateWidth / 2, right: x + dateWidth / 2 },
      count: { x, text: count, suffixX: point.partial ? x + suffixGap : null,
        left: x - countWidth / 2, right: point.partial ? x + suffixGap + suffixWidth : x + countWidth / 2 },
    }
  })
  const labelledProjection = projection && (() => {
    const dateLabel = formatShortDate(projection.at)
    return { ...projection, dateLabel, date: centeredLabel(projection.x, textWidth(dateLabel, font), width) }
  })()
  const columns = thinLabels(labelled.map(({ date, count }) => ({ left: Math.min(date.left, count.left), right: Math.max(date.right, count.right) })))
  const values = thinLabels(labelled.map(({ value }) => value))
  return {
    points: labelled.map((point, index) => ({ ...point, counted: columns[index], valued: values[index],
      dated: columns[index] && clearOf(point.date, labelledProjection?.date ?? null) })),
    projection: labelledProjection,
  }
}
