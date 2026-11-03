import { useEffect, useState } from 'react'
import type { ViewProps } from 'react-native'
import Animated, { Easing, useAnimatedStyle, useReducedMotion, useSharedValue, withTiming } from 'react-native-reanimated'
import { duration, easing } from '@learnquiz/tokens/native'
import { useTheme } from '../../theme/ThemeProvider'
import { StreakIcon } from './icons'
import { Text } from './Text'

export type StreakPillProps = ViewProps & {
  count: number
  variant?: 'quiet' | 'reward'
  popIn?: boolean
}

export function StreakPill({ count, variant = 'quiet', popIn = false, style, ...props }: StreakPillProps) {
  const { colors, space, radius } = useTheme()
  const reducedMotion = useReducedMotion()
  const [animate] = useState(popIn && !reducedMotion)
  const progress = useSharedValue(animate ? 0 : 1)
  const color = variant === 'reward' ? colors.onAccent : colors.ink
  const label = `${count} ${count === 1 ? 'day' : 'days'}`
  useEffect(() => {
    if (animate) progress.value = withTiming(1, { duration: duration.reveal, easing: Easing.bezier(...easing) })
  }, [animate, progress])
  const animatedStyle = useAnimatedStyle(() => ({
    opacity: progress.value,
    transform: [{ scale: 0.92 + 0.08 * progress.value }],
  }))
  return (
    <Animated.View
      {...props}
      accessible
      accessibilityRole="text"
      accessibilityLabel={props.accessibilityLabel ?? `${label} in a row`}
      style={[{
        alignSelf: 'flex-start',
        flexDirection: 'row',
        alignItems: 'center',
        gap: space[1],
        minHeight: space[8],
        paddingVertical: space[1],
        paddingLeft: space[2],
        paddingRight: space[3],
        borderRadius: radius.full,
        borderWidth: variant === 'quiet' ? 1 : 0,
        borderColor: colors.border,
        backgroundColor: variant === 'reward' ? colors.accent : colors.surfaceCard,
      }, style, animatedStyle]}
    >
      <StreakIcon size={space[4]} color={color} accessible={false} accessibilityElementsHidden importantForAccessibility="no-hide-descendants" />
      <Text accessible={false} variant="label" num style={{ color }}>{label}</Text>
    </Animated.View>
  )
}
