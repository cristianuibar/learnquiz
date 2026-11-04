import { useState, type ComponentType, type ReactNode, type Ref } from 'react'
import { Pressable, type PressableProps, type View } from 'react-native'
import type { LucideProps } from 'lucide-react-native'
import { useTheme } from '../../theme/ThemeProvider'
import { Text } from './Text'

export type ButtonProps = Omit<PressableProps, 'children'> & {
  ref?: Ref<View>
  children: ReactNode
  variant?: 'primary' | 'secondary' | 'ghost' | 'accent'
  size?: 'md' | 'lg'
  busy?: boolean
  icon?: ComponentType<LucideProps>
}

export function Button({ children, variant = 'primary', size = 'md', busy, disabled, icon: Icon, style, onFocus, onBlur, ...props }: ButtonProps) {
  const { colors, space, radius, sizes } = useTheme()
  const [focused, setFocused] = useState(false)
  const unavailable = disabled || busy
  const color = unavailable ? colors.inkMuted : variant === 'primary' ? colors.onBrand : variant === 'accent' ? colors.onAccent : variant === 'ghost' ? colors.brand : colors.ink

  return (
    <Pressable
      {...props}
      accessible
      focusable
      accessibilityRole="button"
      accessibilityState={{ ...props.accessibilityState, disabled: !!unavailable, busy: !!busy }}
      disabled={!!unavailable}
      onFocus={(event) => { setFocused(true); onFocus?.(event) }}
      onBlur={(event) => { setFocused(false); onBlur?.(event) }}
      style={(state) => [
        {
          minHeight: size === 'lg' ? sizes.topbarH : sizes.target,
          minWidth: sizes.target,
          paddingVertical: space[3],
          paddingHorizontal: space[4],
          borderRadius: radius.md,
          alignItems: 'center',
          justifyContent: 'center',
          flexDirection: 'row',
          gap: space[2],
          backgroundColor: unavailable ? colors.surfaceSunken : variant === 'primary' ? (state.pressed ? colors.brandHover : colors.brand) : variant === 'accent' ? (state.pressed ? colors.accentHover : colors.accent) : variant === 'secondary' ? (state.pressed ? colors.surfaceSunken : colors.surfaceCard) : state.pressed ? colors.brandTint : undefined,
          borderWidth: unavailable || variant === 'secondary' ? 2 : 0,
          borderColor: colors.borderStrong,
          borderStyle: unavailable ? 'dashed' : 'solid',
          outlineWidth: focused ? 2 : 0,
          outlineOffset: 2,
          outlineColor: colors.brand,
        },
        typeof style === 'function' ? style(state) : style,
      ]}
    >
      {Icon && <Icon color={color} size={space[6]} strokeWidth={2} accessible={false} />}
      <Text variant={size === 'lg' ? 'labelLg' : 'label'} style={{ color, textAlign: 'center', flexShrink: 1 }}>{children}</Text>
    </Pressable>
  )
}
