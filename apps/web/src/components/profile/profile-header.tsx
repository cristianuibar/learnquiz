import type { ReactNode } from 'react'
import { Eye } from 'lucide-react'
import { cn } from '@/lib/utils'

export function ProfileHeader({
  name,
  role,
  self,
  trailing,
}: {
  name: string
  role: string | null
  self: boolean
  trailing?: ReactNode
}) {
  return (
    <header className="flex flex-col gap-1">
      {/* The trailing icon button's 12 px inner inset lines its glyph up with the content edge. */}
      <div className={cn('flex items-center justify-between gap-2', trailing && '-mr-3')}>
        <h1 tabIndex={-1} className="text-title-1 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-brand">
          Training progress
        </h1>
        {trailing}
      </div>
      <p className="text-body">{[name, role].filter(Boolean).join(' · ')}</p>
      {self && (
        <p className="flex items-center gap-2 text-caption text-ink-muted">
          <Eye aria-hidden className="size-4 shrink-0" />
          Your company's training admins see this same page.
        </p>
      )}
    </header>
  )
}
