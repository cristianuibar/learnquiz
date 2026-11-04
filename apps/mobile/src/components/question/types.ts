import type { Answer, ItemView } from '@learnquiz/api'

export type QuestionBodyProps = {
  item: ItemView
  answer: Answer
  onAnswer(answer: Answer): void
  marks: Record<string, 'correct' | 'wrong' | 'rest'> | null
  disabled: boolean
  onSubmit?(): void
  // Set only when the session offers voice answers (never for role topics).
  voiceSessionId?: string | null
}
