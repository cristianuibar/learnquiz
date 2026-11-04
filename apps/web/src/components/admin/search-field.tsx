import { Search } from 'lucide-react'
import type { ComponentProps } from 'react'
import { Input } from '@/components/ui/input'
import { cn } from '@/lib/utils'

/** Labelled search input with a leading icon; `ref` reaches the input so empty states can focus it. */
export function SearchField({ label, hideLabel = true, ref, className, ...inputProps }: Omit<ComponentProps<'input'>, 'type'> & {
  label: string
  hideLabel?: boolean
}) {
  return (
    <label className={cn('relative block w-full max-w-[400px]', className)}>
      <span className={hideLabel ? 'sr-only' : 'mb-1 block text-label'}>{label}</span>
      <span className="relative block">
        <Search aria-hidden className="pointer-events-none absolute top-1/2 left-4 size-5 -translate-y-1/2 text-ink-muted" />
        <Input type="search" placeholder={label} className="pl-11" ref={ref} {...inputProps} />
      </span>
    </label>
  )
}
