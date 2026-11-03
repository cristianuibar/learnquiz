import { View } from 'react-native'
import { Check, X } from 'lucide-react-native'
import { useTheme } from '../../theme/ThemeProvider'
import type { RevealPair } from '../../lib/wrong-reveal'
import { Text } from '../ui/Text'

export type AnswerPairProps = { pair: RevealPair; note?: string | null }

export function AnswerPair({ pair, note }: AnswerPairProps) {
  const { colors, space } = useTheme()
  const Icon = pair.tone === 'correct' ? Check : X
  const items = pair.kind === 'list' ? pair.items.map((text, i) => `${i + 1}. ${text}`) : null
  const spoken = items === null ? (pair.kind === 'text' ? pair.value : '') : items.join(', ')
  const label = `${pair.label}: ${spoken}${note ? `. ${note}` : ''}`

  return (
    <View accessible accessibilityLabel={label} style={{ flexDirection: 'row', gap: space[3], alignItems: 'flex-start' }}>
      <View style={{ marginTop: space[4] + space[1] }}>
        <Icon
          size={space[4] + space[1]}
          strokeWidth={2}
          color={pair.tone === 'correct' ? colors.feedbackCorrect : colors.feedbackWrong}
          accessible={false}
        />
      </View>
      <View style={{ flex: 1, minWidth: 0, gap: space[1] / 2 }}>
        <Text variant="caption" muted>{pair.label}</Text>
        {items === null ? (
          <Text variant="bodyLg">{pair.kind === 'text' ? pair.value : ''}</Text>
        ) : (
          <View style={{ gap: space[1] }}>
            {items.map((line, i) => <Text key={i} variant="bodyLg">{line}</Text>)}
          </View>
        )}
        {note ? <Text style={{ marginTop: space[1] }}>{note}</Text> : null}
      </View>
    </View>
  )
}
