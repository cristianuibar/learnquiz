import { CircleAlert, Info, type LucideIcon } from 'lucide-react'
import type { ReactNode } from 'react'
import { cn } from '@/lib/utils'

/** Info (brand tint) or alert (sunken ground, full strong border). No red, no stripes. */
export function Banner({ kind = 'info', icon, action, children, className }: {
  kind?: 'info' | 'alert'
  icon?: LucideIcon
  action?: ReactNode
  children: ReactNode
  className?: string
}) {
  const Icon = icon ?? (kind === 'alert' ? CircleAlert : Info)
  return (
    <div
      role={kind === 'alert' ? 'alert' : undefined}
      className={cn(
        'flex min-h-14 flex-wrap items-center gap-3 rounded-md px-4 py-3 text-body text-ink',
        kind === 'alert' ? 'border border-border-strong bg-surface-sunken' : 'bg-brand-tint',
        className,
      )}
    >
      <Icon aria-hidden className={cn('size-5 shrink-0', kind === 'alert' ? 'text-ink' : 'text-brand')} />
      <div className="min-w-0 flex-[1_1_200px]">{children}</div>
      {action}
    </div>
  )
}
