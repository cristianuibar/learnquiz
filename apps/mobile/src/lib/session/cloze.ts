import type { Answer } from '@learnquiz/api'

const MARKER = '____'

function wordsOf(part: string): string[] {
  return part.split(/\s+/).filter((word) => word.length > 0)
}

export function splitClozeStem(stem: string): { before: string[]; after: string[] } {
  const index = stem.indexOf(MARKER)
  if (index === -1) return { before: wordsOf(stem), after: [] }
  return {
    before: wordsOf(stem.slice(0, index)),
    after: wordsOf(stem.slice(index + MARKER.length)),
  }
}

export function clozeMaxLength(numeric: boolean): number {
  return numeric ? 3 : 40
}

export function clozeAnswer(value: string, numeric: boolean): Answer {
  if (numeric) return { text: value.replace(/[^0-9]/g, '').slice(0, 3) }
  return { text: value.slice(0, 40) }
}
