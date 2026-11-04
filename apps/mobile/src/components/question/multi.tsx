import { View } from 'react-native'
import { useTheme } from '../../theme/ThemeProvider'
import { multiRows, MULTI_CAPTION, toggleOption } from '../../lib/session/multi'
import { OptionRow } from '../session/OptionRow'
import { DiagramImage } from './diagram-image'
import type { QuestionBodyProps } from './types'

export function MultiBody({ item, answer, onAnswer, marks, disabled }: QuestionBodyProps) {
  const { space } = useTheme()
  const rows = multiRows(item.options, answer.optionIds, marks, disabled)

  return (
    <View style={{ gap: space[3] }}>
      {item.image && <DiagramImage image={item.image} />}
      <View accessible={false} role="group" accessibilityLabel={item.stem} accessibilityHint={MULTI_CAPTION} style={{ gap: space[3] }}>
        {rows.map((row) => (
          <OptionRow
            key={row.id}
            variant="check"
            selected={row.selected}
            mark={row.mark}
            disabled={row.disabled}
            onPress={() => onAnswer({ optionIds: toggleOption(item.options, answer.optionIds, row.id) })}
          >
            {row.text}
          </OptionRow>
        ))}
      </View>
    </View>
  )
}
