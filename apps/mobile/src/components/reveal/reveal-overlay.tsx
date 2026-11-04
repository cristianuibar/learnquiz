import { useCallback, useRef, useState } from 'react'
import { View } from 'react-native'
import type { Answer, Confidence, ItemView, Reveal } from '@learnquiz/api'
import { initialOverlay, overlayStep, reportAvailable, type ContinueRequest, type OverlayAction, type OverlayState } from '../../lib/session/overlay'
import type { Branding } from '../../lib/session-store'
import { Sheet } from '../sheet/sheet'
import { useReportSheet } from './report-sheet'
import { useRevealSheet } from './reveal-sheet'

export type RevealOverlayProps = {
  reveal: Reveal
  item: ItemView
  answer: Answer
  confidence: Confidence | null
  /** Calls `POST /next`; the caller owns the single pending flag. */
  onContinue(request: ContinueRequest): void
  busy: boolean
  error: string | null
  branding: Branding | null
  /** A back-to-basics session opens the explanation by default. */
  basics?: boolean
}

const consumeBack = () => true

/**
 * The reveal over the inert question. One Sheet stays mounted while Report
 * swaps in and back, so it never rises twice, and the result body stays
 * mounted (hidden) during Report so its Why state survives the round trip.
 * Key it by the reveal so a new question starts on the result.
 */
export function RevealOverlay({ reveal, item, answer, confidence, onContinue, busy, error, branding, basics }: RevealOverlayProps) {
  const [state, setState] = useState<OverlayState>(initialOverlay)
  const stateRef = useRef(state)
  const reportRef = useRef<View>(null)
  const onContinueRef = useRef(onContinue)
  onContinueRef.current = onContinue

  const dispatch = useCallback((action: OverlayAction) => {
    const step = overlayStep(stateRef.current, action)
    stateRef.current = step.state
    setState(step.state)
    if (step.advance) onContinueRef.current(step.advance)
  }, [])

  const onReport = useCallback(() => dispatch({ type: 'report' }), [dispatch])
  const onBack = useCallback(() => dispatch({ type: 'back' }), [dispatch])
  const onSent = useCallback(() => dispatch({ type: 'sent' }), [dispatch])

  const result = useRevealSheet({
    reveal,
    item,
    answer,
    confidence,
    reflection: state.reflection,
    onReflection: (text) => dispatch({ type: 'reflection', text }),
    onContinue: () => dispatch({ type: 'continue' }),
    onReport: reportAvailable(state, busy) ? onReport : undefined,
    busy,
    error,
    branding,
    basics,
    onBack: consumeBack,
    reportRef,
  })
  const report = useReportSheet({ itemId: item.id, attemptId: reveal.attemptId, onBack, onSent, branding })

  const reporting = state.mode === 'report'
  const focusRef = state.focus === 'heading' ? report.focusRef : state.focus === 'report' ? reportRef : result.bandRef

  return (
    <Sheet
      band={reporting ? report.band : result.band}
      body={
        <>
          <View style={{ display: reporting ? 'none' : 'flex' }}>{result.body}</View>
          {reporting ? report.body : null}
        </>
      }
      foot={reporting ? report.foot : result.foot}
      grabber={reporting ? report.grabber : result.grabber}
      onBack={reporting ? report.onBack : result.onBack}
      focusRef={focusRef}
    />
  )
}
