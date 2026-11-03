import { View, type ColorValue, type ViewProps } from 'react-native'
import { useTheme } from '../../theme/ThemeProvider'

export type BarProps = ViewProps & {
  value: number
  size?: 'md' | 'lg'
  benchmark?: number
  before?: number
  estimate?: boolean
  outline?: boolean
  color?: ColorValue
}

function percent(value: number) {
  return Number.isFinite(value) ? Math.min(100, Math.max(0, value)) : 0
}

export function Bar({ value, size = 'md', benchmark, before, estimate, outline, color, style, accessible = true, accessibilityValue, ...props }: BarProps) {
  const { colors, space, radius } = useTheme()
  const current = percent(value)
  const previous = before === undefined ? undefined : percent(before)
  const fill = color ?? (outline ? colors.onBrand : colors.brand)
  return (
    <View
      {...props}
      accessible={accessible}
      accessibilityRole={accessible ? 'progressbar' : undefined}
      accessibilityElementsHidden={!accessible}
      importantForAccessibility={accessible ? 'auto' : 'no-hide-descendants'}
      accessibilityValue={accessible ? { min: 0, max: 100, now: current, ...accessibilityValue } : undefined}
      style={[{
        height: size === 'lg' ? space[3] : space[2],
        borderRadius: radius.full,
        backgroundColor: outline ? undefined : colors.surfaceSunken,
        borderWidth: outline ? 1 : 0,
        borderColor: fill,
      }, style]}
    >
      {estimate ? (
        <View style={{
          position: 'absolute', top: 0, bottom: 0, left: 0,
          width: `${current}%`,
          borderWidth: 2,
          borderStyle: 'dashed',
          borderColor: colors.inkMuted,
          borderRadius: radius.full,
        }} />
      ) : (
        <>
          <View style={{
            position: 'absolute', top: 0, bottom: 0, left: 0,
            width: `${current}%`,
            borderRadius: radius.full,
            backgroundColor: previous === undefined ? fill : colors.inkMuted,
          }} />
          {previous !== undefined && current > previous && (
            <View style={{
              position: 'absolute', top: 0, bottom: 0,
              left: `${previous}%`,
              width: `${current - previous}%`,
              borderTopRightRadius: radius.full,
              borderBottomRightRadius: radius.full,
              backgroundColor: fill,
            }} />
          )}
        </>
      )}
      {benchmark !== undefined && (
        <View style={{
          position: 'absolute',
          top: -space[1], bottom: -space[1],
          left: `${percent(benchmark)}%`,
          width: 2,
          marginLeft: -1,
          borderRadius: 1,
          backgroundColor: colors.ink,
        }} />
      )}
    </View>
  )
}
