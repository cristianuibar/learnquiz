import { Check } from 'lucide-react'
import { weekdayLabel } from '@learnquiz/api/settings'
import { cn } from '@/lib/utils'

export function DaysToggles({ available, days, disabled, notice, onToggle }: {
  available: number[]; days: number[]; disabled?: boolean; notice?: string; onToggle: (day: number) => void
}) {
  return (
    <div className="flex flex-col gap-2">
      <p id="settings-days" className="text-label text-ink">Days</p>
      <div role="group" aria-labelledby="settings-days" className="flex flex-wrap gap-2">
        {available.map((day) => {
          const on = days.includes(day)
          return (
            <button
              key={day}
              type="button"
              aria-pressed={on}
              disabled={disabled}
              onClick={() => onToggle(day)}
              className={cn(
                'inline-flex min-h-12 min-w-12 items-center justify-center gap-1 rounded-md border-2 px-3 text-label focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-brand disabled:opacity-60',
                on ? 'border-brand bg-brand-tint text-ink' : 'border-border-strong bg-surface-card text-ink',
              )}
            >
              {on && <Check aria-hidden className="size-4" />}
              {weekdayLabel(day)}
            </button>
          )
        })}
      </div>
      <p role="status" className="text-caption text-ink-muted empty:hidden">{notice}</p>
    </div>
  )
}
