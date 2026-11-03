import { View } from 'react-native'
import { useKeyboardState } from 'react-native-keyboard-controller'
import { useSafeAreaInsets } from 'react-native-safe-area-context'
import { isAnswerReady, type Answer, type Confidence, type ItemView } from '@learnquiz/api'
import { useTheme } from '../../theme/ThemeProvider'
import { CheckButton } from './CheckButton'
import { ConfidencePicker } from './ConfidencePicker'

export type QuestionDockProps = {
  item: ItemView
  answer: Answer
  confidence: Confidence | null
  onConfidenceChange(confidence: Confidence): void
  onSubmit(): void
  disabled?: boolean
  busy?: boolean
  mode?: 'check' | 'retry'
}

export function QuestionDock({ item, answer, confidence, onConfidenceChange, onSubmit, disabled = false, busy = false, mode = 'check' }: QuestionDockProps) {
  const { colors, space } = useTheme()
  const insets = useSafeAreaInsets()
  const compact = useKeyboardState((state) => state.isVisible)
  const ready = isAnswerReady(item.format, answer, item.options.length) && confidence !== null

  return (
    <View style={{
      paddingTop: compact ? space[2] : space[3],
      paddingHorizontal: compact ? space[2] : space[4],
      paddingBottom: compact ? space[2] : space[3] + Math.max(space[2], insets.bottom),
      gap: compact ? space[2] : space[3],
      backgroundColor: colors.surfacePage,
      borderTopWidth: 1,
      borderTopColor: colors.border,
    }}>
      <ConfidencePicker value={confidence} onChange={onConfidenceChange} disabled={disabled || busy} compact={compact} />
      <CheckButton mode={mode} format={item.format} disabled={disabled || !ready} busy={busy} onPress={onSubmit} />
    </View>
  )
}
