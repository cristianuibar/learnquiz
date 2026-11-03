import { useId } from 'react'
import { Check } from 'lucide-react'
import type { QuestionProps } from '@/components/question/question-screen'
import { cn } from '@/lib/utils'

// Select-all question: each option is a checkbox button (one tab stop each, Space/Enter toggle).
// The answer is the selected ids in option order, joined by ','.
export function MultiQuestion({ item, choice, onChoice }: QuestionProps) {
  const captionId = useId()
  const selected = new Set(choice ? choice.split(',') : [])
  const toggle = (id: string) => {
    const next = new Set(selected)
    if (!next.delete(id)) next.add(id)
    onChoice(item.options.filter((o) => next.has(o.id)).map((o) => o.id).join(','))
  }
  return (
    <>
      <p id={captionId} className="text-caption text-ink-muted">Choose all that apply</p>
      <div role="group" aria-label={item.stem} aria-describedby={captionId} className="flex flex-col gap-3">
        {item.options.map((o) => {
          const on = selected.has(o.id)
          return (
            <button
              key={o.id}
              type="button"
              role="checkbox"
              aria-checked={on}
              onClick={() => toggle(o.id)}
              className={cn(
                'flex min-h-14 w-full cursor-pointer items-center gap-3 rounded-md border-2 px-4 py-3 text-left text-body-lg text-ink hover:bg-surface-sunken focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand focus-visible:ring-offset-2',
                on ? 'border-brand bg-brand-tint' : 'border-border-strong bg-surface-card',
              )}
            >
              <span
                aria-hidden
                className={cn('flex size-5 shrink-0 items-center justify-center rounded-sm border-2', on ? 'border-brand bg-brand' : 'border-border-strong')}
              >
                {on && <Check aria-hidden className="size-4 text-on-brand" />}
              </span>
              <span>{o.text}</span>
            </button>
          )
        })}
      </div>
    </>
  )
}
