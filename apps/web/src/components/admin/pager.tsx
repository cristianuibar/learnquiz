import { ChevronLeft, ChevronRight } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { cn } from '@/lib/utils'

const n = (v: number) => v.toLocaleString('en-US')

/** Table footer: range summary plus Previous/Next (disabled ends keep the dashed Button style). */
export function Pager({ from, to, total, noun, page, onPrevious, onNext, className }: {
  from: number
  to: number
  total: number
  noun: string
  page: number
  onPrevious: () => void
  onNext: () => void
  className?: string
}) {
  return (
    <nav aria-label="Pages" className={cn('flex flex-wrap items-center justify-between gap-4 border-t border-border py-2 pr-2 pl-4', className)}>
      <p role="status" className="text-[13px] tabular-nums text-ink-muted">{`${n(from)}–${n(to)} of ${n(total)} ${noun}`}</p>
      <div className="flex gap-2">
        <Button variant="secondary" disabled={page <= 1 || from <= 1} onClick={onPrevious}>
          <ChevronLeft aria-hidden />Previous
        </Button>
        <Button variant="secondary" disabled={to >= total} onClick={onNext}>
          Next<ChevronRight aria-hidden />
        </Button>
      </div>
    </nav>
  )
}
