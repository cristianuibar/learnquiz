import { View } from 'react-native'
import { FileText } from 'lucide-react-native'
import { useTheme } from '../../theme/ThemeProvider'
import { Text } from '../ui/Text'

export type SourceQuoteProps = { quote: string; sourceTitle: string | null; sourceVersion: number | null }

export function SourceQuote({ quote, sourceTitle, sourceVersion }: SourceQuoteProps) {
  const { colors, space, radius } = useTheme()
  const caption = sourceTitle === null ? null : sourceVersion === null ? sourceTitle : `${sourceTitle} · v${sourceVersion}`

  return (
    <View
      accessible
      accessibilityLabel={caption === null ? `Quote: ${quote}` : `Quote: ${quote}, ${caption}`}
      style={{ gap: space[2], paddingVertical: space[3], paddingHorizontal: space[4], borderRadius: radius.md, backgroundColor: colors.surfaceSunken }}
    >
      <Text>{`“${quote}”`}</Text>
      {caption === null ? null : (
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: space[1] }}>
          <FileText size={space[4]} strokeWidth={2} color={colors.inkMuted} accessible={false} />
          <Text variant="caption" style={{ flex: 1, color: colors.inkMuted }}>{caption}</Text>
        </View>
      )}
    </View>
  )
}
