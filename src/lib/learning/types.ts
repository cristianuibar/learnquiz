// Shared shapes for the play loop. The client only ever sees ItemView: answers stay on the server until the reveal.

export type Confidence = 'sure' | 'unsure' | 'guess'

export type ItemView = {
  id: string
  conceptId: string
  conceptName: string
  format: 'mcq' | 'cloze' | 'short'
  stem: string
  options: { id: string; text: string }[] // mcq only, shuffled server-side
  difficulty: number
}

// Learner answer: mcq sends the option id, cloze and short send text.
export type Answer = { optionId?: string; text?: string }

// (correct, confidence) decides the reveal state: A correct+sure, B correct+unsure/guess, C wrong+unsure/guess, D wrong+sure.
export type RevealState = 'A' | 'B' | 'C' | 'D'

export type Reveal = {
  attemptId: string
  state: RevealState
  correct: boolean
  correctAnswer: string // option text, or accepted answers joined with " / "
  chosenFeedback: string | null // why the chosen option is wrong (mcq, states C and D)
  explanation: string
  sourceQuote: string | null
  mixUps: string[] // state D only: the concept's common mistakes
  returnsThisSession: boolean // states C and D: the item re-enters later
  pKnownBefore: number
  pKnownAfter: number
}

export type Progress = { position: number; total: number } // 1-based position of the current item

export type SessionView = {
  id: string
  kind: 'session' | 'placement' | 'mock' | 'mini'
  topicId: string
  topicTitle: string
  progress: Progress
  item: ItemView | null // null when the session has ended
  ended: boolean
}

export type SummaryView = {
  sessionId: string
  kind: SessionView['kind']
  topicId: string
  durationMs: number
  correct: number
  total: number
  xp: number
  streak: number
  level: number | null // placement result, or the current level
  levelLine: string | null // two sentences: what you know, where you will grow
  masteryMoved: { unitId: string; unitName: string; before: number; after: number }[]
  mistakes: { itemId: string; stem: string; correctAnswer: string; wasSure: boolean }[]
  nextLine: string // coach: what happens next time
}
