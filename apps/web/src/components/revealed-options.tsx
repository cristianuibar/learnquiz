import { Check, X } from 'lucide-react'
import { cn } from '@/lib/utils'
import { optionMarks, revealCopy } from '@learnquiz/api/reveal'
import type { Answer, ItemView, Reveal } from '@learnquiz/api'

export function RevealedOptions({
  item,
  answer,
  reveal,
}: {
  item: ItemView
  answer: Answer
  reveal: Reveal
}) {
  const marks = optionMarks(reveal, answer.optionIds ?? (answer.optionId ? [answer.optionId] : []))
  return (
    <ul className="flex flex-col gap-2">
      {item.options.map((o) => {
        const mark = marks[o.id]
        return (
          <li
            key={o.id}
            className={cn(
              'flex min-h-14 items-center gap-3 rounded-md border-2 px-4 py-3 text-body-lg',
              mark === 'correct' && 'border-feedback-correct bg-feedback-correct-tint text-ink',
              mark === 'wrong' && 'border-feedback-wrong bg-feedback-wrong-tint text-ink',
              (mark === 'rest' || !mark) && 'border-border bg-surface-card text-ink-muted',
            )}
          >
            {mark === 'correct' && <Check aria-hidden className="size-5 shrink-0 text-feedback-correct" />}
            {mark === 'wrong' && <X aria-hidden className="size-5 shrink-0 text-feedback-wrong" />}
            {mark !== 'correct' && mark !== 'wrong' && item.format === 'multi' && (
              <span aria-hidden className="size-5 shrink-0 rounded-sm border-2 border-border-strong" />
            )}
            <span className="flex-1">{o.text}</span>
            {mark === 'correct' && <span className="text-label text-feedback-correct">{revealCopy.correct}</span>}
            {mark === 'wrong' && <span className="text-label text-feedback-wrong">{revealCopy.notQuite}</span>}
          </li>
        )
      })}
    </ul>
  )
}
