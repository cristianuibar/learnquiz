import { useRef, useState } from 'react'
import { Button } from '@/components/ui/button'
import type { QuestionProps } from '@/components/question/question-screen'
import { cn } from '@/lib/utils'

// Tap the steps in order: a tap appends an unplaced step or removes a placed one.
export function OrderQuestion({ item, choice, onChoice }: QuestionProps) {
  const ids = new Set(item.options.map((o) => o.id))
  const placed = choice ? choice.split(',').filter((id) => ids.has(id)) : []
  const [announcement, setAnnouncement] = useState('')
  const first = useRef<HTMLButtonElement>(null)

  const tap = (id: string, text: string) => {
    const at = placed.indexOf(id)
    const next = at === -1 ? [...placed, id] : placed.filter((p) => p !== id)
    setAnnouncement(at === -1 ? `${text}, ${next.length} of ${item.options.length}` : '')
    onChoice(next.join(','))
  }
  const clear = () => {
    setAnnouncement('')
    onChoice('')
    first.current?.focus()
  }

  return (
    <div>
      <div className="mb-3 flex min-h-12 items-center justify-between gap-3">
        <p className="text-caption text-ink-muted">Tap the steps in order</p>
        {placed.length > 0 && (
          <Button type="button" variant="ghost" onClick={clear} className="-my-3 -mr-4">
            Clear
          </Button>
        )}
      </div>
      <ul aria-label={item.stem} className="flex flex-col gap-3">
        {item.options.map((o, i) => {
          const at = placed.indexOf(o.id)
          return (
            <li key={o.id}>
              <button
                ref={i === 0 ? first : undefined}
                type="button"
                aria-label={at === -1 ? `${o.text}, not placed yet` : `${o.text}, position ${at + 1}`}
                onClick={() => tap(o.id, o.text)}
                className={cn(
                  'flex min-h-14 w-full items-center gap-3 rounded-md border-2 px-4 py-3 text-left text-body-lg text-ink hover:bg-surface-sunken focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand focus-visible:ring-offset-2',
                  at !== -1 ? 'border-brand bg-brand-tint' : 'border-border-strong bg-surface-card',
                )}
              >
                <span
                  aria-hidden
                  className={
                    at === -1
                      ? 'inline-flex size-7 flex-none items-center justify-center rounded-full border-2 border-dashed border-border-strong'
                      : 'inline-flex size-7 flex-none items-center justify-center rounded-full border-2 border-brand bg-brand text-label text-on-brand tabular-nums'
                  }
                >
                  {at === -1 ? null : at + 1}
                </span>
                <span>{o.text}</span>
              </button>
            </li>
          )
        })}
      </ul>
      <p role="status" aria-live="polite" className="sr-only">{announcement}</p>
    </div>
  )
}
