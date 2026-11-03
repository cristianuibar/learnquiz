import { Button } from '@/components/ui/button'
import type { QuestionProps } from '@/components/question/question-screen'

export function UnsupportedQuestion({ busy, onEnd }: QuestionProps) {
  return (
    <div className="flex flex-col items-start gap-4">
      <p className="text-body text-ink">This question needs a newer version of the app.</p>
      <Button type="button" variant="secondary" disabled={busy} onClick={onEnd}>
        End session
      </Button>
    </div>
  )
}
