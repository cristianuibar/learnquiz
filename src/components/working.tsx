import { Check, Loader2 } from 'lucide-react'

export function Working({ label, done }: { label: string; done?: boolean }) {
  return (
    <p role="status" className="flex items-center gap-3 font-medium">
      {done ? (
        <Check className="size-5 text-correct" aria-hidden />
      ) : (
        <Loader2 className="size-5 animate-spin text-learning motion-reduce:animate-none" aria-hidden />
      )}
      {done ? 'Ready' : label}
    </p>
  )
}
