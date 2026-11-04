import type { ReactNode } from 'react'
import { Button } from '@/components/ui/button'

/** Selection bar above the table; the parent decides when to show it. */
export function BulkBar({ count, children, onClear }: { count: number; children?: ReactNode; onClear: () => void }) {
  return (
    <div role="region" aria-label="Bulk actions" className="flex min-h-[60px] items-center gap-3 rounded-t-md border-b border-border bg-brand-tint py-2 pr-2 pl-4">
      <p role="status" className="text-label tabular-nums">{count} selected</p>
      {children}
      <Button variant="ghost" className="ml-auto" onClick={onClear}>Clear selection</Button>
    </div>
  )
}
