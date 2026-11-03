import { View, type ViewProps } from 'react-native'
import { Check, Lock } from 'lucide-react-native'
import { useTheme } from '../../theme/ThemeProvider'
import { CriticalIcon, StillLearningIcon } from './icons'
import { StatusMark } from './StatusMark'
import { Text } from './Text'

export type ChipProps = Omit<ViewProps, 'children'> & (
  | { variant: 'neutral'; children: string }
  | { variant: 'none' | 'mastered' | 'learning' | 'estimate' | 'critical' | 'locked'; children?: string }
)

export function Chip({ variant, children, style, ...props }: ChipProps) {
  const { colors, space, radius } = useTheme()
  const color = variant === 'mastered' ? colors.feedbackCorrect : variant === 'learning' ? colors.feedbackLearning : variant === 'critical' || variant === 'neutral' ? colors.ink : colors.inkMuted
  const labels = { none: 'Not started', mastered: 'Mastered', learning: 'Still learning', estimate: 'Estimate', critical: 'Critical', neutral: children, locked: 'Locked' }
  const label = children ?? labels[variant]
  const Icon = variant === 'mastered' ? Check : variant === 'learning' ? StillLearningIcon : variant === 'critical' ? CriticalIcon : variant === 'locked' ? Lock : undefined
  return (
    <View
      {...props}
      accessible
      accessibilityRole="text"
      accessibilityLabel={props.accessibilityLabel ?? label}
      style={[{
        alignSelf: 'flex-start',
        flexDirection: 'row',
        alignItems: 'center',
        gap: space[1],
        minHeight: space[6] + space[1],
        paddingVertical: space[1] / 2,
        paddingLeft: space[2],
        paddingRight: space[3],
        borderRadius: radius.full,
        borderWidth: 1,
        borderStyle: variant === 'estimate' ? 'dashed' : 'solid',
        borderColor: variant === 'critical' || variant === 'estimate' ? colors.borderStrong : variant === 'neutral' ? colors.border : color,
        backgroundColor: variant === 'mastered' ? colors.feedbackCorrectTint : variant === 'learning' ? colors.feedbackLearningTint : variant === 'critical' ? colors.surfaceCard : variant === 'estimate' ? undefined : colors.surfaceSunken,
      }, style]}
    >
      {variant === 'none' && <StatusMark accessible={false} style={{ width: space[4], height: space[4] }} />}
      {Icon && <Icon size={space[4]} color={color} strokeWidth={2} accessible={false} accessibilityElementsHidden importantForAccessibility="no-hide-descendants" />}
      <Text accessible={false} variant="chip" style={{ color, flexShrink: 1 }}>{label}</Text>
    </View>
  )
}
