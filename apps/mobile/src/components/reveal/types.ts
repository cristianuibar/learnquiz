import type { Answer, ItemView, Reveal } from '@learnquiz/api'
import type { RevealModel } from '@learnquiz/api/reveal'

export type RevealBodyProps = {
  model: RevealModel
  reveal: Reveal
  item: ItemView
  answer: Answer
  reflection: string
  onReflection(text: string): void
}
