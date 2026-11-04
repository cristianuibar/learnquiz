import { Check, Shield } from 'lucide-react'
import type { ConceptStatus } from '@learnquiz/api/progress'
import { HalfDisc } from '@/components/status-icons'
import { Badge } from '@/components/ui/badge'

export const statusWord: Record<ConceptStatus, string> = { mastered: 'Mastered', learning: 'Still learning', not_started: 'Not started' }

export function ConceptChips({ status, critical }: { status: ConceptStatus; critical: boolean }) {
  return (
    <div className="flex flex-wrap items-center gap-2">
      {status === 'mastered' ? (
        <Badge className="min-h-7 border-feedback-correct bg-feedback-correct-tint pl-2 text-feedback-correct">
          <Check aria-hidden />
          Mastered
        </Badge>
      ) : status === 'learning' ? (
        <Badge className="min-h-7 border-feedback-learning bg-feedback-learning-tint pl-2 text-feedback-learning">
          <HalfDisc />
          Still learning
        </Badge>
      ) : (
        <Badge className="min-h-7 border-border bg-surface-sunken pl-2 text-ink-muted">
          <span aria-hidden className="size-3 rounded-full border-2 border-dotted border-current" />
          Not started
        </Badge>
      )}
      {critical && (
        <Badge className="min-h-7 pl-2">
          <Shield aria-hidden />
          Critical
        </Badge>
      )}
    </div>
  )
}
