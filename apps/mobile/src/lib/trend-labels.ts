// Pure sizing and thinning for the weekly trend's SVG labels. react-native-svg
// scales text by density only, so the chart reads the Android font scale itself.

// Artboard sizes: axis, value, date and count labels, and the "Sessions" label.
export const TREND_FONT = 12
export const TREND_LABEL_FONT = 13
// Past 1.5x the labels no longer fit a phone-width chart, even thinned.
export const MAX_TREND_FONT_SCALE = 1.5
// The artboard's height, which a larger font may grow but never shrink.
export const TREND_MIN_HEIGHT = 188
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

// Font sizes and baselines below the plot for a font scale. Scale 1 keeps the
// artboard (dates at 164, counts at 182, 188 high); a larger scale moves both
// rows down and grows the height, and widens the left gutter for "Sessions".
export function trendType(fontScale: number, plotBottom: number) {
  const scale = Number.isFinite(fontScale) ? Math.min(Math.max(fontScale, 1), MAX_TREND_FONT_SCALE) : 1
  const font = Math.round(TREND_FONT * scale)
  const label = Math.round(TREND_LABEL_FONT * scale)
  const dateY = Math.round(plotBottom + 4 + font * 1.3)
  const sessionsY = dateY + Math.round(Math.max(font, label) * 1.4)
  return {
    font,
    label,
    dateY,
    sessionsY,
    height: Math.max(TREND_MIN_HEIGHT, sessionsY + Math.round(font / 2)),
    gutter: Math.ceil(textWidth('Sessions', label) - textWidth('Sessions', TREND_LABEL_FONT)),
  }
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
