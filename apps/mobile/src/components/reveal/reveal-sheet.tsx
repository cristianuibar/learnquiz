import { useEffect, useRef, type RefObject } from 'react'
import type { View } from 'react-native'
import { Flag } from 'lucide-react-native'
import type { Answer, Confidence, ItemView, Reveal } from '@learnquiz/api'
import { revealCopy, revealModel } from '@learnquiz/api/reveal'
import { resultHaptic } from '../../lib/haptics'
import { Sheet, type SheetProps } from '../sheet/sheet'
import { AlertRow } from '../ui/AlertRow'
import { Button } from '../ui/Button'
import { LinkButton } from '../ui/LinkButton'
import { CorrectBody } from './correct-body'
import { PartialBody } from './partial-body'
import { ResultBand } from './result-band'
import { WrongBody } from './wrong-body'

export type RevealSheetProps = {
  reveal: Reveal
  item: ItemView
  answer: Answer
  confidence: Confidence | null
  reflection: string
  onReflection(text: string): void
  onContinue(): void
  /** Omit to hide the Report link, for example once a report was sent. */
  onReport?: () => void
  busy?: boolean
  error?: string | null
  branding?: unknown
  /** A back-to-basics session opens the explanation by default. */
  basics?: boolean
  onBack?: () => boolean
  /** Ref on the Report link, so focus can return to it after Report. */
  reportRef?: RefObject<View | null>
}

const consumeBack = () => true

/** Result sheet slots, so a caller can swap other content onto the same mounted Sheet. */
export function useRevealSheet({ reveal, item, answer, reflection, onReflection, onContinue, onReport, busy, error, branding, basics, onBack, reportRef }: RevealSheetProps): SheetProps & { bandRef: RefObject<View | null> } {
  const model = revealModel(reveal, { hasCompany: branding != null, basics })
  const bandRef = useRef<View>(null)
  const announced = useRef(false)

  useEffect(() => {
    if (announced.current) return
    announced.current = true
    if (model.tone === 'correct') resultHaptic('correct')
    else if (model.tone !== 'neutral') resultHaptic('miss')
  }, [model.tone])

  const Body = model.variant === 'notQuite' || model.variant === 'sureWrong' ? WrongBody : model.variant === 'partial' ? PartialBody : CorrectBody

  return {
    band: <ResultBand model={model} ref={bandRef} />,
    body: <Body model={model} reveal={reveal} item={item} answer={answer} reflection={reflection} onReflection={onReflection} />,
    foot: (
      <>
        {error ? <AlertRow>{error}</AlertRow> : null}
        <Button variant="primary" size="lg" busy={busy} onPress={onContinue}>{model.continueLabel}</Button>
        {onReport ? <LinkButton ref={reportRef} tone="muted" icon={Flag} onPress={onReport}>{revealCopy.report}</LinkButton> : null}
      </>
    ),
    focusRef: bandRef,
    onBack: onBack ?? consumeBack,
    bandRef,
  }
}

export function RevealSheet(props: RevealSheetProps) {
  const { bandRef: _bandRef, ...slots } = useRevealSheet(props)
  return <Sheet {...slots} />
}
