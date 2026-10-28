import type { ItemPayload } from '@/lib/llm/schemas'
import type { Answer, Confidence, ItemView, RevealState } from './types'

export function normalize(text: string): string {
  return text
    .normalize('NFD')
    .replace(/\p{M}/gu, '')
    .toLowerCase()
    .replace(/[^\p{L}\p{N}\s]/gu, '')
    .replace(/\s+/g, ' ')
    .trim()
}

// True when a and b differ by at most one insertion, deletion or substitution.
function withinOneEdit(a: string, b: string): boolean {
  if (Math.abs(a.length - b.length) > 1) return false
  let i = 0
  while (i < a.length && i < b.length && a[i] === b[i]) i++
  if (a.length === b.length) return a.slice(i + 1) === b.slice(i + 1)
  const [long, short] = a.length > b.length ? [a, b] : [b, a]
  return long.slice(i + 1) === short.slice(i)
}

export function gradeAnswer(payload: ItemPayload, answer: Answer) {
  if (payload.format === 'mcq') {
    const right = payload.options.find((o) => o.is_correct)
    const chosen = payload.options.find((o) => o.id === answer.optionId)
    const correct = !!chosen && chosen === right
    return { correct, correctAnswer: right?.text ?? '', chosenFeedback: correct ? null : (chosen?.feedback ?? null) }
  }
  if (payload.format === 'cloze') {
    const given = normalize(answer.text ?? '')
    const correct = payload.accepted_answers.some((a) => {
      const want = normalize(a)
      return given === want || (want.length >= 6 && withinOneEdit(given, want)) || coversMost(given, want)
    })
    return { correct, correctAnswer: payload.accepted_answers[0] ?? payload.model_answer, chosenFeedback: null }
  }
  // shortcut: short answers are never graded here, the server routes them to the model; wire that in before shipping short items.
  return { correct: false, correctAnswer: payload.model_answer, chosenFeedback: null }
}

// "within reach" for "within adult reach": every given word is in the key and covers at least half of it.
function coversMost(given: string, want: string): boolean {
  const g = given.split(' ').filter(Boolean)
  const w = want.split(' ').filter(Boolean)
  if (g.length < 1 || w.length < 2 || !g.some((t) => t.length >= 4)) return false
  return g.every((t) => w.includes(t)) && g.length * 2 >= w.length
}

export function revealState(correct: boolean, confidence: Confidence): RevealState {
  if (correct) return confidence === 'sure' ? 'A' : 'B'
  return confidence === 'sure' ? 'D' : 'C'
}

// FNV-1a hash into a mulberry32 stream: the same seed always gives the same shuffle.
function rng(seed: string) {
  let h = 2166136261
  for (const c of seed) h = Math.imul(h ^ c.charCodeAt(0), 16777619)
  return () => {
    h = (h + 0x6d2b79f5) | 0
    let t = Math.imul(h ^ (h >>> 15), 1 | h)
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296
  }
}

export function toItemView(
  item: { id: string; conceptId: string; conceptName: string; format: ItemView['format']; difficultyPrior: number; payload: ItemPayload },
  seed: string,
): ItemView {
  const options = item.payload.options.map((o) => ({ id: o.id, text: o.text }))
  const random = rng(`${seed}:${item.id}`)
  for (let i = options.length - 1; i > 0; i--) {
    const j = Math.floor(random() * (i + 1))
    ;[options[i], options[j]] = [options[j], options[i]]
  }
  return {
    id: item.id,
    conceptId: item.conceptId,
    conceptName: item.conceptName,
    format: item.format,
    stem: item.payload.stem,
    options,
    difficulty: item.difficultyPrior,
  }
}
