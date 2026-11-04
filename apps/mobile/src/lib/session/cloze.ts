import type { Answer } from '@learnquiz/api'

const MARKER = '____'

function wordsOf(part: string): string[] {
  return part.split(/\s+/).filter((word) => word.length > 0)
}

export function splitClozeStem(stem: string): { before: string[]; prefix: string; suffix: string; after: string[] } {
  const index = stem.indexOf(MARKER)
  if (index === -1) return { before: wordsOf(stem), prefix: '', suffix: '', after: [] }
  const start = stem.slice(0, index)
  const prefix = start.match(/\S*$/u)?.[0] ?? ''
  const rest = stem.slice(index + MARKER.length)
  const suffix = rest.match(/^\S*/u)?.[0] ?? ''
  return {
    before: wordsOf(start.slice(0, start.length - prefix.length)),
    prefix,
    suffix,
    after: wordsOf(rest.slice(suffix.length)),
  }
}

export function clozeMaxLength(numeric: boolean): number {
  return numeric ? 3 : 40
}

export function clozeAnswer(value: string, numeric: boolean): Answer {
  if (numeric) return { text: value.replace(/[^0-9]/g, '').slice(0, 3) }
  return { text: value.slice(0, 40) }
}
