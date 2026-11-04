import { useRef } from 'react'
import { Check } from 'lucide-react'
import { cn } from '@/lib/utils'

export type Theme = 'system' | 'light' | 'dark'
const OPTIONS: { value: Theme; label: string }[] = [
  { value: 'system', label: 'System' },
  { value: 'light', label: 'Light' },
  { value: 'dark', label: 'Dark' },
]

export function AppearanceControl({ value, onChange }: { value: Theme; onChange: (theme: Theme) => void }) {
  const refs = useRef<(HTMLButtonElement | null)[]>([])
  function move(event: React.KeyboardEvent, index: number) {
    const step = event.key === 'ArrowRight' || event.key === 'ArrowDown' ? 1 : event.key === 'ArrowLeft' || event.key === 'ArrowUp' ? -1 : 0
    if (!step) return
    event.preventDefault()
    const next = (index + step + OPTIONS.length) % OPTIONS.length
    onChange(OPTIONS[next].value)
    refs.current[next]?.focus()
  }
  return (
    <div role="radiogroup" aria-label="Appearance" className="flex gap-2">
      {OPTIONS.map((option, index) => {
        const selected = option.value === value
        return (
          <button
            key={option.value}
            ref={(el) => { refs.current[index] = el }}
            type="button"
            role="radio"
            aria-checked={selected}
            tabIndex={selected ? 0 : -1}
            onClick={() => onChange(option.value)}
            onKeyDown={(event) => move(event, index)}
            className={cn(
              'inline-flex min-h-12 flex-1 items-center justify-center gap-1 rounded-md border-2 px-3 text-label focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-brand',
              selected ? 'border-brand bg-brand-tint text-ink' : 'border-border-strong bg-surface-card text-ink',
            )}
          >
            {selected && <Check aria-hidden className="size-4" />}
            {option.label}
          </button>
        )
      })}
    </div>
  )
}
