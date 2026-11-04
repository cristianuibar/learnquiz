export type CurriculumSize = { units: [number, number]; conceptsPerUnit: [number, number]; totalConcepts: [number, number] | null }

const SMALL = 1000
const LARGE = 5000

// Each concept costs questions and model calls, so a short document must not be padded to a full-size curriculum.
export function curriculumSize(documents: readonly { bodyText: string }[]): CurriculumSize {
  const length = documents.reduce((n, d) => n + d.bodyText.trim().length, 0)
  if (length < SMALL) return { units: [1, 2], conceptsPerUnit: [1, 6], totalConcepts: [2, 6] }
  if (length >= LARGE) return { units: [4, 10], conceptsPerUnit: [4, 8], totalConcepts: null }
  const t = (length - SMALL) / (LARGE - SMALL)
  return {
    units: [Math.round(1 + 3 * t), Math.round(2 + 8 * t)],
    conceptsPerUnit: [Math.round(1 + 3 * t), Math.round(3 + 5 * t)],
    totalConcepts: null,
  }
}
