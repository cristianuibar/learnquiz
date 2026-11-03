import type { Ref } from 'react'
import { View } from 'react-native'
import { Check, Info, X } from 'lucide-react-native'
import type { RevealModel } from '@learnquiz/api/reveal'
import { useTheme } from '../../theme/ThemeProvider'
import { StillLearningIcon } from '../ui/icons'
import { Text } from '../ui/Text'

export type ResultBandProps = { model: RevealModel; compact?: boolean; ref?: Ref<View> }

const icons = { correct: Check, wrong: X, learning: StillLearningIcon, neutral: Info } as const

export function ResultBand({ model, compact, ref }: ResultBandProps) {
  const { colors, space, radius } = useTheme()
  const tint = { correct: colors.feedbackCorrectTint, wrong: colors.feedbackWrongTint, learning: colors.feedbackLearningTint, neutral: colors.surfaceSunken }[model.tone]
  const solid = { correct: colors.feedbackCorrect, wrong: colors.feedbackWrong, learning: colors.feedbackLearning, neutral: colors.ink }[model.tone]
  const Icon = icons[model.tone]

  return (
    <View
      ref={ref}
      accessible
      accessibilityRole="header"
      accessibilityLabel={model.announcement}
      style={{
        flexDirection: 'row',
        alignItems: 'center',
        gap: space[3],
        paddingTop: compact ? space[3] : space[6],
        paddingBottom: compact ? space[3] : space[4],
        paddingHorizontal: space[4],
        backgroundColor: tint,
      }}
    >
      <View style={{ width: space[8], height: space[8], borderRadius: radius.full, alignItems: 'center', justifyContent: 'center', backgroundColor: solid }}>
        <Icon size={space[6] - space[1]} strokeWidth={2.5} color={colors.onFeedback} accessible={false} />
      </View>
      <Text variant="title2" style={{ flex: 1, color: solid }}>{model.heading}</Text>
      {model.xpText ? (
        <Text variant="label" num style={{ color: colors.inkMuted }}>{model.xpText}</Text>
      ) : model.counts ? (
        <Text variant="label" num style={{ color: solid }}>{model.counts}</Text>
      ) : null}
    </View>
  )
}
