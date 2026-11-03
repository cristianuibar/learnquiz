import type { Reveal } from './learning.ts'

export const revealCopy = {
  correct: 'Correct',
  notQuite: 'Not quite',
  partlyRight: 'Partly right',
  ungraded: 'Couldn’t grade this answer',
  why: 'Why',
  theAnswer: 'The answer',
  youChose: 'You chose',
  youWrote: 'You wrote',
  yourAnswer: 'Your answer',
  criticalStep: 'Critical step',
  comesBackFirst: 'Comes back first next session',
  whyItFeltRight: 'Why it felt right',
  whatActuallyMatters: 'What actually matters',
  returnsThisSession: 'This comes back later this session.',
  continue: 'Continue',
  gotIt: 'Got it',
  report: 'Report this question',
  reflection: 'In one line: why does this matter?',
  optional: 'Optional',
} as const

const states = {
  A: { variant: 'correctSure', tone: 'correct', heading: revealCopy.correct },
  B: { variant: 'correctUnsure', tone: 'correct', heading: revealCopy.correct },
  C: { variant: 'notQuite', tone: 'wrong', heading: revealCopy.notQuite },
  D: { variant: 'sureWrong', tone: 'wrong', heading: revealCopy.notQuite },
  P: { variant: 'partial', tone: 'learning', heading: revealCopy.partlyRight },
  ungraded: { variant: 'ungraded', tone: 'neutral', heading: revealCopy.ungraded },
} as const

export type RevealModel = {
  variant: typeof states[keyof typeof states]['variant'] | 'noSource'
  tone: typeof states[keyof typeof states]['tone']
  heading: string
  xpText: string | null
  counts: string | null
  announcement: string
  continueLabel: string
  showWhy: boolean
  openByDefault: boolean
  noQuoteLine: string | null
  partialLines: { id: string; icon: 'check' | 'x'; text: string }[]
}

export function revealModel(reveal: Reveal, { hasCompany }: { hasCompany: boolean }): RevealModel {
  const { tone, heading } = states[reveal.state]
  const correct = tone === 'correct'
  const variant = correct && reveal.sourceQuote === null ? 'noSource' : states[reveal.state].variant
  const xpText = correct && reveal.xp > 0 ? `+${reveal.xp} XP` : null
  const partial = reveal.state === 'P' && reveal.detail?.kind === 'multi' ? reveal.detail : null
  const countParts = partial ? [`${partial.found} of ${partial.total} found`] : []
  if (partial && partial.extra > 0) countParts.push(`${partial.extra} extra`)

  return {
    variant,
    tone,
    heading,
    xpText,
    counts: countParts.length ? countParts.join(' · ') : null,
    announcement: [heading, ...(xpText ? [`${reveal.xp} XP`] : countParts)].join(', '),
    continueLabel: reveal.state === 'D' ? revealCopy.gotIt : revealCopy.continue,
    showWhy: variant === 'correctSure',
    openByDefault: variant !== 'correctSure',
    noQuoteLine: variant === 'noSource' ? (hasCompany ? 'Not quoted from your SOP' : 'Not quoted from a source') : null,
    partialLines: partial?.options.flatMap((option) => {
      if (option.correct === option.chosen) return []
      const note = option.note.trim()
      return [{
        id: option.id,
        icon: option.correct ? 'check' as const : 'x' as const,
        text: note
          ? `${option.text}: ${note}${option.correct ? ' You missed it.' : ''}`
          : option.correct ? `${option.text}. You missed it.` : `${option.text} was not needed.`,
      }]
    }) ?? [],
  }
}

export type OptionMark = 'correct' | 'wrong' | 'rest'

export function optionMarks(reveal: Reveal, pickedIds: readonly string[]): Record<string, OptionMark> {
  const correct = new Set(reveal.correctOptionIds ?? [])
  const picked = new Set(pickedIds)
  const options = reveal.detail?.kind === 'multi' ? reveal.detail.options : []
  for (const option of options) {
    if (option.correct) correct.add(option.id)
    if (option.chosen) picked.add(option.id)
  }
  const ids = new Set([...correct, ...picked, ...options.map((option) => option.id)])
  return Object.fromEntries([...ids].map((id) => [
    id,
    reveal.state === 'ungraded' ? 'rest' : correct.has(id) ? 'correct' : picked.has(id) ? 'wrong' : 'rest',
  ]))
}

export const reportReasons = [
  { code: 'incorrect', label: 'The answer looks incorrect' },
  { code: 'unclear', label: 'The question is unclear' },
  { code: 'mismatch', label: 'It doesn’t match how we do it here' },
  { code: 'other', label: 'Something else' },
] as const

export type ReportReason = typeof reportReasons[number]['code']
