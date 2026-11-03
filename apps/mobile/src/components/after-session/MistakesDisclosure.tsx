import { useEffect, useState } from 'react'
import { Pressable, View } from 'react-native'
import { useRouter } from 'expo-router'
import { ChevronDown, ChevronRight } from 'lucide-react-native'
import Animated, { Easing, useAnimatedStyle, useReducedMotion, useSharedValue, withTiming } from 'react-native-reanimated'
import { duration, easing } from '@learnquiz/tokens/native'
import { useTheme } from '../../theme/ThemeProvider'
import { Text } from '../ui/Text'

export type Mistake = { itemId: string; conceptName: string; wasSure: boolean }

export function MistakesDisclosure({ mistakes }: { mistakes: Mistake[] }) {
  const { colors, space, sizes } = useTheme()
  const router = useRouter()
  const reduceMotion = useReducedMotion()
  const [open, setOpen] = useState(false)
  const [focused, setFocused] = useState<string | null>(null)
  const rotation = useSharedValue(0)

  useEffect(() => {
    const target = open ? 180 : 0
    rotation.value = reduceMotion
      ? target
      : withTiming(target, { duration: duration.fast, easing: Easing.bezier(easing[0], easing[1], easing[2], easing[3]) })
  }, [open, reduceMotion, rotation])

  const chevronStyle = useAnimatedStyle(() => ({ transform: [{ rotate: `${rotation.value}deg` }] }))

  if (mistakes.length === 0) return null

  const outline = (isFocused: boolean) => ({
    outlineWidth: isFocused ? 2 : 0,
    outlineOffset: 2,
    outlineColor: colors.brand,
  })

  return (
    <View style={{ borderTopWidth: 1, borderBottomWidth: 1, borderColor: colors.border }}>
      <Pressable
        accessible
        focusable
        accessibilityRole="button"
        accessibilityState={{ expanded: open }}
        onPress={() => setOpen((value) => !value)}
        onFocus={() => setFocused('toggle')}
        onBlur={() => setFocused(null)}
        style={({ pressed }) => [{
          flexDirection: 'row',
          alignItems: 'center',
          gap: space[3],
          minHeight: sizes.target,
          backgroundColor: pressed ? colors.brandTint : undefined,
        }, outline(focused === 'toggle')]}
      >
        <Text variant="title3" num style={{ flex: 1 }}>{`Mistakes (${mistakes.length})`}</Text>
        <Animated.View style={chevronStyle}>
          <ChevronDown size={20} strokeWidth={2} color={colors.inkMuted} accessible={false} />
        </Animated.View>
      </Pressable>
      {open && (
        <View style={{ borderTopWidth: 1, borderTopColor: colors.border }}>
          {mistakes.map((mistake, index) => (
            <Pressable
              key={mistake.itemId}
              accessible
              focusable
              accessibilityRole="link"
              accessibilityLabel={`Review: ${mistake.conceptName}${mistake.wasSure ? '. You were sure' : ''}`}
              onPress={() => router.push({ pathname: '/play/quick/[itemId]', params: { itemId: mistake.itemId } })}
              onFocus={() => setFocused(mistake.itemId)}
              onBlur={() => setFocused(null)}
              style={({ pressed }) => [{
                flexDirection: 'row',
                alignItems: 'center',
                gap: space[3],
                minHeight: sizes.topbarH,
                paddingVertical: space[3],
                borderTopWidth: index === 0 ? 0 : 1,
                borderTopColor: colors.border,
                backgroundColor: pressed ? colors.brandTint : undefined,
              }, outline(focused === mistake.itemId)]}
            >
              <View style={{ flex: 1, gap: 2 }}>
                <Text variant="body">{mistake.conceptName}</Text>
                {mistake.wasSure && <Text variant="caption" muted>You were sure</Text>}
              </View>
              <ChevronRight size={20} color={colors.inkMuted} accessible={false} />
            </Pressable>
          ))}
        </View>
      )}
    </View>
  )
}
