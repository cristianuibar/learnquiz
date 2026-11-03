import { useEffect, useState } from 'react'
import { initials } from '@learnquiz/api/invite'
import { cn } from '@/lib/utils'

export function OrgMark({ name, logoUrl, branded = false, className }: { name: string; logoUrl?: string | null; branded?: boolean; className?: string }) {
  const [failed, setFailed] = useState(false)
  useEffect(() => setFailed(false), [logoUrl])

  if (logoUrl && !failed) {
    // Decorative: the caller shows the org name next to it.
    return <img src={logoUrl} alt="" className={cn('size-8 shrink-0 rounded-md object-cover', className)} onError={() => setFailed(true)} />
  }
  return (
    <span
      aria-hidden="true"
      className={cn(
        'inline-flex size-8 shrink-0 items-center justify-center rounded-md text-[13px] font-bold leading-none tracking-[-0.02em]',
        branded ? 'bg-brand text-on-brand' : 'bg-ink text-surface-page',
        className,
      )}
    >
      {initials(name)}
    </span>
  )
}
