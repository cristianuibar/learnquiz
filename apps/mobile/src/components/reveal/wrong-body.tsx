import { View } from 'react-native'
import { revealCopy } from '@learnquiz/api/reveal'
import { wrongReveal, wrongRevealCopy } from '../../lib/wrong-reveal'
import { useTheme } from '../../theme/ThemeProvider'
import { Text } from '../ui/Text'
import { RetryIcon } from '../ui/icons'
import { AnswerPair } from './answer-pair'
import { CriticalRow } from './critical-row'
import { ReflectionField } from './reflection-field'
import { SourceQuote } from './source-quote'
import type { RevealBodyProps } from './types'

export function WrongBody({ model, reveal, item, answer, reflection, onReflection }: RevealBodyProps) {
  const { colors, space } = useTheme()
  const variant = model.variant === 'sureWrong' ? 'sureWrong' : 'notQuite'
  const view = wrongReveal(reveal, item, answer, variant)

  return (
    <View style={{ gap: space[4], padding: space[4] }}>
      {view.pairs.map((pair, i) => (
        <AnswerPair key={pair.label} pair={pair} note={i === view.pairs.length - 1 ? view.note : null} />
      ))}
      {view.feedback ? <Text>{view.feedback}</Text> : null}
      {view.missingPoints.length ? (
        <View style={{ gap: space[1] }}>
          <Text variant="label" header>{wrongRevealCopy.missingPoints}</Text>
          {view.missingPoints.map((point, i) => <Text key={i}>{`• ${point}`}</Text>)}
        </View>
      ) : null}
      {view.critical ? <CriticalRow /> : null}
      {view.whyItFeltRight ? (
        <View style={{ gap: space[1] }}>
          {view.whyItFeltRight.heading === null ? null : <Text variant="label" header>{view.whyItFeltRight.heading}</Text>}
          {view.whyItFeltRight.lines.map((line, i) => <Text key={i}>{line}</Text>)}
        </View>
      ) : null}
      {view.whatActuallyMatters ? (
        <View style={{ gap: space[1] }}>
          <Text variant="label" header>{revealCopy.whatActuallyMatters}</Text>
          <Text>{view.whatActuallyMatters}</Text>
        </View>
      ) : null}
      {variant === 'sureWrong' ? <ReflectionField value={reflection} onChangeText={onReflection} /> : null}
      {reveal.sourceQuote === null ? null : <SourceQuote quote={reveal.sourceQuote} sourceTitle={reveal.sourceTitle} sourceVersion={reveal.sourceVersion} />}
      {view.returnsThisSession ? (
        <View accessible accessibilityLabel={revealCopy.returnsThisSession} style={{ flexDirection: 'row', alignItems: 'center', gap: space[2] }}>
          <RetryIcon size={space[4] + space[1]} color={colors.inkMuted} />
          <Text muted style={{ flex: 1 }}>{revealCopy.returnsThisSession}</Text>
        </View>
      ) : null}
    </View>
  )
}
