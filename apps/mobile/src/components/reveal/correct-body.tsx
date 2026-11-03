import { View } from 'react-native'
import { Info } from 'lucide-react-native'
import { revealCopy } from '@learnquiz/api/reveal'
import { useTheme } from '../../theme/ThemeProvider'
import { Text } from '../ui/Text'
import { SourceQuote } from './source-quote'
import { WhyDisclosure } from './why-disclosure'
import type { RevealBodyProps } from './types'

export function CorrectBody({ model, reveal, item, answer }: RevealBodyProps) {
  const { colors, space } = useTheme()
  const outer = { gap: space[4], padding: space[4] }

  if (model.variant === 'ungraded') {
    return (
      <View style={outer}>
        <View style={{ gap: space[1] }}>
          <Text variant="caption" muted>{revealCopy.yourAnswer}</Text>
          <Text variant="bodyLg">{answer.text}</Text>
        </View>
        <View style={{ gap: space[1] }}>
          <Text variant="caption" muted>{revealCopy.theAnswer}</Text>
          <Text variant="bodyLg">{reveal.correctAnswer}</Text>
        </View>
        {reveal.feedback === null ? null : <Text>{reveal.feedback}</Text>}
      </View>
    )
  }

  const explanation = <Text>{reveal.explanation}</Text>
  const quote = reveal.sourceQuote === null ? null : (
    <SourceQuote quote={reveal.sourceQuote} sourceTitle={reveal.sourceTitle} sourceVersion={reveal.sourceVersion} />
  )

  if (model.variant === 'correctSure') {
    return (
      <View style={outer}>
        <Text variant="bodyLg">{reveal.correctAnswer}</Text>
        <WhyDisclosure key={reveal.attemptId ?? item.id} openByDefault={model.openByDefault}>
          {explanation}
          {quote}
        </WhyDisclosure>
      </View>
    )
  }

  return (
    <View style={outer}>
      <Text variant="bodyLg">{reveal.correctAnswer}</Text>
      {explanation}
      {model.variant === 'noSource' ? (
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: space[2] }}>
          <Info size={space[4]} color={colors.inkMuted} accessible={false} />
          <Text variant="caption" muted style={{ flex: 1 }}>{model.noQuoteLine}</Text>
        </View>
      ) : quote}
    </View>
  )
}
