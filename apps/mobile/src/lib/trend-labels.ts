// Pure sizing and thinning for the weekly trend's SVG labels. react-native-svg
// scales text by density only, so the chart reads the Android font scale itself.
import { textWidth } from '@learnquiz/api/trend-labels'

export { centeredLabel, clearOf, textWidth, thinLabels, type Span } from '@learnquiz/api/trend-labels'

// Artboard sizes: axis, value, date and count labels, and the "Sessions" label.
export const TREND_FONT = 12
export const TREND_LABEL_FONT = 13
// Past 1.5x the labels no longer fit a phone-width chart, even thinned.
export const MAX_TREND_FONT_SCALE = 1.5
// The artboard's height, which a larger font may grow but never shrink.
export const TREND_MIN_HEIGHT = 188

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
