import { cn } from '@/lib/utils'

/** Static placeholder block (no animation). */
export function Skel({ className, chip }: { className?: string; chip?: boolean }) {
  return <span aria-hidden className={cn('block bg-surface-sunken', chip ? 'h-7 w-20 rounded-full' : 'rounded-sm', className)} />
}

export function SkelLine({ className }: { className?: string }) {
  return <span aria-hidden className={cn('block h-3 rounded-sm bg-surface-sunken', className)} />
}
