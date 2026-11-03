import { useRef } from 'react'
import { View, type Text as NativeText } from 'react-native'
import type { Reveal } from '@learnquiz/api'
import { revealCopy, revealModel } from '@learnquiz/api/reveal'
import { quickResult } from '../../lib/quick-result'
import type { RevealPair } from '../../lib/wrong-reveal'
import { useTheme } from '../../theme/ThemeProvider'
import { Card } from '../ui/Card'
import { useHeadingFocus } from '../ui/Screen'
import { Text } from '../ui/Text'
import { AnswerPair } from '../reveal/answer-pair'
import { CriticalRow } from '../reveal/critical-row'
import { PartialLines } from '../reveal/partial-lines'
import { ResultBand } from '../reveal/result-band'
import { SourceQuote } from '../reveal/source-quote'

export type QuickResultProps = {
  reveal: Reveal
  chosenText: string
  reviewsLeft: number | null
  hasCompany?: boolean
}

/** Inline result for the one-question quick session. The route owns the frame, dock and report sheet. */
export function QuickResult({ reveal, chosenText, reviewsLeft, hasCompany = false }: QuickResultProps) {
  const { space } = useTheme()
  const headingRef = useRef<NativeText>(null)
  useHeadingFocus(headingRef)
  const result = quickResult(reveal, chosenText, reviewsLeft)
  const model = revealModel(reveal, { hasCompany })
  const graded = reveal.state !== 'ungraded'
  const miss = graded && !reveal.correct
  const partial = model.variant === 'partial'
  const answerPair: RevealPair = { tone: 'correct', label: revealCopy.theAnswer, kind: 'text', value: result.answer }
  const chosenPair: RevealPair = { tone: 'wrong', label: revealCopy.youChose, kind: 'text', value: result.chosen }

  return (
    <View style={{ gap: space[4] }}>
      <Text
        ref={headingRef}
        header
        style={{ position: 'absolute', width: 1, height: 1, opacity: 0 }}
      >
        Quick question done
      </Text>
      <Card style={{ paddingHorizontal: 0, paddingVertical: 0, overflow: 'hidden' }}>
        <View accessibilityLiveRegion="polite">
          <ResultBand model={model} compact />
        </View>
        <View style={{ gap: space[4], padding: space[4] }}>
          {graded ? (
            miss || partial ? (
              <>
                <AnswerPair pair={answerPair} />
                <AnswerPair pair={chosenPair} note={result.why} />
                {partial && model.partialLines.length ? (
                  <PartialLines lines={model.partialLines} options={reveal.detail?.kind === 'multi' ? reveal.detail.options : []} />
                ) : null}
              </>
            ) : (
              <Text variant="bodyLg">{result.answer}</Text>
            )
          ) : (
            <>
              <View style={{ gap: space[1] }}>
                <Text variant="caption" muted>{revealCopy.yourAnswer}</Text>
                <Text variant="bodyLg">{result.chosen}</Text>
              </View>
              <View style={{ gap: space[1] }}>
                <Text variant="caption" muted>{revealCopy.theAnswer}</Text>
                <Text variant="bodyLg">{result.answer}</Text>
              </View>
              {reveal.feedback ? <Text>{reveal.feedback}</Text> : null}
            </>
          )}
          {reveal.state === 'D' && reveal.critical ? <CriticalRow /> : null}
        </View>
      </Card>
      {reveal.sourceQuote !== null ? (
        <SourceQuote quote={reveal.sourceQuote} sourceTitle={reveal.sourceTitle} sourceVersion={reveal.sourceVersion} />
      ) : (
        <Text muted>{hasCompany ? 'Not quoted from your SOP' : 'Not quoted from a source'}</Text>
      )}
      {result.counter !== null ? (
        <Text variant="label" num muted>{result.counter}</Text>
      ) : null}
    </View>
  )
}
