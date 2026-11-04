import * as React from "react"
import { cva, type VariantProps } from "class-variance-authority"
import { cn } from "@/lib/utils"
import { Slot } from "radix-ui"

const buttonVariants = cva(
  "inline-flex shrink-0 items-center justify-center gap-2 rounded-md border-2 border-transparent text-label whitespace-nowrap transition-colors duration-fast ease-out disabled:cursor-not-allowed disabled:border-dashed disabled:border-border-strong disabled:bg-surface-sunken disabled:text-ink-muted disabled:hover:bg-surface-sunken [&_svg]:pointer-events-none [&_svg]:shrink-0 [&_svg:not([class*='size-'])]:size-5",
  {
    variants: {
      variant: {
        primary: "bg-brand text-on-brand hover:bg-brand-hover",
        danger: "bg-surface-inverse text-on-inverse hover:bg-ink-muted",
        accent: "bg-accent text-on-accent hover:bg-accent-hover",
        secondary:
          "border-border-strong bg-surface-card text-ink hover:bg-surface-sunken",
        ghost: "text-brand hover:bg-brand-tint",
        link: "text-brand underline-offset-4 hover:underline",
      },
      size: {
        default: "min-h-12 px-4 py-2",
        lg: "min-h-14 px-6 text-label-lg",
        icon: "size-12",
      },
    },
    defaultVariants: {
      variant: "primary",
      size: "default",
    },
  }
)

function Button({
  className,
  variant = "primary",
  size = "default",
  asChild = false,
  ...props
}: React.ComponentProps<"button"> &
  VariantProps<typeof buttonVariants> & {
    asChild?: boolean
  }) {
  const Comp = asChild ? Slot.Root : "button"

  return (
    <Comp
      data-slot="button"
      data-variant={variant}
      data-size={size}
      className={cn(buttonVariants({ variant, size, className }))}
      {...props}
    />
  )
}

export { Button, buttonVariants }
