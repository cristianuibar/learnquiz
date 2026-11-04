import { CircleAlert } from 'lucide-react'
import type { ReactNode } from 'react'

export function fieldProps(id: string, error?: string) {
  return error
    ? { 'aria-invalid': true as const, 'aria-describedby': `${id}-error` }
    : { 'aria-invalid': undefined, 'aria-describedby': undefined }
}

export function FieldError({ id, children }: { id: string; children: ReactNode }) {
  return (
    <p id={`${id}-error`} role="alert" className="flex items-start gap-2 text-label text-ink">
      <CircleAlert aria-hidden className="mt-0.5 size-4 shrink-0" />
      <span>{children}</span>
    </p>
  )
}
