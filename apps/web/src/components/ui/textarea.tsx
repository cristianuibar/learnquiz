import * as React from "react"
import { cn } from "@/lib/utils"

function Textarea({ className, ...props }: React.ComponentProps<"textarea">) {
  return (
    <textarea
      data-slot="textarea"
      className={cn(
        "flex field-sizing-content min-h-12 w-full min-w-0 rounded-md border-2 border-border-strong bg-surface-card px-4 py-3 text-body-lg leading-6 text-ink placeholder:text-ink-muted transition-colors duration-fast ease-out selection:bg-brand selection:text-on-brand focus-visible:border-brand aria-invalid:border-feedback-wrong disabled:cursor-not-allowed disabled:border-dashed disabled:bg-surface-sunken disabled:text-ink-muted",
        className
      )}
      {...props}
    />
  )
}

export { Textarea }
