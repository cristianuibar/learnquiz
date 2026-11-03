import { useState, type ComponentType, type ReactNode, type Ref } from 'react'
import { Pressable, type PressableProps, type View } from 'react-native'
import type { LucideProps } from 'lucide-react-native'
import { useTheme } from '../../theme/ThemeProvider'
import { Text } from './Text'

export type LinkButtonProps = Omit<PressableProps, 'children'> & {
  children: ReactNode
  tone?: 'brand' | 'muted'
  icon?: ComponentType<LucideProps>
  ref?: Ref<View>
}

export function LinkButton({ children, tone = 'brand', icon: Icon, style, onFocus, onBlur, ...props }: LinkButtonProps) {
  const { colors, space, sizes, radius } = useTheme()
  const [focused, setFocused] = useState(false)
  const color = tone === 'muted' ? colors.inkMuted : colors.brand
  return (
    <Pressable
      {...props}
      accessible
      focusable
      accessibilityRole="button"
      onFocus={(event) => { setFocused(true); onFocus?.(event) }}
      onBlur={(event) => { setFocused(false); onBlur?.(event) }}
      style={(state) => [
        {
          minHeight: sizes.target,
          minWidth: sizes.target,
          paddingHorizontal: space[2],
          flexDirection: 'row',
          alignItems: 'center',
          justifyContent: 'center',
          gap: space[1],
          borderRadius: radius.md,
          backgroundColor: state.pressed ? colors.brandTint : undefined,
          outlineWidth: focused ? 2 : 0,
          outlineOffset: 2,
          outlineColor: colors.brand,
        },
        typeof style === 'function' ? style(state) : style,
      ]}
    >
      {Icon && <Icon color={color} size={space[4]} strokeWidth={2} accessible={false} />}
      <Text variant="label" style={{ color, flexShrink: 1 }}>{children}</Text>
    </Pressable>
  )
}
