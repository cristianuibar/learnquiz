import { useRef } from 'react'
import { Platform, View, type NativeSyntheticEvent } from 'react-native'
import { useTheme } from '../../theme/ThemeProvider'
import { OptionRow } from '../session/OptionRow'
import { DiagramImage } from './diagram-image'
import type { QuestionBodyProps } from './types'

export function MultipleChoiceBody({ item, answer, onAnswer, marks, disabled }: QuestionBodyProps) {
  const { space } = useTheme()
  const refs = useRef<(View | null)[]>([])
  const active = Math.max(0, item.options.findIndex((option) => option.id === answer.optionId))

  function onKeyDown(event: NativeSyntheticEvent<{ key: string }>, index: number) {
    if (disabled || marks !== null) return
    const key = event.nativeEvent.key
    const direction = key === 'ArrowRight' || key === 'ArrowDown' ? 1 : key === 'ArrowLeft' || key === 'ArrowUp' ? -1 : 0
    if (!direction) return
    event.preventDefault()
    const next = (index + direction + item.options.length) % item.options.length
    onAnswer({ optionId: item.options[next].id })
    requestAnimationFrame(() => refs.current[next]?.focus())
  }

  return (
    <View style={{ gap: space[3] }}>
      {item.image && <DiagramImage image={item.image} />}
      <View accessible={false} accessibilityRole="radiogroup" accessibilityLabel={item.stem} style={{ gap: space[3] }}>
        {item.options.map((option, index) => (
          <OptionRow
            key={option.id}
            ref={(ref) => { refs.current[index] = ref }}
            variant="radio"
            selected={answer.optionId === option.id}
            mark={marks ? (marks[option.id] ?? 'rest') : undefined}
            disabled={disabled || marks !== null}
            tabIndex={Platform.OS === 'web' ? (index === active ? 0 : -1) : undefined}
            onPress={() => onAnswer({ optionId: option.id })}
            onKeyDown={Platform.OS === 'web' ? (event) => onKeyDown(event, index) : undefined}
          >
            {option.text}
          </OptionRow>
        ))}
      </View>
    </View>
  )
}
