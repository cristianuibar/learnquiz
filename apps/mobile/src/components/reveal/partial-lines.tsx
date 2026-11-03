import { View } from 'react-native'
import { Check, X } from 'lucide-react-native'
import type { RevealModel } from '@learnquiz/api/reveal'
import { useTheme } from '../../theme/ThemeProvider'
import { Text } from '../ui/Text'

export type PartialLine = RevealModel['partialLines'][number]

/**
 * Splits a partial line into the option name, shown in 600, and the rest.
 * "Broken seal: needs sign-off." leads with "Broken seal:"; "Hazmat. You missed it."
 * and "Mixed-SKU was not needed." lead with the option text alone.
 */
export function splitPartialLine(text: string, optionText: string | undefined): { lead: string; rest: string } {
  if (!optionText || !text.startsWith(optionText)) return { lead: '', rest: text }
  const lead = text.charAt(optionText.length) === ':' ? `${optionText}:` : optionText
  return { lead, rest: text.slice(lead.length) }
}

export type PartialLinesProps = { lines: PartialLine[]; options: readonly { id: string; text: string }[] }

export function PartialLines({ lines, options }: PartialLinesProps) {
  const { colors, space, typography } = useTheme()
  const iconSize = space[6] - space[1]
  const iconOffset = (typography.bodyLg.lineHeight - iconSize) / 2

  return (
    <View style={{ gap: space[3] }}>
      {lines.map((line) => {
        const Icon = line.icon === 'check' ? Check : X
        const { lead, rest } = splitPartialLine(line.text, options.find((option) => option.id === line.id)?.text)
        return (
          <View key={line.id} accessible accessibilityLabel={line.text} style={{ flexDirection: 'row', alignItems: 'flex-start', gap: space[3] }}>
            <View style={{ marginTop: iconOffset }}>
              <Icon size={iconSize} strokeWidth={2} color={line.icon === 'check' ? colors.feedbackCorrect : colors.feedbackWrong} accessible={false} />
            </View>
            <Text variant="bodyLg" style={{ flex: 1 }}>
              {lead ? <Text variant="bodyLg" style={{ fontFamily: typography.labelLg.fontFamily }}>{lead}</Text> : null}
              {rest}
            </Text>
          </View>
        )
      })}
    </View>
  )
}
