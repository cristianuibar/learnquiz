import * as React from "react"
import { ChevronDown } from "lucide-react"
import { cn } from "@/lib/utils"

function Select({ className, children, ...props }: React.ComponentProps<"select">) {
  return (
    <span className="relative block">
      <select
        data-slot="select"
        className={cn(
          "min-h-12 w-full min-w-0 appearance-none rounded-md border-2 border-border-strong bg-surface-card py-3 pr-10 pl-4 text-body-lg leading-6 text-ink transition-colors duration-fast ease-out focus-visible:border-brand aria-invalid:border-ink disabled:cursor-not-allowed disabled:border-dashed disabled:bg-surface-sunken disabled:text-ink-muted",
          className
        )}
        {...props}
      >
        {children}
      </select>
      <ChevronDown
        aria-hidden="true"
        className="pointer-events-none absolute top-1/2 right-3 size-5 -translate-y-1/2 text-ink-muted"
      />
    </span>
  )
}

export { Select }
