import type { Answer, ItemView, Reveal } from '@learnquiz/api'
import { revealCopy } from '@learnquiz/api/reveal'

// Copy the not-quite and sure-and-wrong bodies need that `revealCopy` does not carry yet.
export const wrongRevealCopy = {
  theOrder: 'The order',
  yourOrder: 'Your order',
  missingPoints: 'Missing points',
} as const

export const MAX_MIX_UPS = 2

export type PairTone = 'correct' | 'wrong'

export type RevealPair =
  | { tone: PairTone; label: string; kind: 'text'; value: string }
  | { tone: PairTone; label: string; kind: 'list'; items: string[] }

export type WrongReveal = {
  /** Answer pairs in display order: the right answer and the learner's. */
  pairs: RevealPair[]
  /** notQuite only: why the chosen option is wrong, under the second pair; the explanation when there is no option feedback. */
  note: string | null
  /** Short answers: the grader's feedback sentence. */
  feedback: string | null
  /** Short answers: the points the learner missed. */
  missingPoints: string[]
  /** sureWrong only. A null heading means the lines are the chosen-option feedback shown without a heading. */
  whyItFeltRight: { heading: string | null; lines: string[] } | null
  /** sureWrong only: the explanation. */
  whatActuallyMatters: string | null
  critical: boolean
  returnsThisSession: boolean
}

const clean = (text: string | null | undefined) => text?.trim() || null

/** The caption over the learner's answer, by item format. */
export function yourAnswerLabel(format: ItemView['format']): string {
  switch (format) {
    case 'mcq':
    case 'multi': return revealCopy.youChose
    case 'cloze': return revealCopy.youWrote
    case 'short': return revealCopy.yourAnswer
    case 'order': return wrongRevealCopy.yourOrder
  }
}

/** The learner's answer as text: option text for choices, the typed text otherwise. */
export function yourAnswerText(item: ItemView, answer: Answer): string | null {
  const optionText = (id: string) => item.options.find((option) => option.id === id)?.text ?? null
  switch (item.format) {
    case 'mcq': return answer.optionId ? optionText(answer.optionId) : null
    case 'multi': {
      const texts = (answer.optionIds ?? []).map(optionText).filter((text): text is string => text !== null)
      return texts.length ? texts.join(', ') : null
    }
    case 'cloze':
    case 'short': return clean(answer.text)
    case 'order': return null
  }
}

/** "The order" and "Your order" lists. Uses `detail.steps` when present, else the learner's submitted order. */
export function orderLists(reveal: Reveal, item: ItemView, answer: Answer): { theOrder: string[] | null; yourOrder: string[] } {
  if (reveal.detail?.kind === 'order') {
    const steps = reveal.detail.steps
    return {
      theOrder: steps.map((step) => step.text),
      yourOrder: steps.filter((step) => step.yourPosition > 0).sort((a, b) => a.yourPosition - b.yourPosition).map((step) => step.text),
    }
  }
  const yourOrder = (answer.order ?? [])
    .map((id) => item.options.find((option) => option.id === id)?.text)
    .filter((text): text is string => text !== undefined)
  return { theOrder: null, yourOrder }
}

/** Up to two non-empty mix-up lines. */
export function mixUpLines(mixUps: readonly string[]): string[] {
  return mixUps.map((line) => line.trim()).filter(Boolean).slice(0, MAX_MIX_UPS)
}

function answerPairs(reveal: Reveal, item: ItemView, answer: Answer): RevealPair[] {
  const theAnswer: RevealPair = { tone: 'correct', label: revealCopy.theAnswer, kind: 'text', value: reveal.correctAnswer }

  if (item.format === 'order') {
    const { theOrder, yourOrder } = orderLists(reveal, item, answer)
    const right: RevealPair = theOrder?.length ? { tone: 'correct', label: wrongRevealCopy.theOrder, kind: 'list', items: theOrder } : theAnswer
    return yourOrder.length ? [right, { tone: 'wrong', label: wrongRevealCopy.yourOrder, kind: 'list', items: yourOrder }] : [right]
  }

  const yours = yourAnswerText(item, answer)
  if (yours === null) return [theAnswer]
  const yourPair: RevealPair = { tone: 'wrong', label: yourAnswerLabel(item.format), kind: 'text', value: yours }
  // A short answer reads the learner's own words first.
  return item.format === 'short' ? [yourPair, theAnswer] : [theAnswer, yourPair]
}

export function wrongReveal(reveal: Reveal, item: ItemView, answer: Answer, variant: 'notQuite' | 'sureWrong'): WrongReveal {
  const sure = variant === 'sureWrong'
  const chosenFeedback = clean(reveal.chosenFeedback)
  const short = item.format === 'short'
  const mixUps = mixUpLines(reveal.mixUps)

  return {
    pairs: answerPairs(reveal, item, answer),
    note: sure ? null : chosenFeedback ?? clean(reveal.explanation),
    feedback: short ? clean(reveal.feedback) : null,
    missingPoints: short ? reveal.missingPoints.map((point) => point.trim()).filter(Boolean) : [],
    whyItFeltRight: !sure ? null
      : mixUps.length ? { heading: revealCopy.whyItFeltRight, lines: mixUps }
      : chosenFeedback ? { heading: null, lines: [chosenFeedback] }
      : null,
    whatActuallyMatters: sure ? clean(reveal.explanation) : null,
    critical: sure && reveal.critical,
    returnsThisSession: reveal.returnsThisSession,
  }
}
