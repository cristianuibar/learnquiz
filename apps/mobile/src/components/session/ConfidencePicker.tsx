import { useRef, useState } from 'react'
import { Platform, Pressable, View, type NativeSyntheticEvent } from 'react-native'
import { Check } from 'lucide-react-native'
import type { Confidence } from '@learnquiz/api'
import { useTheme } from '../../theme/ThemeProvider'
import { Text } from '../ui/Text'

export type ConfidencePickerProps = {
  value: Confidence | null
  onChange(value: Confidence): void
  disabled?: boolean
  compact?: boolean
}

const choices = [
  { value: 'sure', label: 'Sure' },
  { value: 'unsure', label: 'Unsure' },
  { value: 'guess', label: 'Guessing' },
] as const

export function ConfidencePicker({ value, onChange, disabled = false, compact = false }: ConfidencePickerProps) {
  const { colors, space, radius, sizes } = useTheme()
  const refs = useRef<(View | null)[]>([])
  const [focused, setFocused] = useState<number | null>(null)
  const active = Math.max(0, choices.findIndex((choice) => choice.value === value))

  function onKeyDown(event: NativeSyntheticEvent<{ key: string }>, index: number) {
    if (disabled) return
    const key = event.nativeEvent.key
    const direction = key === 'ArrowRight' || key === 'ArrowDown' ? 1 : key === 'ArrowLeft' || key === 'ArrowUp' ? -1 : 0
    if (!direction) return
    event.preventDefault()
    const next = (index + direction + choices.length) % choices.length
    onChange(choices[next].value)
    requestAnimationFrame(() => refs.current[next]?.focus())
  }

  return (
    <View style={{ gap: compact ? space[1] : space[2] }}>
      <Text variant="caption" muted>How sure are you?</Text>
      <View accessible={false} accessibilityRole="radiogroup" accessibilityLabel="How sure are you?" style={{ flexDirection: 'row', gap: space[2] }}>
        {choices.map((choice, index) => {
          const selected = value === choice.value
          return (
            <Pressable
              key={choice.value}
              ref={(ref) => { refs.current[index] = ref }}
              accessible
              accessibilityRole="radio"
              accessibilityLabel={choice.label}
              accessibilityState={{ checked: selected, disabled }}
              disabled={disabled}
              focusable={!disabled}
              tabIndex={Platform.OS === 'web' ? (!disabled && index === active ? 0 : -1) : undefined}
              onPress={() => onChange(choice.value)}
              onFocus={() => setFocused(index)}
              onBlur={() => setFocused(null)}
              {...{ onKeyDown: Platform.OS === 'web' ? (event: NativeSyntheticEvent<{ key: string }>) => onKeyDown(event, index) : undefined }}
              style={({ pressed }) => ({
                flex: 1,
                minWidth: sizes.target,
                minHeight: sizes.target,
                paddingHorizontal: space[1],
                paddingVertical: space[2],
                flexDirection: 'row',
                alignItems: 'center',
                justifyContent: 'center',
                gap: space[1],
                borderWidth: 2,
                borderColor: selected ? colors.brand : colors.borderStrong,
                borderRadius: radius.md,
                backgroundColor: pressed ? colors.surfaceSunken : selected ? colors.brandTint : colors.surfaceCard,
                outlineWidth: focused === index ? 2 : 0,
                outlineOffset: 2,
                outlineColor: colors.brand,
              })}
            >
              {selected && <Check size={space[4]} color={colors.brand} strokeWidth={2} accessible={false} />}
              <Text variant="label" numberOfLines={1} style={{ color: disabled ? colors.inkMuted : colors.ink, flexShrink: 1 }}>{choice.label}</Text>
            </Pressable>
          )
        })}
      </View>
    </View>
  )
}
