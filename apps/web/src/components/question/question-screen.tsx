import type { ComponentType, Ref } from 'react'
import { ChoiceGroup } from '@/components/choice-group'
import { ClozeQuestion } from '@/components/question/cloze-question'
import { ErrorRow } from '@/components/question/error-row'
import { InlineError } from '@/components/inline-error'
import { MultiQuestion } from '@/components/question/multi-question'
import { OrderQuestion } from '@/components/question/order-question'
import { QuestionDock } from '@/components/question/question-dock'
import { ShortQuestion } from '@/components/question/short-question'
import { UnsupportedQuestion } from '@/components/question/unsupported-question'
import type { Confidence, ItemFormat, ItemView } from '@learnquiz/api'

export type QuestionProps = {
  item: ItemView
  sessionId: string
  voiceEnabled: boolean
  choice: string // option id (mcq) or typed text
  onChoice: (choice: string) => void
  busy: boolean
  voiceBusy: boolean
  onVoiceBusy: (busy: boolean) => void
  onEnd: () => void
}

function McqQuestion({ item, choice, onChoice }: QuestionProps) {
  return (
    <ChoiceGroup
      name="answer"
      legend={item.stem}
      legendClassName="sr-only"
      options={item.options}
      value={choice}
      onChange={onChoice}
      className="flex flex-col gap-3"
    />
  )
}

// Each format owns one file; a format added later replaces its entry's file only.
const FORMATS: Record<ItemFormat, ComponentType<QuestionProps>> = {
  mcq: McqQuestion,
  cloze: ClozeQuestion,
  short: ShortQuestion,
  multi: MultiQuestion,
  order: OrderQuestion,
}

export function QuestionScreen({
  headingRef,
  loading,
  confidence,
  onConfidence,
  canCheck,
  error,
  onCheck,
  ...props
}: QuestionProps & {
  headingRef: Ref<HTMLHeadingElement>
  loading: boolean
  confidence: Confidence | null
  onConfidence: (c: Confidence) => void
  canCheck: boolean
  error: { message: string; retry: () => void; ending?: boolean } | null
  onCheck: () => void
}) {
  const Body = FORMATS[props.item.format] ?? UnsupportedQuestion
  const answerable = Body !== UnsupportedQuestion
  // Locked while a check is in flight, so Try again resubmits exactly the answer on screen.
  const locked = loading || props.busy
  // A failed End session retries next to its message; only a failed check takes over the dock.
  const failedCheck = error && !error.ending ? error : null
  return (
    <>
      <form
        id="play"
        className="mt-6 flex flex-1 flex-col gap-6 pb-6"
        onSubmit={(e) => {
          e.preventDefault()
          onCheck()
        }}
      >
        <h1 ref={headingRef} tabIndex={-1} className="text-title-2 text-ink">
          {props.item.stem}
        </h1>
        <fieldset disabled={locked} aria-busy={locked} className="flex min-w-0 flex-col gap-6">
          {/* Controls get the lock themselves too: some browsers still dispatch pointer events through a disabled fieldset. */}
          <Body {...props} busy={locked} />
        </fieldset>
      </form>
      {error?.ending && (
        <div className="pb-3">
          <InlineError message={error.message} onRetry={error.retry} />
        </div>
      )}
      {answerable ? (
        <QuestionDock confidence={confidence} onConfidence={onConfidence} locked={locked} canCheck={canCheck} error={failedCheck?.message ?? null} onRetry={failedCheck?.retry ?? onCheck} />
      ) : (
        failedCheck && (
          <div className="pb-3">
            <ErrorRow message={failedCheck.message} />
          </div>
        )
      )}
    </>
  )
}
