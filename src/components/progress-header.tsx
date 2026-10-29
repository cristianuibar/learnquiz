import { Link } from '@tanstack/react-router'
import { X } from 'lucide-react'
import { Progress } from '@/components/ui/progress'

export function ProgressHeader({
  topicId,
  position,
  total,
  placement,
}: {
  topicId: string
  position: number
  total: number
  placement: boolean
}) {
  return (
    <div className="flex items-center gap-3">
      <Link
        to="/t/$topicId/path"
        params={{ topicId }}
        aria-label="Close"
        className="-ml-3 flex size-12 shrink-0 items-center justify-center rounded-md outline-none hover:bg-accent focus-visible:ring-[3px] focus-visible:ring-ring/50"
      >
        <X className="size-5" aria-hidden />
      </Link>
      <Progress
        value={(position / total) * 100}
        aria-label="Progress"
        className="h-1.5 min-w-8 flex-1 *:motion-reduce:transition-none"
      />
      <span className="shrink-0 text-sm font-medium tabular-nums">
        {placement ? `Finding your level, ${position} of ${total}` : `${position} / ${total}`}
      </span>
    </div>
  )
}
