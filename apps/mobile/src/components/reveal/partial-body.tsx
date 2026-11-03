import { View } from 'react-native'
import { RotateCw } from 'lucide-react-native'
import { revealCopy } from '@learnquiz/api/reveal'
import { useTheme } from '../../theme/ThemeProvider'
import { Text } from '../ui/Text'
import { PartialLines } from './partial-lines'
import { SourceQuote } from './source-quote'
import type { RevealBodyProps } from './types'

/** Multi-select partial credit: one line per option that was off, the quote, and the return line. */
export function PartialBody({ model, reveal }: RevealBodyProps) {
  const { colors, space } = useTheme()
  const options = reveal.detail?.kind === 'multi' ? reveal.detail.options : []

  return (
    <View style={{ gap: space[4], padding: space[4] }}>
      {model.partialLines.length ? <PartialLines lines={model.partialLines} options={options} /> : null}
      {reveal.sourceQuote === null ? null : <SourceQuote quote={reveal.sourceQuote} sourceTitle={reveal.sourceTitle} sourceVersion={reveal.sourceVersion} />}
      {reveal.returnsThisSession ? (
        <View accessible accessibilityLabel={revealCopy.returnsThisSession} style={{ flexDirection: 'row', alignItems: 'center', gap: space[2] }}>
          <RotateCw size={space[6] - space[1]} strokeWidth={2} color={colors.inkMuted} accessible={false} />
          <Text muted style={{ flex: 1 }}>{revealCopy.returnsThisSession}</Text>
        </View>
      ) : null}
    </View>
  )
}
