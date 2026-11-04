import * as React from "react"
import { cn } from "@/lib/utils"

const inputClasses =
  "min-h-12 w-full min-w-0 rounded-md border-2 border-border-strong bg-surface-card px-4 py-3 text-body-lg leading-6 text-ink placeholder:text-ink-muted transition-colors duration-fast ease-out selection:bg-brand selection:text-on-brand focus-visible:border-brand aria-invalid:border-ink disabled:cursor-not-allowed disabled:border-dashed disabled:bg-surface-sunken disabled:text-ink-muted file:inline-flex file:border-0 file:bg-transparent file:text-label file:text-ink"

function Input({
  className,
  type,
  suffix,
  ...props
}: React.ComponentProps<"input"> & { suffix?: React.ReactNode }) {
  const generatedId = React.useId()
  if (suffix == null) {
    return (
      <input
        type={type}
        data-slot="input"
        className={cn(inputClasses, className)}
        {...props}
      />
    )
  }
  const suffixId = `${props.id ?? generatedId}-suffix`
  const describedBy =
    [props["aria-describedby"], suffixId].filter(Boolean).join(" ") || undefined
  return (
    <span className="relative block">
      <input
        type={type}
        data-slot="input"
        className={cn(inputClasses, "pr-10", className)}
        {...props}
        aria-describedby={describedBy}
      />
      <span
        id={suffixId}
        data-slot="input-suffix"
        className="pointer-events-none absolute top-1/2 right-3 -translate-y-1/2 text-ink-muted"
      >
        {suffix}
      </span>
    </span>
  )
}

export { Input }
