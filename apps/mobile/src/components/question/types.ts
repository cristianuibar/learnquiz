import type { Answer, ItemView } from '@learnquiz/api'

export type QuestionBodyProps = {
  item: ItemView
  answer: Answer
  onAnswer(answer: Answer): void
  marks: Record<string, 'correct' | 'wrong' | 'rest'> | null
  disabled: boolean
  onSubmit?(): void
}
