import { useState, type Ref } from 'react'
import { Pressable, View } from 'react-native'
import { ChevronDown } from 'lucide-react-native'
import { Text } from '../ui/Text'
import { useTheme } from '@/theme/ThemeProvider'

export function TimeField({ label, value, onPress, disabled, ref }: { label: string; value: string; onPress(): void; disabled?: boolean; ref?: Ref<View> }) {
  const { colors, space, sizes, radius } = useTheme()
  const [focused, setFocused] = useState(false)
  return <View style={{ flex: 1, gap: space[1] }}>
    <Text variant="caption" muted>{label}</Text>
    <Pressable ref={ref} accessibilityRole="button" accessibilityLabel={`${label} ${value}`} disabled={disabled} accessibilityState={{ disabled }}
      onPress={onPress} onFocus={() => setFocused(true)} onBlur={() => setFocused(false)}
      style={{ minHeight: sizes.target, borderWidth: 2, borderColor: colors.borderStrong, borderRadius: radius.md,
        padding: space[3], backgroundColor: colors.surfaceCard, flexDirection: 'row', alignItems: 'center', gap: space[2],
        outlineWidth: focused ? 2 : 0, outlineOffset: 2, outlineColor: colors.brand }}>
      <Text variant="bodyLg" num style={{ flex: 1, lineHeight: space[6] }}>{value}</Text>
      <ChevronDown size={space[4] + space[1]} color={colors.inkMuted} accessible={false} />
    </Pressable>
  </View>
}
