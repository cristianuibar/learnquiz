import { Info } from 'lucide-react'

export function ErrorRow({ message }: { message: string }) {
  return (
    <div
      role="alert"
      className="flex items-start gap-3 rounded-md bg-surface-sunken px-4 py-3 text-body text-ink"
    >
      <Info className="mt-px size-5 shrink-0" aria-hidden />
      <p>{message}</p>
    </div>
  )
}
