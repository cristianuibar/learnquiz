import { useEffect, useRef, useState } from 'react'
import { Animated, Pressable, View } from 'react-native'
import { Text } from '../ui/Text'
import { useTheme } from '@/theme/ThemeProvider'
import { useReducedMotion } from 'react-native-reanimated'

export function SettingsSwitch({ checked, disabled, onChange }: { checked: boolean; disabled?: boolean; onChange(): void }) {
  const { colors, space, sizes } = useTheme()
  const reduced = useReducedMotion()
  const [focused, setFocused] = useState(false)
  const offset = useRef(new Animated.Value(checked ? 20 : 0)).current
  useEffect(() => {
    const animation = Animated.timing(offset, { toValue: checked ? 20 : 0, duration: reduced ? 0 : 150, useNativeDriver: true })
    animation.start()
    return () => animation.stop()
  }, [checked, reduced, offset])
  return (
    <Pressable accessible focusable accessibilityRole="switch" accessibilityLabel="Send me questions"
      accessibilityState={{ checked, disabled }} disabled={disabled} onPress={onChange}
      onFocus={() => setFocused(true)} onBlur={() => setFocused(false)}
      style={{ minHeight: sizes.target, flexDirection: 'row', alignItems: 'center', gap: space[3],
        outlineWidth: focused ? 2 : 0, outlineColor: colors.brand, outlineOffset: 2 }}>
      <Text variant="bodyLg" style={{ flex: 1 }} importantForAccessibility="no">Send me questions</Text>
      <View importantForAccessibility="no-hide-descendants" style={{ width: 52, minHeight: 32, padding: space[1], borderWidth: 2,
        borderRadius: 32, borderColor: checked ? colors.brand : colors.borderStrong, backgroundColor: checked ? colors.brand : colors.surfaceSunken }}>
        <Animated.View style={{ width: 20, minHeight: 20, borderRadius: 20, backgroundColor: checked ? colors.onBrand : colors.inkMuted, transform: [{ translateX: offset }] }} />
      </View>
    </Pressable>
  )
}
