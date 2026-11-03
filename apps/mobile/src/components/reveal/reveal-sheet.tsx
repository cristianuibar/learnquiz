import { useEffect, useRef } from 'react'
import type { View } from 'react-native'
import { Flag } from 'lucide-react-native'
import type { Answer, Confidence, ItemView, Reveal } from '@learnquiz/api'
import { revealCopy, revealModel } from '@learnquiz/api/reveal'
import { resultHaptic } from '../../lib/haptics'
import { Sheet } from '../sheet/sheet'
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
  onReport(): void
  busy?: boolean
  error?: string | null
  branding?: unknown
  onBack?: () => boolean
}

const consumeBack = () => true

export function RevealSheet({ reveal, item, answer, reflection, onReflection, onContinue, onReport, busy, error, branding, onBack }: RevealSheetProps) {
  const model = revealModel(reveal, { hasCompany: branding != null })
  const bandRef = useRef<View>(null)
  const announced = useRef(false)

  useEffect(() => {
    if (announced.current) return
    announced.current = true
    if (model.tone === 'correct') resultHaptic('correct')
    else if (model.tone !== 'neutral') resultHaptic('miss')
  }, [model.tone])

  const Body = model.variant === 'notQuite' || model.variant === 'sureWrong' ? WrongBody : model.variant === 'partial' ? PartialBody : CorrectBody

  return (
    <Sheet
      band={<ResultBand model={model} ref={bandRef} />}
      body={<Body model={model} reveal={reveal} item={item} answer={answer} reflection={reflection} onReflection={onReflection} />}
      foot={
        <>
          {error ? <AlertRow>{error}</AlertRow> : null}
          <Button variant="primary" size="lg" busy={busy} onPress={onContinue}>{model.continueLabel}</Button>
          <LinkButton tone="muted" icon={Flag} onPress={onReport}>{revealCopy.report}</LinkButton>
        </>
      }
      focusRef={bandRef}
      onBack={onBack ?? consumeBack}
    />
  )
}
