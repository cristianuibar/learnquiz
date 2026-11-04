import { CircleAlert } from 'lucide-react'
import type { ReactNode } from 'react'

export function fieldProps(id: string, error?: string) {
  return error
    ? { 'aria-invalid': true as const, 'aria-describedby': `${id}-error` }
    : { 'aria-invalid': undefined, 'aria-describedby': undefined }
}

/** `quiet` drops role="alert" for messages that persist in a list rather than appear in response to input. */
export function FieldError({ id, children, quiet }: { id: string; children: ReactNode; quiet?: boolean }) {
  return (
    <p id={`${id}-error`} role={quiet ? undefined : 'alert'} className="flex items-start gap-2 text-label text-ink">
      <CircleAlert aria-hidden className="mt-0.5 size-4 shrink-0" />
      <span>{children}</span>
    </p>
  )
}
