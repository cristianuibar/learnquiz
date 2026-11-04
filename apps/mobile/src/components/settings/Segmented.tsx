import { useState } from 'react'
import { Pressable, useWindowDimensions, View } from 'react-native'
import { Check } from 'lucide-react-native'
import { Text } from '../ui/Text'
import { useTheme } from '@/theme/ThemeProvider'

export function Segment({ label, accessibilityLabel = label, selected, radio, onPress }: {
  label: string; accessibilityLabel?: string; selected: boolean; radio?: boolean; onPress(): void
}) {
  const { colors, space, radius, sizes, typography } = useTheme()
  // The check and its gap are part of a selected option's width, so it shows at every font scale (#669).
  const { fontScale } = useWindowDimensions()
  const [focused, setFocused] = useState(false)
  return (
    <Pressable accessible focusable accessibilityRole={radio ? 'radio' : 'togglebutton'} accessibilityLabel={accessibilityLabel}
      accessibilityState={{ checked: selected }}
      onPress={onPress} onFocus={() => setFocused(true)} onBlur={() => setFocused(false)}
      style={{ flexGrow: 1, flexBasis: 'auto', flexShrink: 0, minWidth: Math.max(sizes.target, label.length * typography.label.fontSize * fontScale + space[4] + (selected ? space[4] + space[1] : 0)), minHeight: sizes.target, borderWidth: 2,
        borderColor: selected ? colors.brand : colors.borderStrong, borderRadius: radius.md,
        backgroundColor: selected ? colors.brandTint : colors.surfaceCard, paddingHorizontal: space[1], paddingVertical: space[2],
        flexDirection: 'row', flexWrap: 'nowrap', alignItems: 'center', justifyContent: 'center', gap: space[1],
        outlineWidth: focused ? 2 : 0, outlineColor: colors.brand, outlineOffset: 2 }}>
      {selected && <Check size={space[4]} color={colors.ink} accessible={false} />}
      <Text variant="label" importantForAccessibility="no" style={{ flexShrink: 0 }}>{label}</Text>
    </Pressable>
  )
}
export function Segmented<T extends string>({ value, options, onChange }: {
  value: T; options: { value: T; label: string }[]; onChange(value: T): void
}) {
  const { space } = useTheme()
  // Keep the child radios individually reachable by TalkBack.
  return <View accessible={false} accessibilityRole="radiogroup" accessibilityLabel="Appearance" style={{ flexDirection: 'row', flexWrap: 'wrap', gap: space[2] }}>
    {options.map((option) => <Segment key={option.value} label={option.label} selected={option.value === value} radio onPress={() => onChange(option.value)} />)}
  </View>
}
