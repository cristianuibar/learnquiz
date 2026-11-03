import { useState, type Ref } from 'react'
import { Pressable, View, type NativeSyntheticEvent, type PressableProps } from 'react-native'
import { Check, X } from 'lucide-react-native'
import { useTheme } from '../../theme/ThemeProvider'
import { Text } from '../ui/Text'

export type OptionRowProps = Omit<PressableProps, 'children'> & {
  ref?: Ref<View>
  children: string
  variant: 'radio' | 'check'
  selected: boolean
  mark?: 'correct' | 'wrong' | 'rest' | null
  onKeyDown?(event: NativeSyntheticEvent<{ key: string }>): void
}

export function OptionRow({ ref, children, variant, selected, mark, disabled, style, onFocus, onBlur, onKeyDown, ...props }: OptionRowProps) {
  const { colors, space, radius, sizes } = useTheme()
  const [focused, setFocused] = useState(false)
  const unavailable = !!disabled || mark != null
  const feedback = mark === 'correct' ? colors.feedbackCorrect : mark === 'wrong' ? colors.feedbackWrong : undefined
  const label = mark === 'correct' ? 'Correct' : mark === 'wrong' ? 'Not quite' : undefined
  const FeedbackIcon = mark === 'wrong' ? X : Check
  const indicatorSize = space[4] + space[1]
  // A marked check row keeps its square (chosen or not) and shows the feedback icon beside the word.
  const keepBox = variant === 'check'

  return (
    <Pressable
      {...props}
      ref={ref}
      accessible
      accessibilityRole={variant === 'radio' ? 'radio' : 'checkbox'}
      accessibilityLabel={label ? `${children}, ${label}` : children}
      accessibilityState={{ checked: selected, disabled: !!disabled && mark == null }}
      disabled={unavailable}
      focusable={!unavailable && props.tabIndex !== -1}
      tabIndex={unavailable ? -1 : props.tabIndex}
      onFocus={(event) => { setFocused(true); onFocus?.(event) }}
      onBlur={(event) => { setFocused(false); onBlur?.(event) }}
      {...{ onKeyDown: unavailable ? undefined : onKeyDown }}
      style={(state) => [{
        minHeight: sizes.topbarH,
        minWidth: sizes.target,
        paddingVertical: space[3],
        paddingHorizontal: space[4],
        flexDirection: 'row',
        flexWrap: 'wrap',
        alignItems: 'center',
        gap: space[3],
        borderWidth: 2,
        borderRadius: radius.md,
        borderColor: feedback ?? (mark === 'rest' ? colors.border : selected ? colors.brand : colors.borderStrong),
        backgroundColor: mark === 'correct' ? colors.feedbackCorrectTint : mark === 'wrong' ? colors.feedbackWrongTint : state.pressed ? colors.surfaceSunken : selected && !mark ? colors.brandTint : colors.surfaceCard,
        outlineWidth: focused ? 2 : 0,
        outlineOffset: 2,
        outlineColor: colors.brand,
      }, typeof style === 'function' ? style(state) : style]}
    >
      {feedback && !keepBox ? <FeedbackIcon size={indicatorSize} color={feedback} strokeWidth={2} accessible={false} /> : (
        <View testID={variant === 'check' ? (selected ? 'check-box-checked' : 'check-box-empty') : undefined} style={{
          width: indicatorSize,
          height: indicatorSize,
          borderWidth: 2,
          borderRadius: variant === 'radio' ? radius.full : radius.sm,
          borderColor: selected && !mark ? colors.brand : colors.borderStrong,
          backgroundColor: selected && variant === 'check' && !mark ? colors.brand : undefined,
          alignItems: 'center',
          justifyContent: 'center',
        }}>
          {selected && variant === 'radio' && <View style={{ width: space[2] + space[1], height: space[2] + space[1], borderRadius: radius.full, backgroundColor: mark ? colors.inkMuted : colors.brand }} />}
          {selected && variant === 'check' && <Check size={space[4]} color={mark ? colors.inkMuted : colors.onBrand} strokeWidth={2} accessible={false} />}
        </View>
      )}
      <Text variant="bodyLg" muted={mark === 'rest'} style={{ flex: 1 }}>{children}</Text>
      {feedback && keepBox && <FeedbackIcon size={indicatorSize} color={feedback} strokeWidth={2} accessible={false} />}
      {label && <Text variant="label" style={{ color: feedback }}>{label}</Text>}
    </Pressable>
  )
}
