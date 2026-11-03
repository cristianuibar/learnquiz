import { Check } from 'lucide-react'
import { cn } from '@/lib/utils'

// Native radios inside labels give arrow-key movement and one tab stop for free.
export function ChoiceGroup({
  name,
  legend,
  legendClassName,
  options,
  value,
  onChange,
  className,
  itemClassName,
  indicator = 'radio',
}: {
  name: string
  legend: string
  legendClassName?: string
  options: readonly { id: string; text: string }[]
  value: string | null
  onChange: (id: string) => void
  className?: string
  itemClassName?: string
  indicator?: 'radio' | 'check'
}) {
  const check = indicator === 'check'
  return (
    <fieldset>
      <legend className={cn('mb-3 p-0 text-label text-ink', legendClassName)}>{legend}</legend>
      <div className={className}>
        {options.map((o) => (
          <label
            key={o.id}
            className={cn(
              'group flex cursor-pointer items-center rounded-md border-2 border-border-strong bg-surface-card text-ink hover:bg-surface-sunken has-checked:border-brand has-checked:bg-brand-tint has-focus-visible:ring-2 has-focus-visible:ring-brand has-focus-visible:ring-offset-2',
              check
                ? 'min-h-12 justify-center gap-1.5 px-4 text-label font-semibold'
                : 'min-h-14 gap-3 px-4 py-3 text-body-lg',
              itemClassName,
            )}
          >
            <input
              type="radio"
              name={name}
              value={o.id}
              checked={value === o.id}
              onChange={() => onChange(o.id)}
              className="sr-only"
            />
            {check ? (
              <Check aria-hidden className="hidden size-4 text-brand group-has-checked:block" />
            ) : (
              <span
                aria-hidden
                className="size-5 shrink-0 rounded-full border-2 border-border-strong group-has-checked:border-brand group-has-checked:bg-brand group-has-checked:shadow-[inset_0_0_0_3px_var(--color-brand-tint)]"
              />
            )}
            <span>{o.text}</span>
          </label>
        ))}
      </div>
    </fieldset>
  )
}
