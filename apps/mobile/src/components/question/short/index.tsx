import { View } from 'react-native'
import { useTheme } from '../../../theme/ThemeProvider'
import { TextField } from '../../ui/TextField'
import { DiagramImage } from '../diagram-image'
import type { QuestionBodyProps } from '../types'

const MAX_ANSWER_LENGTH = 1000

export function ShortBody({ item, answer, onAnswer, marks, disabled }: QuestionBodyProps) {
  const { colors, space } = useTheme()
  const readOnly = disabled || marks !== null

  return (
    <View style={{ gap: space[3] }}>
      {item.image && <DiagramImage image={item.image} />}
      <TextField
        label="Your answer"
        value={answer.text ?? ''}
        onChangeText={(text) => onAnswer({ text })}
        editable={!readOnly}
        multiline
        numberOfLines={4}
        maxLength={MAX_ANSWER_LENGTH}
        autoCapitalize="sentences"
        importantForAutofill="no"
        textAlignVertical="top"
        style={readOnly ? { backgroundColor: colors.surfaceSunken, borderColor: colors.border } : undefined}
      />
    </View>
  )
}
