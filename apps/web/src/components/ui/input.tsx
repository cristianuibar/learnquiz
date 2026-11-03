import * as React from "react"
import { cn } from "@/lib/utils"

function Input({ className, type, ...props }: React.ComponentProps<"input">) {
  return (
    <input
      type={type}
      data-slot="input"
      className={cn(
        "min-h-12 w-full min-w-0 rounded-md border-2 border-border-strong bg-surface-card px-4 py-3 text-body-lg leading-6 text-ink placeholder:text-ink-muted transition-colors duration-fast ease-out selection:bg-brand selection:text-on-brand focus-visible:border-brand aria-invalid:border-feedback-wrong disabled:cursor-not-allowed disabled:border-dashed disabled:bg-surface-sunken disabled:text-ink-muted file:inline-flex file:border-0 file:bg-transparent file:text-label file:text-ink",
        className
      )}
      {...props}
    />
  )
}

export { Input }
