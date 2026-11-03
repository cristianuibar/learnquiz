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
}: {
  name: string
  legend: string
  legendClassName?: string
  options: readonly { id: string; text: string }[]
  value: string | null
  onChange: (id: string) => void
  className?: string
  itemClassName?: string
}) {
  return (
    <fieldset>
      <legend className={cn('mb-3 p-0 text-sm font-medium', legendClassName)}>{legend}</legend>
      <div className={className}>
        {options.map((o) => (
          <label
            key={o.id}
            className={cn(
              'flex min-h-12 cursor-pointer items-center rounded-lg border bg-background px-4 py-2 hover:bg-accent has-checked:border-primary has-checked:bg-accent has-checked:font-medium has-focus-visible:ring-[3px] has-focus-visible:ring-ring/50',
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
            {o.text}
          </label>
        ))}
      </div>
    </fieldset>
  )
}
