import { View } from 'react-native'
import { revealCopy } from '@learnquiz/api/reveal'
import { useTheme } from '../../theme/ThemeProvider'
import { Text } from '../ui/Text'
import { SourceQuote } from './source-quote'
import type { RevealBodyProps } from './types'

/** Placeholder until its reveal issue replaces it. */
export function PartialBody({ reveal }: RevealBodyProps) {
  const { space } = useTheme()
  return (
    <View style={{ gap: space[4], padding: space[4] }}>
      <View style={{ gap: space[1] }}>
        <Text variant="caption" muted>{revealCopy.theAnswer}</Text>
        <Text variant="bodyLg">{reveal.correctAnswer}</Text>
      </View>
      <Text>{reveal.explanation}</Text>
      {reveal.sourceQuote === null ? null : <SourceQuote quote={reveal.sourceQuote} sourceTitle={reveal.sourceTitle} sourceVersion={reveal.sourceVersion} />}
    </View>
  )
}
