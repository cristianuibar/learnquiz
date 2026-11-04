import { Check, type LucideIcon } from 'lucide-react'
import * as React from 'react'
import { cn } from '@/lib/utils'

type SegmentedOption<T> = { value: T; label: React.ReactNode; icon?: LucideIcon }
type SegmentedProps<T extends string> = {
  options: SegmentedOption<T>[]
  className?: string
  'aria-label'?: string
  'aria-labelledby'?: string
} & (
  | { mode: 'radiogroup'; value: T; onValueChange: (value: T) => void }
  | { mode: 'toggle'; value: T[]; onValueChange: (value: T[]) => void }
)

const buttonBase =
  'inline-flex min-h-11 items-center justify-center gap-2 rounded-[6px] px-3 text-label motion-safe:transition-colors motion-safe:duration-fast motion-safe:ease-out focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-brand'

export function Segmented<T extends string>(props: SegmentedProps<T>) {
  const { options, className, 'aria-label': ariaLabel, 'aria-labelledby': ariaLabelledby } = props
  const refs = React.useRef<(HTMLButtonElement | null)[]>([])
  const containerClass = cn(
    'inline-flex gap-0.5 rounded-md border border-border-strong bg-surface-card p-0.5',
    className,
  )

  if (props.mode === 'toggle') {
    const { value, onValueChange } = props
    return (
      <div role="group" aria-label={ariaLabel} aria-labelledby={ariaLabelledby} className={containerClass}>
        {options.map((o) => {
          const pressed = value.includes(o.value)
          const Icon = o.icon
          return (
            <button
              key={o.value}
              type="button"
              aria-pressed={pressed}
              onClick={() =>
                onValueChange(
                  options.map((x) => x.value).filter((v) => (v === o.value ? !pressed : value.includes(v))),
                )
              }
              className={cn(buttonBase, pressed ? 'bg-brand-tint text-ink' : 'text-ink-muted')}
            >
              {pressed ? <Check aria-hidden className="size-4 text-brand" /> : null}
              {Icon ? <Icon aria-hidden className={cn('size-4', pressed && 'text-brand')} /> : null}
              {o.label}
            </button>
          )
        })}
      </div>
    )
  }

  const { value, onValueChange } = props
  const checkedIndex = options.findIndex((o) => o.value === value)
  const tabIndex = checkedIndex === -1 ? 0 : checkedIndex

  function onKeyDown(e: React.KeyboardEvent, index: number) {
    const n = options.length
    let next: number
    if (e.key === 'ArrowRight' || e.key === 'ArrowDown') next = (index + 1) % n
    else if (e.key === 'ArrowLeft' || e.key === 'ArrowUp') next = (index - 1 + n) % n
    else if (e.key === 'Home') next = 0
    else if (e.key === 'End') next = n - 1
    else return
    e.preventDefault()
    onValueChange(options[next].value)
    refs.current[next]?.focus()
  }

  return (
    <div role="radiogroup" aria-label={ariaLabel} aria-labelledby={ariaLabelledby} className={containerClass}>
      {options.map((o, i) => {
        const checked = i === checkedIndex
        const Icon = o.icon
        return (
          <button
            key={o.value}
            ref={(el) => {
              refs.current[i] = el
            }}
            type="button"
            role="radio"
            aria-checked={checked}
            tabIndex={i === tabIndex ? 0 : -1}
            onClick={() => onValueChange(o.value)}
            onKeyDown={(e) => onKeyDown(e, i)}
            className={cn(buttonBase, checked ? 'bg-brand-tint text-ink' : 'text-ink-muted')}
          >
            {Icon ? <Icon aria-hidden className={cn('size-4', checked && 'text-brand')} /> : null}
            {o.label}
          </button>
        )
      })}
    </div>
  )
}
