import type * as React from 'react'
import { cn } from '@/lib/utils'

export function Switch({
  checked,
  onCheckedChange,
  className,
  disabled,
  ...props
}: Omit<React.ComponentProps<'button'>, 'onChange'> & {
  checked: boolean
  onCheckedChange: (checked: boolean) => void
}) {
  return (
    <button
      type="button"
      role="switch"
      aria-checked={checked}
      disabled={disabled}
      onClick={() => onCheckedChange(!checked)}
      className={cn(
        "relative inline-flex h-6 w-11 shrink-0 items-center rounded-full border-2 before:absolute before:-inset-2 before:content-[''] motion-safe:transition-colors motion-safe:duration-fast motion-safe:ease-out focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-brand",
        checked ? 'border-brand bg-brand' : 'border-border-strong bg-surface-sunken',
        disabled && 'cursor-not-allowed border-dashed',
        className,
      )}
      {...props}
    >
      <span
        aria-hidden
        className={cn(
          'pointer-events-none block size-4 rounded-full motion-safe:transition-transform motion-safe:duration-fast motion-safe:ease-out',
          checked ? 'translate-x-5.5 bg-on-brand' : 'translate-x-0.5 bg-border-strong',
        )}
      />
    </button>
  )
}
