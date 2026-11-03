import { RotateCw } from 'lucide-react'
import type { Confidence } from '@learnquiz/api'
import { ConfidencePicker } from '@/components/confidence-picker'
import { Button } from '@/components/ui/button'

export function QuestionDock({
  confidence,
  onConfidence,
  locked,
  canCheck,
  failed,
  onRetry,
}: {
  confidence: Confidence | null
  onConfidence: (c: Confidence) => void
  locked: boolean
  canCheck: boolean
  failed: boolean
  onRetry: () => void
}) {
  return (
    // A preceding form holding [data-compact-dock] (cloze, keyboard up) gets 8px padding and gap, no safe-area inset.
    <div className="sticky bottom-0 -mx-4 flex flex-col gap-3 border-t border-border bg-surface-page px-4 pt-3 pb-[max(0.75rem,env(safe-area-inset-bottom))] [form:has([data-compact-dock])~&]:gap-2 [form:has([data-compact-dock])~&]:pt-2 [form:has([data-compact-dock])~&]:pb-2">
      <fieldset disabled={locked} aria-busy={locked} className="min-w-0">
        <ConfidencePicker value={confidence} onChange={onConfidence} />
      </fieldset>
      {failed ? (
        <Button key="retry" type="button" size="lg" autoFocus className="w-full" onClick={onRetry}>
          <RotateCw aria-hidden /> Try again
        </Button>
      ) : (
        <Button key="check" type="submit" form="play" size="lg" disabled={!canCheck} className="w-full">
          Check
        </Button>
      )}
    </div>
  )
}
